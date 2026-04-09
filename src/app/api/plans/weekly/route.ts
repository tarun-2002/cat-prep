import { NextResponse } from "next/server";
import { getUserFromAuthHeader } from "@/lib/api-auth";
import { supabaseServer } from "@/lib/supabase/server";

type CreatePlanPayload = {
  week_start_date: string;
  week_end_date: string;
  subtopic_ids: string[];
};

function normalizeDateRange(startDateInput: string, endDateInput: string) {
  const start = new Date(startDateInput);
  const end = new Date(endDateInput);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreatePlanPayload | null;
  if (
    !payload ||
    typeof payload.week_start_date !== "string" ||
    typeof payload.week_end_date !== "string" ||
    !Array.isArray(payload.subtopic_ids) ||
    payload.subtopic_ids.length === 0
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const week = normalizeDateRange(payload.week_start_date, payload.week_end_date);
  if (!week) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const uniqueSubtopicIds = Array.from(
    new Set(payload.subtopic_ids.filter((item) => typeof item === "string" && item.length > 0)),
  );
  if (uniqueSubtopicIds.length === 0) {
    return NextResponse.json({ error: "At least one subtopic is required" }, { status: 400 });
  }

  const { data: upsertedPlan, error: upsertError } = await supabaseServer
    .from("weekly_plans")
    .upsert(
      {
        week_start_date: week.start,
        week_end_date: week.end,
        created_by: user.id,
      },
      { onConflict: "week_start_date" },
    )
    .select("id")
    .single();
  if (upsertError || !upsertedPlan) {
    return NextResponse.json({ error: upsertError?.message ?? "Failed to save plan" }, { status: 400 });
  }

  const { error: deleteItemsError } = await supabaseServer
    .from("weekly_plan_items")
    .delete()
    .eq("weekly_plan_id", upsertedPlan.id);
  if (deleteItemsError) {
    return NextResponse.json({ error: deleteItemsError.message }, { status: 400 });
  }

  const { error: insertItemsError } = await supabaseServer.from("weekly_plan_items").insert(
    uniqueSubtopicIds.map((subtopicId) => ({
      weekly_plan_id: upsertedPlan.id,
      subtopic_id: subtopicId,
    })),
  );
  if (insertItemsError) {
    return NextResponse.json({ error: insertItemsError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, weekly_plan_id: upsertedPlan.id });
}

export async function GET(request: Request) {
  const { user, error: authError } = await getUserFromAuthHeader(
    request.headers.get("authorization"),
  );
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("all") === "true") {
    const { data: plans, error: plansError } = await supabaseServer
      .from("weekly_plans")
      .select("*")
      .order("week_start_date", { ascending: false });
    if (plansError) {
      return NextResponse.json({ error: plansError.message }, { status: 400 });
    }

    const planIds = (plans ?? []).map((plan) => plan.id);
    const { data: planItems, error: planItemsError } = await supabaseServer
      .from("weekly_plan_items")
      .select("weekly_plan_id,subtopic_id,subtopics(id,title,topic_id,topics(id,title,section))")
      .in(
        "weekly_plan_id",
        planIds.length > 0 ? planIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (planItemsError) {
      return NextResponse.json({ error: planItemsError.message }, { status: 400 });
    }

    const grouped = new Map<string, typeof planItems>();
    for (const item of planItems ?? []) {
      const list = grouped.get(item.weekly_plan_id) ?? [];
      list.push(item);
      grouped.set(item.weekly_plan_id, list);
    }

    return NextResponse.json({
      plans: (plans ?? []).map((plan) => ({
        ...plan,
        items: grouped.get(plan.id) ?? [],
      })),
    });
  }

  const queryDate = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const { data: plan, error: planError } = await supabaseServer
    .from("weekly_plans")
    .select("*")
    .lte("week_start_date", queryDate)
    .gte("week_end_date", queryDate)
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 400 });
  }
  if (!plan) {
    return NextResponse.json({ plan: null });
  }

  const { data: items, error: itemsError } = await supabaseServer
    .from("weekly_plan_items")
    .select("subtopic_id,subtopics(id,title,topic_id,topics(id,title,section))")
    .eq("weekly_plan_id", plan.id);
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
  }

  const subtopicIds = (items ?? []).map((item) => item.subtopic_id);
  const { data: approvedRows, error: approvedError } = await supabaseServer
    .from("topic_submissions")
    .select("subtopic_id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .in("subtopic_id", subtopicIds.length > 0 ? subtopicIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("approved_at", `${plan.week_start_date}T00:00:00.000Z`)
    .lte("approved_at", `${plan.week_end_date}T23:59:59.999Z`);
  if (approvedError) {
    return NextResponse.json({ error: approvedError.message }, { status: 400 });
  }

  const approvedSet = new Set((approvedRows ?? []).map((row) => row.subtopic_id));
  const totalGoals = subtopicIds.length;
  const completedGoals = subtopicIds.filter((id) => approvedSet.has(id)).length;

  return NextResponse.json({
    plan: {
      id: plan.id,
      week_start_date: plan.week_start_date,
      week_end_date: plan.week_end_date,
      items: items ?? [],
      total_goals: totalGoals,
      completed_goals: completedGoals,
      remaining_goals: Math.max(0, totalGoals - completedGoals),
    },
  });
}
