import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_TOPICS } from "@/lib/topic-seed";
import type { SubmissionRow, SubtopicRow, TopicRow } from "@/lib/types";

type VideoRow = {
  id: string;
  subtopic_id: string;
  label: string;
  url: string;
  display_order: number;
};

async function ensureTopics() {
  const { data: existingTopics, error } = await supabaseServer
    .from("topics")
    .select("id")
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  if (existingTopics && existingTopics.length > 0) {
    return;
  }

  const rows = DEFAULT_TOPICS.map((topic, index) => ({
    section: topic.section,
    title: topic.title,
    study_link: topic.study_link,
    display_order: index + 1,
  }));

  const { error: insertError } = await supabaseServer.from("topics").insert(rows);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function ensureSubtopics() {
  const { data: topics, error: topicsError } = await supabaseServer
    .from("topics")
    .select("id,title");
  if (topicsError) {
    throw new Error(topicsError.message);
  }
  if (!topics || topics.length === 0) {
    return;
  }

  const topicIds = topics.map((topic) => topic.id);
  const { data: existingSubtopics, error: subtopicsError } = await supabaseServer
    .from("subtopics")
    .select("topic_id")
    .in("topic_id", topicIds);
  if (subtopicsError) {
    throw new Error(subtopicsError.message);
  }

  const withSubtopics = new Set((existingSubtopics ?? []).map((item) => item.topic_id));
  const missing = topics.filter((topic) => !withSubtopics.has(topic.id));
  if (missing.length === 0) {
    return;
  }

  const rows = missing.map((topic) => ({
    topic_id: topic.id,
    title: `${topic.title} - Core Practice`,
    display_order: 1,
  }));
  const { error: insertError } = await supabaseServer.from("subtopics").insert(rows);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function GET(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureTopics();
    await ensureSubtopics();

    const [
      { data: topics, error: topicsError },
      { data: subtopics, error: subtopicsError },
      { data: videos, error: videosError },
      { data: submissions, error: submissionsError },
      { data: pendingReviews, error: pendingReviewsError },
    ] =
      await Promise.all([
        supabaseServer
          .from("topics")
          .select("*")
          .order("section", { ascending: true })
          .order("display_order", { ascending: true }),
        supabaseServer
          .from("subtopics")
          .select("*")
          .order("display_order", { ascending: true }),
        supabaseServer
          .from("videos")
          .select("*")
          .order("display_order", { ascending: true }),
        supabaseServer
          .from("topic_submissions")
          .select("*")
          .eq("user_id", user.id),
        supabaseServer
          .from("topic_submissions")
          .select("id, topic_id, user_id, status")
          .eq("status", "pending")
          .neq("user_id", user.id),
      ]);

    if (topicsError || subtopicsError || videosError || submissionsError || pendingReviewsError) {
      const message =
        topicsError?.message ||
        subtopicsError?.message ||
        videosError?.message ||
        submissionsError?.message ||
        pendingReviewsError?.message;
      return NextResponse.json({ error: message ?? "Failed to load tracker" }, { status: 400 });
    }

    const typedTopics = (topics ?? []) as TopicRow[];
    const typedSubtopics = (subtopics ?? []) as SubtopicRow[];
    const typedVideos = (videos ?? []) as VideoRow[];
    const typedSubmissions = (submissions ?? []) as SubmissionRow[];
    const pending = pendingReviews ?? [];

    const approvedSubtopicIds = new Set(
      typedSubmissions
        .filter((item) => item.status === "approved" && item.subtopic_id)
        .map((item) => item.subtopic_id as string),
    );
    const latestBySubtopic = new Map<string, SubmissionRow>();
    for (const sub of typedSubmissions) {
      if (!sub.subtopic_id) continue;
      const current = latestBySubtopic.get(sub.subtopic_id);
      if (!current || new Date(sub.created_at).getTime() > new Date(current.created_at).getTime()) {
        latestBySubtopic.set(sub.subtopic_id, sub);
      }
    }

    const topicById = new Map(typedTopics.map((topic) => [topic.id, topic]));
    const subtopicsByTopic = new Map<string, SubtopicRow[]>();
    for (const subtopic of typedSubtopics) {
      const list = subtopicsByTopic.get(subtopic.topic_id) ?? [];
      list.push(subtopic);
      subtopicsByTopic.set(subtopic.topic_id, list);
    }

    const videosBySubtopic = new Map<string, VideoRow[]>();
    for (const video of typedVideos) {
      const list = videosBySubtopic.get(video.subtopic_id) ?? [];
      list.push(video);
      videosBySubtopic.set(video.subtopic_id, list);
    }

    const totalBySection = { QUANT: 0, DILR: 0, VARC: 0 };
    const approvedBySection = { QUANT: 0, DILR: 0, VARC: 0 };

    for (const subtopic of typedSubtopics) {
      const parentTopic = topicById.get(subtopic.topic_id);
      if (!parentTopic) continue;
      totalBySection[parentTopic.section] += 1;
      if (approvedSubtopicIds.has(subtopic.id)) {
        approvedBySection[parentTopic.section] += 1;
      }
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      topics: typedTopics.map((topic) => {
        const subtopicItems = (subtopicsByTopic.get(topic.id) ?? []).map((subtopic) => {
          const latest = latestBySubtopic.get(subtopic.id) ?? null;
          return {
            ...subtopic,
            completed: approvedSubtopicIds.has(subtopic.id),
            latest_submission: latest,
            videos: (videosBySubtopic.get(subtopic.id) ?? []).map((video) => ({
              id: video.id,
              label: video.label,
              url: video.url,
              display_order: video.display_order,
            })),
          };
        });
        return {
          ...topic,
          completed:
            subtopicItems.length > 0 && subtopicItems.every((subtopic) => subtopic.completed),
          subtopics: subtopicItems,
        };
      }),
      progress: {
        QUANT: totalBySection.QUANT ? Math.round((approvedBySection.QUANT / totalBySection.QUANT) * 100) : 0,
        DILR: totalBySection.DILR ? Math.round((approvedBySection.DILR / totalBySection.DILR) * 100) : 0,
        VARC: totalBySection.VARC ? Math.round((approvedBySection.VARC / totalBySection.VARC) * 100) : 0,
      },
      pending_reviews: pending,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to bootstrap tracker" },
      { status: 500 },
    );
  }
}
