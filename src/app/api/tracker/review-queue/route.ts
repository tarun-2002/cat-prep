import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pendingSubmissions, error } = await supabaseServer
    .from("topic_submissions")
    .select(
      "id,user_id,topic_id,subtopic_id,topic_questions_done,pyq_questions_done,topic_question_proof_urls,pyq_proof_urls,short_notes_urls,created_at,status,topics(title,section,study_link),subtopics(title)",
    )
    .eq("status", "pending")
    .neq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const ids = (pendingSubmissions ?? []).map((row) => row.id);
  const { data: reviews } = await supabaseServer
    .from("submission_reviews")
    .select("submission_id,reviewer_id,status")
    .in("submission_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const grouped = new Map<string, Array<{ reviewer_id: string; status: string }>>();
  for (const review of reviews ?? []) {
    const arr = grouped.get(review.submission_id) ?? [];
    arr.push({ reviewer_id: review.reviewer_id, status: review.status });
    grouped.set(review.submission_id, arr);
  }

  const filtered = (pendingSubmissions ?? []).filter((submission) => {
    const existing = grouped.get(submission.id) ?? [];
    return !existing.some((r) => r.reviewer_id === user.id);
  });

  const uniqueUserIds = Array.from(new Set(filtered.map((s) => s.user_id)));
  const emailByUserId = new Map<string, string>();
  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
      if (!error && data.user?.email) {
        emailByUserId.set(userId, data.user.email);
      }
    }),
  );

  return NextResponse.json({
    items: filtered.map((submission) => ({
      ...submission,
      submitter_email: emailByUserId.get(submission.user_id) ?? null,
      reviews: grouped.get(submission.id) ?? [],
    })),
  });
}
