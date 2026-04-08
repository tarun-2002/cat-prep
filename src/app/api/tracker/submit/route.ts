import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

type SubmitPayload = {
  topic_id: string;
  subtopic_id: string;
  topic_questions_done: number;
  pyq_questions_done: number;
  topic_question_proof_urls: string[];
  pyq_proof_urls: string[];
  short_notes_urls: string[];
};

function isNonEmptyArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.startsWith("http"))
  );
}

function getMissingFields(payload: SubmitPayload) {
  const missing: string[] = [];
  if (!payload.topic_id) missing.push("topic_id");
  if (!payload.subtopic_id) missing.push("subtopic_id");
  if (!Number.isFinite(payload.topic_questions_done)) missing.push("topic_questions_done");
  if (!Number.isFinite(payload.pyq_questions_done)) missing.push("pyq_questions_done");
  if (!isNonEmptyArray(payload.topic_question_proof_urls)) {
    missing.push("topic_question_proof_urls");
  }
  if (!isNonEmptyArray(payload.pyq_proof_urls)) missing.push("pyq_proof_urls");
  if (!isNonEmptyArray(payload.short_notes_urls)) missing.push("short_notes_urls");
  return missing;
}

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SubmitPayload | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const {
    topic_id,
    subtopic_id,
    topic_questions_done,
    pyq_questions_done,
    topic_question_proof_urls,
    pyq_proof_urls,
    short_notes_urls,
  } = payload;

  const missingFields = getMissingFields(payload);
  if (typeof topic_id !== "string" || typeof subtopic_id !== "string" || missingFields.length > 0) {
    return NextResponse.json(
      {
        error:
          missingFields.length > 0
            ? `Missing required fields: ${missingFields.join(", ")}`
            : "Invalid topic_id",
      },
      { status: 400 },
    );
  }

  const { data: existingApproved } = await supabaseServer
    .from("topic_submissions")
    .select("id")
    .eq("user_id", user.id)
    .eq("subtopic_id", subtopic_id)
    .eq("status", "approved")
    .limit(1);
  if (existingApproved && existingApproved.length > 0) {
    return NextResponse.json(
      { error: "Subtopic already approved. Progress already counted." },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseServer
    .from("topic_submissions")
    .insert({
      user_id: user.id,
      topic_id,
      subtopic_id,
      topic_questions_done: Math.max(0, Math.floor(topic_questions_done)),
      pyq_questions_done: Math.max(0, Math.floor(pyq_questions_done)),
      topic_question_proof_urls,
      pyq_proof_urls,
      short_notes_urls,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ submission: data });
}
