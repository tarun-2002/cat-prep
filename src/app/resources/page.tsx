"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Resource = {
  id: string;
  resource_name: string;
  resource_description: string;
  links: string[];
  created_at: string;
};

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [resourceName, setResourceName] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [linksInput, setLinksInput] = useState("");

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  };

  const loadResources = async () => {
    setError(null);
    const token = await getToken();
    if (!token) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/resources", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load resources");
      setLoading(false);
      return;
    }
    setResources((json.resources ?? []) as Resource[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadResources();
  }, []);

  const handleCreateResource = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const links = linksInput
      .split("\n")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const token = await getToken();
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resource_name: resourceName,
        resource_description: resourceDescription,
        links,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to create resource");
      return;
    }

    setInfo("Resource added successfully.");
    setIsModalOpen(false);
    setResourceName("");
    setResourceDescription("");
    setLinksInput("");
    await loadResources();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Resources</h1>
              <p className="text-sm text-slate-500">Shared resources for all users.</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </Link>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus size={16} />
                Add Resource
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-slate-600">Loading resources...</p>
        ) : (
          <section className="grid gap-4">
            {resources.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
                No resources added yet.
              </div>
            )}
            {resources.map((resource) => (
              <article key={resource.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">{resource.resource_name}</h2>
                <p className="mt-1 text-sm text-slate-600">{resource.resource_description}</p>
                <div className="mt-3 space-y-1">
                  {resource.links.map((link, index) => (
                    <a
                      key={`${resource.id}-${index}`}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm text-indigo-600 hover:underline"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {info && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</p>}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Add Resource</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleCreateResource}>
              <label className="block text-sm text-slate-700">
                Resource Name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  value={resourceName}
                  onChange={(e) => setResourceName(e.target.value)}
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                Resource Description
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  rows={3}
                  value={resourceDescription}
                  onChange={(e) => setResourceDescription(e.target.value)}
                  required
                />
              </label>

              <label className="block text-sm text-slate-700">
                Links (one per line)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  rows={5}
                  placeholder={"https://example.com/1\nhttps://example.com/2"}
                  value={linksInput}
                  onChange={(e) => setLinksInput(e.target.value)}
                  required
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
