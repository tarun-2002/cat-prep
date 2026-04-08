"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
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
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
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
  }>;
};

type ReviewQueueItem = {
  id: string;
  user_id: string;
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

type ProofForm = {
  topicQuestionsDone: number;
  pyqQuestionsDone: number;
  topicQuestionProofUrls: string[];
  pyqProofUrls: string[];
  shortNotesUrls: string[];
};

const INITIAL_FORM: ProofForm = {
  topicQuestionsDone: 0,
  pyqQuestionsDone: 0,
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

  const sections = useMemo(() => ["QUANT", "DILR", "VARC"] as const, []);

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

    const [bootstrapRes, reviewRes] = await Promise.all([
      fetch("/api/tracker/bootstrap", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/tracker/review-queue", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const bootstrapJson = await bootstrapRes.json();
    const reviewJson = await reviewRes.json();

    if (!bootstrapRes.ok) return setError(bootstrapJson.error ?? "Failed to load tracker data");
    if (!reviewRes.ok) return setError(reviewJson.error ?? "Failed to load review queue");

    const loadedTopics = (bootstrapJson.topics ?? []) as Topic[];
    setTopics(loadedTopics);
    setProgress(bootstrapJson.progress);
    setReviewQueue(reviewJson.items ?? []);

    const forms: Record<string, ProofForm> = {};
    for (const topic of loadedTopics) {
      for (const subtopic of topic.subtopics) {
        forms[subtopic.id] = proofForms[subtopic.id] ?? { ...INITIAL_FORM };
      }
    }
    setProofForms(forms);
  };

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
        topic_questions_done: form.topicQuestionsDone,
        pyq_questions_done: form.pyqQuestionsDone,
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
              <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">IIM - ABC</h1>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <UserCircle2 size={15} /> {user.email}
              </p>
            </div>
            <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

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
                    onClick={() => setOpenTopicId((prev) => (prev === topic.id ? null : topic.id))}
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
                        return (
                          <div key={subtopic.id} className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-900">{subtopic.title}</p>
                              <div className="flex items-center gap-2">
                                <StatusChip status={subtopic.latest_submission?.status ?? null} />
                                {subtopic.completed && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                    <CheckCircle2 size={13} /> Completed
                                  </span>
                                )}
                              </div>
                            </div>

                            {!subtopic.completed && (
                              <>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="text-sm text-slate-600">
                                    Topic questions done
                                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="number" min={0} value={form.topicQuestionsDone} onChange={(e) => setProofForms((prev) => ({ ...prev, [subtopic.id]: { ...form, topicQuestionsDone: Number(e.target.value) } }))} />
                                  </label>
                                  <label className="text-sm text-slate-600">
                                    Previous year questions done
                                    <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-indigo-500 focus:ring-2" type="number" min={0} value={form.pyqQuestionsDone} onChange={(e) => setProofForms((prev) => ({ ...prev, [subtopic.id]: { ...form, pyqQuestionsDone: Number(e.target.value) } }))} />
                                  </label>
                                </div>

                                <div className="mt-3 grid gap-3 md:grid-cols-3">
                                  {[
                                    { label: "Topic proof image", key: "topicQuestionProofUrls" as const, count: form.topicQuestionProofUrls.length },
                                    { label: "PYQ proof image", key: "pyqProofUrls" as const, count: form.pyqProofUrls.length },
                                    { label: "Short notes image", key: "shortNotesUrls" as const, count: form.shortNotesUrls.length },
                                  ].map((upload) => (
                                    <label key={upload.key} className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">
                                      <span className="mb-2 inline-flex items-center gap-1 text-slate-700">
                                        <FileImage size={14} /> {upload.label}
                                      </span>
                                      <input className="mt-1 block w-full text-xs" type="file" accept="image/*" onChange={(e) => void onUpload(subtopic.id, upload.key, e.target.files?.[0] ?? null)} />
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
                              </>
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Review Queue</h2>
          <p className="mb-4 text-sm text-slate-500">Approve or reject submissions from other users.</p>
          <div className="grid gap-4">
            {reviewQueue.length === 0 && <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No pending reviews right now.</p>}
            {reviewQueue.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">
                    {item.topics.section} - {item.topics.title}
                    {item.subtopics?.title ? ` - ${item.subtopics.title}` : ""}
                  </h3>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">{item.reviews.length} review(s)</span>
                </div>
                <p className="text-sm text-slate-600">Submitted by: <span className="font-medium">{item.user_id}</span></p>
                <p className="text-sm text-slate-600">Topic questions: <span className="font-medium">{item.topic_questions_done}</span></p>
                <p className="text-sm text-slate-600">PYQ questions: <span className="font-medium">{item.pyq_questions_done}</span></p>

                <div className="mt-3">
                  <p className="mb-1 text-sm font-medium text-slate-700">Attached proofs</p>
                  {[...item.topic_question_proof_urls, ...item.pyq_proof_urls, ...item.short_notes_urls].map((url, index) => (
                    <a key={`${item.id}-${index}`} className="block text-sm text-indigo-600 hover:underline" href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700" onClick={() => void reviewSubmission(item.id, true)}>
                    Approve
                  </button>
                  <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700" onClick={() => void reviewSubmission(item.id, false)}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}
      </div>
    </main>
  );
}
