import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    process.env[key] = value;
  }
}

function firstVideoUrl(subtopicMap) {
  for (const videos of Object.values(subtopicMap)) {
    if (Array.isArray(videos) && videos.length > 0 && typeof videos[0]?.url === "string") {
      return videos[0].url;
    }
  }
  return "https://www.youtube.com/results?search_query=cat+quant";
}

async function main() {
  const root = process.cwd();
  loadEnv(path.join(root, ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const syllabusPath = path.join(root, "quantsyllabus.json");
  const raw = JSON.parse(fs.readFileSync(syllabusPath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("quantsyllabus.json must be an object of topics");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingTopics, error: topicFetchError } = await supabase
    .from("topics")
    .select("id,title,section");
  if (topicFetchError) throw topicFetchError;

  const topicMap = new Map(
    (existingTopics ?? [])
      .filter((topic) => topic.section === "QUANT")
      .map((topic) => [topic.title, topic.id]),
  );

  const stats = { topicsCreated: 0, subtopicsCreated: 0, videosCreated: 0 };

  for (const [topicTitle, subtopicMap] of Object.entries(raw)) {
    if (!subtopicMap || typeof subtopicMap !== "object" || Array.isArray(subtopicMap)) {
      continue;
    }

    let topicId = topicMap.get(topicTitle);
    if (!topicId) {
      const { data: createdTopic, error: createTopicError } = await supabase
        .from("topics")
        .insert({
          section: "QUANT",
          title: topicTitle,
          study_link: firstVideoUrl(subtopicMap),
          display_order: 999,
        })
        .select("id")
        .single();
      if (createTopicError) throw createTopicError;
      topicId = createdTopic.id;
      topicMap.set(topicTitle, topicId);
      stats.topicsCreated += 1;
    }

    const { data: existingSubtopics, error: subtopicFetchError } = await supabase
      .from("subtopics")
      .select("id,title,topic_id")
      .eq("topic_id", topicId);
    if (subtopicFetchError) throw subtopicFetchError;
    const subtopicIdByTitle = new Map((existingSubtopics ?? []).map((item) => [item.title, item.id]));

    let subtopicOrder = 1;
    for (const [subtopicTitle, videos] of Object.entries(subtopicMap)) {
      if (!Array.isArray(videos)) continue;

      let subtopicId = subtopicIdByTitle.get(subtopicTitle);
      if (!subtopicId) {
        const { data: createdSubtopic, error: createSubtopicError } = await supabase
          .from("subtopics")
          .insert({
            topic_id: topicId,
            title: subtopicTitle,
            display_order: subtopicOrder,
          })
          .select("id")
          .single();
        if (createSubtopicError) throw createSubtopicError;
        subtopicId = createdSubtopic.id;
        subtopicIdByTitle.set(subtopicTitle, subtopicId);
        stats.subtopicsCreated += 1;
      }

      const { data: existingVideos, error: videosFetchError } = await supabase
        .from("videos")
        .select("url")
        .eq("subtopic_id", subtopicId);
      if (videosFetchError) {
        throw new Error(
          `${videosFetchError.message}. If videos table does not exist, run supabase-videos-migration.sql first.`,
        );
      }
      const existingUrls = new Set((existingVideos ?? []).map((item) => item.url));

      const videosToInsert = [];
      let videoOrder = 1;
      for (const video of videos) {
        if (!video || typeof video !== "object") continue;
        const label = typeof video.label === "string" ? video.label : `Video ${videoOrder}`;
        const videoUrl = typeof video.url === "string" ? video.url : "";
        if (!videoUrl || existingUrls.has(videoUrl)) {
          videoOrder += 1;
          continue;
        }
        videosToInsert.push({
          subtopic_id: subtopicId,
          label,
          url: videoUrl,
          display_order: videoOrder,
        });
        videoOrder += 1;
      }

      if (videosToInsert.length > 0) {
        const { error: insertVideosError } = await supabase
          .from("videos")
          .upsert(videosToInsert, {
            onConflict: "subtopic_id,url",
            ignoreDuplicates: true,
          });
        if (insertVideosError) throw insertVideosError;
        stats.videosCreated += videosToInsert.length;
      }

      subtopicOrder += 1;
    }
  }

  console.log("Import completed:", stats);
}

main().catch((error) => {
  console.error("Import failed:", error.message ?? error);
  process.exit(1);
});
