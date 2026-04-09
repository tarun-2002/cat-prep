"use client";

import { useEffect, useState } from "react";
import { Clock, GraduationCap } from "lucide-react";

/** CAT 2026 slot — 30 Nov 2026, 8:00 AM IST */
const CAT_EXAM_INSTANT_MS = new Date("2026-11-30T08:00:00+05:30").getTime();

export type CountdownParts = {
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
};

function computeCountdown(nowMs: number): CountdownParts {
  const targetMs = CAT_EXAM_INSTANT_MS;
  if (nowMs >= targetMs) {
    return { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }

  let cursor = new Date(nowMs);
  const target = new Date(targetMs);

  let months = 0;
  const maxMonths = 120;
  for (let i = 0; i < maxMonths; i++) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    if (next > target) break;
    months++;
    cursor = next;
  }

  const diffMs = target.getTime() - cursor.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  const daysTotal = Math.floor(totalSeconds / 86400);
  const weeks = Math.floor(daysTotal / 7);
  const days = daysTotal % 7;
  const restAfterDays = totalSeconds - daysTotal * 86400;
  const hours = Math.floor(restAfterDays / 3600);
  const minutes = Math.floor((restAfterDays % 3600) / 60);
  const seconds = restAfterDays % 60;

  return { months, weeks, days, hours, minutes, seconds, done: false };
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatTotalHms(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const hStr = h > 99 ? String(h) : pad(h);
  return `${hStr}:${pad(m)}:${pad(s)}`;
}

export function CatExamCountdown() {
  const [parts, setParts] = useState<CountdownParts>(() => computeCountdown(Date.now()));

  useEffect(() => {
    const tick = () => setParts(computeCountdown(Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const totalSecondsLeft = Math.max(0, Math.floor((CAT_EXAM_INSTANT_MS - Date.now()) / 1000));
  const totalDaysLeft = Math.floor(totalSecondsLeft / 86400);
  const timeLeftHms = formatTotalHms(totalSecondsLeft);

  const blocks = [
    { label: "Months", value: parts.months },
    { label: "Weeks", value: parts.weeks },
    { label: "Hours", value: parts.hours },
    { label: "Mins", value: parts.minutes },
    { label: "Secs", value: parts.seconds },
  ];

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 shadow-lg shadow-indigo-900/20 md:p-7"
      aria-labelledby="cat-countdown-heading"
      suppressHydrationWarning
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />

      <div className="relative">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/15 p-2.5 text-white ring-1 ring-white/20">
              <GraduationCap className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p id="cat-countdown-heading" className="text-lg font-bold tracking-tight text-white md:text-xl">
                CAT 2026 Countdown
              </p>
              <p className="mt-1 text-sm text-indigo-100">
                Exam date:{" "}
                <span className="font-semibold text-white">30th November 2026</span>
                <span className="text-indigo-200"> · </span>
                <span className="font-medium">8:00 AM IST</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-white ring-1 ring-white/10 backdrop-blur-sm sm:mt-0">
            <Clock className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-200">Time left (h:m:s)</p>
              <p className="font-mono text-base font-semibold tabular-nums tracking-wide md:text-lg">{timeLeftHms}</p>
            </div>
          </div>
        </div>

        {parts.done ? (
          <p className="rounded-xl bg-white/15 px-4 py-3 text-center text-sm font-medium text-white ring-1 ring-white/20">
            Exam day — all the best!
          </p>
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-white/20 to-white/5 px-6 py-8 text-center ring-2 ring-amber-300/40 shadow-inner shadow-black/10 lg:min-w-[min(100%,280px)] lg:py-10">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-100 md:text-base">
                Days left
              </p>
              <p
                className="mt-2 bg-gradient-to-b from-white to-indigo-100 bg-clip-text text-[clamp(3.5rem,12vw,7rem)] font-black tabular-nums leading-none text-transparent drop-shadow-sm md:mt-3"
                suppressHydrationWarning
              >
                {totalDaysLeft}
              </p>
              <p className="mt-3 max-w-[14rem] text-xs leading-snug text-indigo-100/90 md:text-sm">
                Full 24-hour days until the exam window
              </p>
            </div>
            <ul
              className="grid flex-[1.4] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
              role="list"
            >
              {blocks.map(({ label, value }) => (
                <li key={label}>
                  <div className="flex h-full min-h-[5.5rem] flex-col items-center justify-center rounded-xl bg-white/10 px-2 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm transition duration-300 hover:bg-white/15 md:min-h-[6rem] md:py-4">
                    <span
                      className="text-2xl font-bold tabular-nums text-white md:text-3xl"
                      suppressHydrationWarning
                    >
                      {value}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-200 md:text-xs">
                      {label}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-indigo-200/90 md:text-xs">
          Countdown uses Indian Standard Time (IST) for the exam slot.
        </p>
      </div>
    </section>
  );
}
