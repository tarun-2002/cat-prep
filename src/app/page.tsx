"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardCheck,
  FileImage,
  FlaskConical,
  Layers3,
  Link2,
  LogOut,
  Sigma,
  UploadCloud,
  UserCircle2,
  Video,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { CatExamCountdown } from "@/components/cat-exam-countdown";
import { isoWeekFromDateOnly } from "@/lib/iso-week";
import { supabase } from "@/lib/supabase/client";

type Section = "QUANT" | "DILR" | "VARC";
type SubmissionState = "pending" | "approved" | "rejected";

type Topic = {
  id: string;
  section: Section;
  title: string;
  study_link: string;
  completed: boolean;
  subtopics: Array<{
    id: string;
    title: string;
    completed: boolean;
    latest_submission: { status: SubmissionState } | null;
    videos: Array<{
      id: string;
      label: string;
      url: string;
      display_order: number;
    }>;
  }>;
};

type ReviewQueueItem = {
  id: string;
  user_id: string;
  submitter_email: string | null;
  subtopic_id: string | null;
  topic_questions_done: number;
  pyq_questions_done: number;
  topic_question_proof_urls: string[];
  pyq_proof_urls: string[];
  short_notes_urls: string[];
  topics: { title: string; section: Section; study_link: string };
  subtopics: { title: string } | null;
  reviews: Array<{ reviewer_id: string; status: string }>;
};

type WeeklyPlan = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  week_number?: number;
  iso_week_year?: number;
  items: Array<{
    subtopic_id: string;
    subtopics: {
      id: string;
      title: string;
      topic_id: string;
      topics: { id: string; title: string; section: Section };
    };
  }>;
  total_goals: number;
  completed_goals: number;
  remaining_goals: number;
};

type WeeklyPlanListItem = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  week_number?: number;
  iso_week_year?: number;
  items: Array<{
    weekly_plan_id: string;
    subtopic_id: string;
    subtopics: {
      id: string;
      title: string;
      topic_id: string;
      topics: { id: string; title: string; section: Section };
    };
  }>;
};

type PlannerSubtopicOption = {
  id: string;
  title: string;
  topicId: string;
  topicTitle: string;
  section: Section;
};

type ProofForm = {
  topicQuestionsDone: string;
  pyqQuestionsDone: string;
  topicQuestionProofUrls: string[];
  pyqProofUrls: string[];
  shortNotesUrls: string[];
};

const INITIAL_FORM: ProofForm = {
  topicQuestionsDone: "",
  pyqQuestionsDone: "",
  topicQuestionProofUrls: [],
  pyqProofUrls: [],
  shortNotesUrls: [],
};

const SECTION_META: Record<Section, { icon: LucideIcon; accent: string }> = {
  QUANT: { icon: Sigma, accent: "from-blue-500 to-indigo-600" },
  DILR: { icon: Layers3, accent: "from-emerald-500 to-teal-600" },
  VARC: { icon: BookOpen, accent: "from-violet-500 to-purple-600" },
};

function StatusChip({ status }: { status: SubmissionState | null }) {
  if (!status) return <span className="rounded-full border px-2 py-1 text-xs text-gray-500">Not submitted</span>;
  if (status === "approved") {
    return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Approved</span>;
  }
  if (status === "rejected") {
    return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">Rejected</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Pending review</span>;
}

function formatPrettyDate(dateString: string) {
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return dateString;
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = date.toLocaleString("en-US", { month: "long" });
  const shortYear = date.toLocaleString("en-US", { year: "2-digit" });
  const weekday = date.toLocaleString("en-US", { weekday: "long" });
  return `${day}${suffix} ${month}'${shortYear} ${weekday}`;
}

function toDateOnlyLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekLabelFromPlan(plan: {
  week_start_date: string;
  week_number?: number;
  iso_week_year?: number;
}) {
  if (plan.week_number != null && plan.iso_week_year != null) {
    return { week: plan.week_number, isoYear: plan.iso_week_year };
  }
  return isoWeekFromDateOnly(plan.week_start_date);
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Record<Section, number>>({
    QUANT: 0,
    DILR: 0,
    VARC: 0,
  });
  const [proofForms, setProofForms] = useState<Record<string, ProofForm>>({});
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [activeSection, setActiveSection] = useState<Section>("QUANT");
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);
  const [openSubtopicId, setOpenSubtopicId] = useState<string | null>(null);
  const [isPlannerModalOpen, setIsPlannerModalOpen] = useState(false);
  const [isAllPlansModalOpen, setIsAllPlansModalOpen] = useState(false);
  const [isReviewDrawerOpen, setIsReviewDrawerOpen] = useState(false);
  const [weekStartDate, setWeekStartDate] = useState<string>(toDateOnlyLocal(new Date()));
  const [weekEndDate, setWeekEndDate] = useState<string>(
    toDateOnlyLocal(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)),
  );
  const [plannerDateRange, setPlannerDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  });
  const [plannerSection, setPlannerSection] = useState<Section>("QUANT");
  const [plannerTopicId, setPlannerTopicId] = useState<string>("");
  const [plannerSubtopicId, setPlannerSubtopicId] = useState<string>("");
  const [selectedPlanSubtopics, setSelectedPlanSubtopics] = useState<Set<string>>(new Set());
  const [currentWeeklyPlan, setCurrentWeeklyPlan] = useState<WeeklyPlan | null>(null);
  const [allWeeklyPlans, setAllWeeklyPlans] = useState<WeeklyPlanListItem[]>([]);
  const [plannedSubtopicIds, setPlannedSubtopicIds] = useState<Set<string>>(new Set());

  const sections = useMemo(() => ["QUANT", "DILR", "VARC"] as const, []);

  const allWeeklyPlansSorted = useMemo(() => {
    return [...allWeeklyPlans].sort((a, b) => {
      const cmp = a.week_start_date.localeCompare(b.week_start_date);
      if (cmp !== 0) return cmp;
      return a.week_end_date.localeCompare(b.week_end_date);
    });
  }, [allWeeklyPlans]);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      setLoading(false);
    };
    getSession();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => authSub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshDashboard();
  }, [user]);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const refreshDashboard = async () => {
    setError(null);
    const token = await getAccessToken();
    if (!token) return;

    const [bootstrapRes, reviewRes, weeklyPlanRes, allPlansRes] = await Promise.all([
      fetch("/api/tracker/bootstrap", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/tracker/review-queue", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/plans/weekly", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/plans/weekly?all=true", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const bootstrapJson = await bootstrapRes.json();
    const reviewJson = await reviewRes.json();
    const weeklyPlanJson = await weeklyPlanRes.json();
    const allPlansJson = await allPlansRes.json();

    if (!bootstrapRes.ok) return setError(bootstrapJson.error ?? "Failed to load tracker data");
    if (!reviewRes.ok) return setError(reviewJson.error ?? "Failed to load review queue");
    if (!weeklyPlanRes.ok) return setError(weeklyPlanJson.error ?? "Failed to load weekly plan");
    if (!allPlansRes.ok) return setError(allPlansJson.error ?? "Failed to load weekly plans");

    const loadedTopics = (bootstrapJson.topics ?? []) as Topic[];
    setTopics(loadedTopics);
    setProgress(bootstrapJson.progress);
    setReviewQueue(reviewJson.items ?? []);
    setCurrentWeeklyPlan(weeklyPlanJson.plan ?? null);
    setAllWeeklyPlans((allPlansJson.plans ?? []) as WeeklyPlanListItem[]);
    const usedSubtopicIds = new Set<string>();
    for (const plan of allPlansJson.plans ?? []) {
      for (const item of plan.items ?? []) {
        if (typeof item.subtopic_id === "string") {
          usedSubtopicIds.add(item.subtopic_id);
        }
      }
    }
    setPlannedSubtopicIds(usedSubtopicIds);

    const forms: Record<string, ProofForm> = {};
    for (const topic of loadedTopics) {
      for (const subtopic of topic.subtopics) {
        forms[subtopic.id] = proofForms[subtopic.id] ?? { ...INITIAL_FORM };
      }
    }
    setProofForms(forms);
  };

  const createWeeklyPlan = async () => {
    setError(null);
    setInfo(null);
    if (selectedPlanSubtopics.size === 0) {
      setError("Select at least one subtopic for the weekly plan.");
      return;
    }
    if (!plannerDateRange?.from || !plannerDateRange?.to) {
      setError("Please select start and end date from calendar.");
      return;
    }

    const rangeStart = toDateOnlyLocal(plannerDateRange.from);
    const rangeEnd = toDateOnlyLocal(plannerDateRange.to);
    setWeekStartDate(rangeStart);
    setWeekEndDate(rangeEnd);

    const token = await getAccessToken();
    const res = await fetch("/api/plans/weekly", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        week_start_date: rangeStart,
        week_end_date: rangeEnd,
        subtopic_ids: Array.from(selectedPlanSubtopics),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to create weekly plan");
      return;
    }

    setInfo("Weekly plan saved and visible to all users.");
    setIsPlannerModalOpen(false);
    setSelectedPlanSubtopics(new Set());
    await refreshDashboard();
  };

  const openAllPlansModal = async () => {
    setError(null);
    const token = await getAccessToken();
    const res = await fetch("/api/plans/weekly?all=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load all weekly plans");
      return;
    }
    setAllWeeklyPlans((json.plans ?? []) as WeeklyPlanListItem[]);
    setIsAllPlansModalOpen(true);
  };

  const deleteWeeklyPlan = async (planId: string) => {
    setError(null);
    setInfo(null);
    const token = await getAccessToken();
    const res = await fetch(`/api/plans/weekly?plan_id=${encodeURIComponent(planId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to delete weekly plan");
      return;
    }

    setInfo("Weekly plan deleted.");
    await openAllPlansModal();
    await refreshDashboard();
  };

  const allSubtopicOptions: PlannerSubtopicOption[] = topics.flatMap((topic) =>
    topic.subtopics.map((subtopic) => ({
      id: subtopic.id,
      title: subtopic.title,
      topicId: topic.id,
      topicTitle: topic.title,
      section: topic.section,
    })),
  );
  const plannerTopicOptions = topics.filter((topic) => topic.section === plannerSection);
  const plannerSubtopicOptions = allSubtopicOptions.filter(
    (subtopic) => subtopic.section === plannerSection,
  );
  const plannerFilteredSubtopics = plannerSubtopicOptions.filter(
    (subtopic) =>
      (!plannerTopicId || subtopic.topicId === plannerTopicId) &&
      !plannedSubtopicIds.has(subtopic.id),
  );

  const addSubtopicToPlan = () => {
    if (!plannerSubtopicId) {
      setError("Select a subtopic to add.");
      return;
    }
    setSelectedPlanSubtopics((prev) => {
      const next = new Set(prev);
      next.add(plannerSubtopicId);
      return next;
    });
    setPlannerSubtopicId("");
  };

  const selectedPlanSubtopicRows = allSubtopicOptions.filter((item) =>
    selectedPlanSubtopics.has(item.id),
  );

  const groupedPlanItems = (currentWeeklyPlan?.items ?? []).reduce<Record<Section, Array<{ topic: string; subtopic: string }>>>(
    (acc, item) => {
      const section = item.subtopics.topics.section;
      acc[section].push({
        topic: item.subtopics.topics.title,
        subtopic: item.subtopics.title,
      });
      return acc;
    },
    { QUANT: [], DILR: [], VARC: [] },
  );

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    setInfo("Login successful.");
    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const uploadProof = async (subtopicId: string, category: keyof ProofForm, file: File) => {
    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subtopicId", subtopicId);
    formData.append("category", category);
    const res = await fetch("/api/tracker/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return json.url as string;
  };

  const onUpload = async (subtopicId: string, category: keyof ProofForm, file: File | null) => {
    if (!file) return;
    setError(null);
    setInfo("Uploading image...");
    try {
      const url = await uploadProof(subtopicId, category, file);
      setProofForms((prev) => {
        const current = prev[subtopicId] ?? { ...INITIAL_FORM };
        if (category === "topicQuestionProofUrls") {
          return { ...prev, [subtopicId]: { ...current, topicQuestionProofUrls: [...current.topicQuestionProofUrls, url] } };
        }
        if (category === "pyqProofUrls") {
          return { ...prev, [subtopicId]: { ...current, pyqProofUrls: [...current.pyqProofUrls, url] } };
        }
        return { ...prev, [subtopicId]: { ...current, shortNotesUrls: [...current.shortNotesUrls, url] } };
      });
      setInfo("Image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const submitTopicProof = async (topicId: string, subtopicId: string) => {
    const form = proofForms[subtopicId];
    if (!form) return;
    setError(null);
    setInfo(null);

    const missing: string[] = [];
    if (form.topicQuestionProofUrls.length === 0) missing.push("topic question photo proof");
    if (form.pyqProofUrls.length === 0) missing.push("PYQ photo proof");
    if (form.shortNotesUrls.length === 0) missing.push("short notes image");
    if (missing.length > 0) return setError(`Please upload: ${missing.join(", ")}`);

    const token = await getAccessToken();
    const res = await fetch("/api/tracker/submit", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: topicId,
        subtopic_id: subtopicId,
        topic_questions_done: Number(form.topicQuestionsDone || 0),
        pyq_questions_done: Number(form.pyqQuestionsDone || 0),
        topic_question_proof_urls: form.topicQuestionProofUrls,
        pyq_proof_urls: form.pyqProofUrls,
        short_notes_urls: form.shortNotesUrls,
      }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Submission failed");
    setInfo("Submission sent for approval.");
    await refreshDashboard();
  };

  const reviewSubmission = async (submissionId: string, approve: boolean) => {
    setError(null);
    setInfo(null);
    const token = await getAccessToken();
    const res = await fetch("/api/tracker/review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId, approve }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Review failed");
    setInfo(approve ? "Submission approved." : "Submission rejected.");
    await refreshDashboard();
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6 md:p-10">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600 p-2 text-white">
              <FlaskConical size={18} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">CAT Prep</h1>
              <p className="text-sm text-slate-500">Sign in to your workspace</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleSignIn}>
            <label className="block text-sm text-slate-600">
              Email
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block text-sm text-slate-600">
              Password
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {loading ? "Signing in..." : "Sign in"}
            </button>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
          </form>
        </div>
      </main>
    );
  }

  const filteredTopics = topics.filter((topic) => topic.section === activeSection);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                <ClipboardCheck size={14} />
                Daily Progress Dashboard
              </div>
              <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">IIM - ABC 🥷</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <UserCircle2 size={15} /> {user.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/resources"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Resources
              </Link>
              <button
                onClick={() => setIsReviewDrawerOpen(true)}
                className="relative inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Bell size={16} />
                Notifications
                {reviewQueue.length > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {reviewQueue.length}
                  </span>
                )}
              </button>
              <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </header>

        <CatExamCountdown />

        <section className="grid gap-4 md:grid-cols-3">
          {sections.map((section) => {
            const meta = SECTION_META[section];
            const Icon = meta.icon;
            return (
              <article key={section} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r px-3 py-1 text-xs font-semibold text-white ${meta.accent}`}>
                    <Icon size={14} />
                    {section}
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{progress[section]}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full bg-gradient-to-r ${meta.accent}`} style={{ width: `${progress[section]}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">Approved topics drive this progress.</p>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays size={18} className="text-indigo-600" />
            <h2 className="text-xl font-semibold text-slate-900">Weekly Planner</h2>
          </div>

          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setIsPlannerModalOpen(true);
                  setError(null);
                  setInfo(null);
                  setPlannerDateRange({
                    from: new Date(),
                    to: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
                  });
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Open Weekly Planner
              </button>
              <button
                onClick={() => void openAllPlansModal()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View All Weekly Plans
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-800">Current week goal</p>
              {!currentWeeklyPlan ? (
                <p className="mt-2 text-sm text-slate-500">No active weekly plan for today.</p>
              ) : (
                (() => {
                  const { week, isoYear } = weekLabelFromPlan(currentWeeklyPlan);
                  return (
                    <>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        Week {week} · {isoYear}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatPrettyDate(currentWeeklyPlan.week_start_date)} to{" "}
                        {formatPrettyDate(currentWeeklyPlan.week_end_date)}
                      </p>
                      <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-indigo-600"
                          style={{
                            width: `${currentWeeklyPlan.total_goals > 0
                              ? Math.round(
                                (currentWeeklyPlan.completed_goals / currentWeeklyPlan.total_goals) *
                                100,
                              )
                              : 0
                              }%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        Completed: {currentWeeklyPlan.completed_goals} /{" "}
                        {currentWeeklyPlan.total_goals} | Remaining:{" "}
                        {currentWeeklyPlan.remaining_goals}
                      </p>
                    </>
                  );
                })()
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-800">
                Week goals by section
                {currentWeeklyPlan
                  ? ` (${formatPrettyDate(currentWeeklyPlan.week_start_date)} to ${formatPrettyDate(
                    currentWeeklyPlan.week_end_date,
                  )})`
                  : ""}
              </p>
              {!currentWeeklyPlan || currentWeeklyPlan.items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No goals added for this week yet.</p>
              ) : (
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  {sections.map((section) => (
                    <div key={section} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-sm font-semibold text-slate-700">{section}</p>
                      {groupedPlanItems[section].length === 0 ? (
                        <p className="text-xs text-slate-500">No goals</p>
                      ) : (
                        <ul className="space-y-1">
                          {groupedPlanItems[section].map((row, idx) => (
                            <li key={`${section}-${idx}`} className="text-xs text-slate-600">
                              <span className="font-medium">{row.topic}:</span> {row.subtopic}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {sections.map((section) => {
              const meta = SECTION_META[section];
              const Icon = meta.icon;
              const active = activeSection === section;
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => {
                    setActiveSection(section);
                    setOpenTopicId(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${active
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                >
                  <Icon size={15} />
                  {section}
                </button>
              );
            })}
          </div>

          <h2 className="mb-4 text-xl font-semibold text-slate-900">{activeSection} Topics</h2>

          <div className="grid gap-3">
            {filteredTopics.map((topic) => {
              const isOpen = openTopicId === topic.id;

              return (
                <article key={topic.id} className="rounded-xl border border-slate-200 bg-slate-50/60">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTopicId((prev) => (prev === topic.id ? null : topic.id));
                      setOpenSubtopicId(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{topic.title}</h3>
                      <a
                        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
                        href={topic.study_link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link2 size={14} />
                        Open study link
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      {topic.completed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 size={13} /> Completed
                        </span>
                      )}
                      {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="space-y-4 border-t border-slate-200 p-4">
                      {topic.subtopics.length === 0 && (
                        <p className="text-sm text-slate-500">No subtopics found for this topic.</p>
                      )}

                      {topic.subtopics.map((subtopic) => {
                        const form = proofForms[subtopic.id] ?? INITIAL_FORM;
                        const isPending = subtopic.latest_submission?.status === "pending";
                        const isSubtopicOpen = openSubtopicId === subtopic.id;
                        return (
                          <div key={subtopic.id} className="rounded-lg border border-slate-200 bg-white p-4">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenSubtopicId((prev) => (prev === subtopic.id ? null : subtopic.id))
                              }
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <p className="text-sm font-semibold text-slate-900">{subtopic.title}</p>
                              <div className="flex items-center gap-2">
                                <StatusChip status={subtopic.latest_submission?.status ?? null} />
                                {subtopic.completed && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                    <CheckCircle2 size={13} /> Completed
                                  </span>
                                )}
                                {isSubtopicOpen ? (
                                  <ChevronUp size={16} className="text-slate-500" />
                                ) : (
                                  <ChevronDown size={16} className="text-slate-500" />
                                )}
                              </div>
                            </button>

                            {isSubtopicOpen && !subtopic.completed && (
                              <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <p className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-700">
                                    <Video size={14} />
                                    Video lessons
                                  </p>
                                  {subtopic.videos.length === 0 ? (
                                    <p className="text-xs text-slate-500">No videos added for this subtopic yet.</p>
                                  ) : (
                                    <div className="grid gap-1">
                                      {subtopic.videos.map((videoItem) => (
                                        <a
                                          key={videoItem.id}
                                          href={videoItem.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100"
                                        >
                                          <span className="inline-flex items-center gap-1">
                                            <Link2 size={13} />
                                            {videoItem.label}
                                          </span>
                                          <span className="text-xs font-medium">Open</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="text-sm text-slate-600">
                                    Topic questions done
                                    <input className="no-spinner mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="number" min={0} inputMode="numeric" placeholder="Enter count" value={form.topicQuestionsDone} onChange={(e) => setProofForms((prev) => ({ ...prev, [subtopic.id]: { ...form, topicQuestionsDone: e.target.value.replace(/[^\d]/g, "") } }))} />
                                  </label>
                                  <label className="text-sm text-slate-600">
                                    Previous year questions done
                                    <input className="no-spinner mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="number" min={0} inputMode="numeric" placeholder="Enter count" value={form.pyqQuestionsDone} onChange={(e) => setProofForms((prev) => ({ ...prev, [subtopic.id]: { ...form, pyqQuestionsDone: e.target.value.replace(/[^\d]/g, "") } }))} />
                                  </label>
                                </div>

                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                  {[
                                    { label: "Topic Questions Proof", key: "topicQuestionProofUrls" as const, count: form.topicQuestionProofUrls.length },
                                    { label: "PYQ Proof", key: "pyqProofUrls" as const, count: form.pyqProofUrls.length },
                                    { label: "Short Notes Proof", key: "shortNotesUrls" as const, count: form.shortNotesUrls.length },
                                  ].map((upload) => (
                                    <label key={upload.key} className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                                      <span className="mb-2 inline-flex items-center gap-1 text-slate-700">
                                        <FileImage size={14} /> {upload.label}
                                      </span>
                                      <input className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-700" type="file" accept="image/*" onChange={(e) => void onUpload(subtopic.id, upload.key, e.target.files?.[0] ?? null)} />
                                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                                        <UploadCloud size={12} />
                                        Uploaded: {upload.count}
                                      </span>
                                    </label>
                                  ))}
                                </div>

                                <button onClick={() => void submitTopicProof(topic.id, subtopic.id)} disabled={isPending} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                                  <ClipboardCheck size={15} />
                                  {isPending ? "Awaiting review" : "Submit for approval"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}
      </div>

      {isReviewDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40" onClick={() => setIsReviewDrawerOpen(false)}>
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Review Queue</h2>
              <button
                onClick={() => setIsReviewDrawerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">Approve or reject submissions from other users.</p>
            <div className="grid gap-4">
              {reviewQueue.length === 0 && (
                <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No pending reviews right now.
                </p>
              )}
              {reviewQueue.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">
                      {item.topics.section} - {item.topics.title}
                      {item.subtopics?.title ? ` - ${item.subtopics.title}` : ""}
                    </h3>
                    <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                      {item.reviews.length} review(s)
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    Submitted by:{" "}
                    <span className="font-medium text-slate-800">
                      {item.submitter_email ?? item.user_id}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600">
                    Topic questions: <span className="font-medium">{item.topic_questions_done}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    PYQ questions: <span className="font-medium">{item.pyq_questions_done}</span>
                  </p>

                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium text-slate-700">Attached proofs</p>
                    {[...item.topic_question_proof_urls, ...item.pyq_proof_urls, ...item.short_notes_urls].map(
                      (url, index) => (
                        <a
                          key={`${item.id}-${index}`}
                          className="block text-sm text-indigo-600 hover:underline"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {url}
                        </a>
                      ),
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      onClick={() => void reviewSubmission(item.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
                      onClick={() => void reviewSubmission(item.id, false)}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}

      {isPlannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Create Weekly Plan</h3>
              <button
                onClick={() => setIsPlannerModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Select start and end date</p>
                <DayPicker
                  mode="range"
                  selected={plannerDateRange}
                  onSelect={(range) => {
                    setPlannerDateRange(range);
                    if (range?.from) setWeekStartDate(toDateOnlyLocal(range.from));
                    if (range?.to) setWeekEndDate(toDateOnlyLocal(range.to));
                  }}
                  numberOfMonths={1}
                  defaultMonth={plannerDateRange?.from}
                  showOutsideDays
                  fixedWeeks
                  className="mx-auto w-fit rounded-xl border border-slate-200 bg-white p-2 text-slate-800"
                  classNames={{
                    months: "flex flex-col",
                    month: "space-y-2",
                    caption: "relative flex items-center justify-center py-1",
                    caption_label: "text-sm font-semibold text-slate-800",
                    nav: "absolute inset-x-0 top-1 flex items-center justify-end px-1",
                    nav_button:
                      "h-6 w-6 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell:
                      "m-0.5 w-8 text-[10px] font-semibold uppercase tracking-wide text-slate-400",
                    row: "mt-1 flex w-full",
                    cell: "relative m-0.5 h-8 w-8 p-0 text-center text-xs",
                    day: "h-8 w-8 rounded-md text-slate-700 hover:bg-indigo-50 hover:text-indigo-700",
                    day_selected:
                      "bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white",
                    day_range_start:
                      "bg-indigo-600 text-white rounded-l-md rounded-r-none hover:bg-indigo-600",
                    day_range_end:
                      "bg-indigo-600 text-white rounded-r-md rounded-l-none hover:bg-indigo-600",
                    day_range_middle:
                      "bg-indigo-100 text-indigo-700 rounded-none hover:bg-indigo-100",
                    day_today: "border border-indigo-300 text-indigo-700",
                    day_outside: "text-slate-300",
                    day_disabled: "text-slate-300",
                  }}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {plannerDateRange?.from
                    ? `Start: ${formatPrettyDate(weekStartDate)}`
                    : "Select a start date"}{" "}
                  {plannerDateRange?.to ? `| End: ${formatPrettyDate(weekEndDate)}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm text-slate-600">
                Section
                <select
                  value={plannerSection}
                  onChange={(e) => {
                    const next = e.target.value as Section;
                    setPlannerSection(next);
                    setPlannerTopicId("");
                    setPlannerSubtopicId("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  {sections.map((section) => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-600">
                Topic
                <select
                  value={plannerTopicId}
                  onChange={(e) => {
                    setPlannerTopicId(e.target.value);
                    setPlannerSubtopicId("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  <option value="">All topics</option>
                  {plannerTopicOptions.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-600">
                Subtopic
                <select
                  value={plannerSubtopicId}
                  onChange={(e) => setPlannerSubtopicId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  <option value="">Select subtopic</option>
                  {plannerFilteredSubtopics.map((subtopic) => (
                    <option key={subtopic.id} value={subtopic.id}>
                      {subtopic.topicTitle} - {subtopic.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3">
              <button
                onClick={addSubtopicToPlan}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Add to selected week's goal!
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">
                Selected goals ({selectedPlanSubtopicRows.length})
              </p>
              {selectedPlanSubtopicRows.length === 0 ? (
                <p className="text-sm text-slate-500">No subtopics selected yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedPlanSubtopicRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800"
                    >
                      <span>
                        <span className="font-medium">{row.section}</span> - {row.topicTitle} -{" "}
                        {row.title}
                      </span>
                      <button
                        onClick={() =>
                          setSelectedPlanSubtopics((prev) => {
                            const next = new Set(prev);
                            next.delete(row.id);
                            return next;
                          })
                        }
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsPlannerModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void createWeeklyPlan()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save Weekly Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {isAllPlansModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">All Weekly Plans</h3>
              <button
                onClick={() => setIsAllPlansModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
              {allWeeklyPlansSorted.length === 0 && (
                <p className="text-sm text-slate-500">No weekly plans created yet.</p>
              )}
              {allWeeklyPlansSorted.map((plan) => {
                const { week, isoYear } = weekLabelFromPlan(plan);
                return (
                <div key={plan.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        Week {week} · {isoYear}
                      </p>
                      <p className="text-sm font-semibold text-slate-800">
                        {formatPrettyDate(plan.week_start_date)} to{" "}
                        {formatPrettyDate(plan.week_end_date)}
                      </p>
                    </div>
                    <button
                      onClick={() => void deleteWeeklyPlan(plan.id)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    {sections.map((section) => {
                      const rows = plan.items.filter(
                        (item) => item.subtopics.topics.section === section,
                      );
                      return (
                        <div key={`${plan.id}-${section}`} className="rounded-md bg-slate-50 p-2">
                          <p className="text-xs font-semibold text-slate-700">{section}</p>
                          {rows.length === 0 ? (
                            <p className="text-xs text-slate-500">No goals</p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {rows.map((item, idx) => (
                                <li key={`${item.subtopic_id}-${idx}`} className="text-xs text-slate-600">
                                  <span className="font-medium">{item.subtopics.topics.title}:</span>{" "}
                                  {item.subtopics.title}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
