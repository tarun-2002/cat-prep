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

function parseSyllabusFile(filePath) {
  const rawText = fs.readFileSync(filePath, "utf8").trim();
  return JSON.parse(rawText);
}

function firstVideoUrl(subtopicMap) {
  for (const videos of Object.values(subtopicMap)) {
    if (Array.isArray(videos) && videos.length > 0 && typeof videos[0]?.url === "string") {
      return videos[0].url;
    }
  }
  return "https://www.youtube.com/results?search_query=cat";
}

function normalizeVideoLabel(video, fallbackIndex) {
  if (typeof video?.label === "string") return video.label;
  if (typeof video?.title === "string") return video.title;
  return `Video ${fallbackIndex}`;
}

async function main() {
  const section = (process.argv[2] ?? "").toUpperCase();
  const syllabusFileArg = process.argv[3] ?? "";
  if (!["QUANT", "DILR", "VARC"].includes(section)) {
    throw new Error("Usage: node scripts/import-section-syllabus.mjs <QUANT|DILR|VARC> <file>");
  }
  if (!syllabusFileArg) {
    throw new Error("Missing syllabus file path argument");
  }

  const root = process.cwd();
  loadEnv(path.join(root, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const filePath = path.isAbsolute(syllabusFileArg)
    ? syllabusFileArg
    : path.join(root, syllabusFileArg);
  const parsed = parseSyllabusFile(filePath);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Syllabus file must be an object");
  }

  const topEntries = Object.entries(parsed);
  if (topEntries.length === 0) {
    console.log("No data found.");
    return;
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
      .filter((topic) => topic.section === section)
      .map((topic) => [topic.title, topic.id]),
  );

  const stats = { topicsCreated: 0, subtopicsCreated: 0, videosCreated: 0 };

  let topicOrder = 1;
  for (const [topicTitle, subtopicMap] of topEntries) {
    if (!subtopicMap || typeof subtopicMap !== "object" || Array.isArray(subtopicMap)) {
      continue;
    }

    let topicId = topicMap.get(topicTitle);
    if (!topicId) {
      const { data: createdTopic, error: createTopicError } = await supabase
        .from("topics")
        .insert({
          section,
          title: topicTitle,
          study_link: firstVideoUrl(subtopicMap),
          display_order: topicOrder,
        })
        .select("id")
        .single();
      if (createTopicError) throw createTopicError;
      topicId = createdTopic.id;
      topicMap.set(topicTitle, topicId);
      stats.topicsCreated += 1;
    }
    topicOrder += 1;

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
      if (videosFetchError) throw videosFetchError;
      const existingUrls = new Set((existingVideos ?? []).map((item) => item.url));

      const videosToUpsert = [];
      let videoOrder = 1;
      for (const video of videos) {
        if (!video || typeof video !== "object") continue;
        const label = normalizeVideoLabel(video, videoOrder);
        const videoUrl = typeof video.url === "string" ? video.url : "";
        if (!videoUrl || existingUrls.has(videoUrl)) {
          videoOrder += 1;
          continue;
        }
        videosToUpsert.push({
          subtopic_id: subtopicId,
          label,
          url: videoUrl,
          display_order: videoOrder,
        });
        videoOrder += 1;
      }

      if (videosToUpsert.length > 0) {
        const { error: upsertError } = await supabase.from("videos").upsert(videosToUpsert, {
          onConflict: "subtopic_id,url",
          ignoreDuplicates: true,
        });
        if (upsertError) throw upsertError;
        stats.videosCreated += videosToUpsert.length;
      }

      subtopicOrder += 1;
    }
  }

  console.log(`Import completed for ${section}:`, stats);
}

main().catch((error) => {
  console.error("Import failed:", error.message ?? error);
  process.exit(1);
});
