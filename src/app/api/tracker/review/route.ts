import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

type ReviewPayload = {
  submission_id: string;
  approve: boolean;
  comment?: string;
};

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ReviewPayload | null;
  if (!payload || typeof payload.submission_id !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data: submission, error: submissionError } = await supabaseServer
    .from("topic_submissions")
    .select("*")
    .eq("id", payload.submission_id)
    .single();

  if (submissionError || !submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.user_id === user.id) {
    return NextResponse.json({ error: "You cannot review your own submission" }, { status: 403 });
  }
  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Submission is already finalized" }, { status: 409 });
  }

  const { data: existingReview } = await supabaseServer
    .from("submission_reviews")
    .select("id")
    .eq("submission_id", payload.submission_id)
    .eq("reviewer_id", user.id)
    .limit(1);
  if (existingReview && existingReview.length > 0) {
    return NextResponse.json({ error: "You have already reviewed this submission" }, { status: 409 });
  }

  const reviewStatus = payload.approve ? "approved" : "rejected";
  const { error: reviewError } = await supabaseServer.from("submission_reviews").insert({
    submission_id: payload.submission_id,
    reviewer_id: user.id,
    status: reviewStatus,
    comment: payload.comment ?? null,
  });
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 400 });
  }

  if (!payload.approve) {
    const { error: updateError } = await supabaseServer
      .from("topic_submissions")
      .update({ status: "rejected", rejection_reason: payload.comment ?? "Rejected by reviewer" })
      .eq("id", payload.submission_id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ status: "rejected" });
  }

  const { data: allReviews, error: allReviewsError } = await supabaseServer
    .from("submission_reviews")
    .select("status")
    .eq("submission_id", payload.submission_id);
  if (allReviewsError) {
    return NextResponse.json({ error: allReviewsError.message }, { status: 400 });
  }

  const approvedCount = (allReviews ?? []).filter((review) => review.status === "approved").length;
  if (approvedCount >= 1) {
    const { error: approveError } = await supabaseServer
      .from("topic_submissions")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", payload.submission_id);
    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 400 });
    }
    return NextResponse.json({ status: "approved" });
  }

  return NextResponse.json({ status: "pending", approvals: approvedCount });
}
