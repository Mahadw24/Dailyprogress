"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DayLog } from "@/lib/progress-store";
import type { ProgressStorageInfo } from "@/lib/progress-storage-meta";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatHeading(dateStr: string): string {
  const d = parseISODate(dateStr);
  const today = toISODate(new Date());
  const yesterday = toISODate(
    new Date(Date.now() - 86400000)
  );
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function fetchAll(): Promise<DayLog[]> {
  const res = await fetch("/api/progress", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}

export default function ProgressApp({
  storage,
}: {
  storage: ProgressStorageInfo;
}) {
  const today = useMemo(() => toISODate(new Date()), []);
  const [date, setDate] = useState(today);
  const [gym, setGym] = useState("");
  const [learning, setLearning] = useState("");
  const [byDate, setByDate] = useState<Map<string, DayLog>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const logs = await fetchAll();
      const m = new Map<string, DayLog>();
      for (const row of logs) {
        m.set(row.date, row);
      }
      setByDate(m);
    } catch {
      setError("Could not load progress.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const row = byDate.get(date);
    setGym(row?.gym ?? "");
    setLearning(row?.learning ?? "");
    setSavedAt(row?.updatedAt ?? null);
    setDirty(false);
  }, [date, byDate]);

  const markDirty = () => setDirty(true);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, gym, learning }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      const day = (await res.json()) as DayLog;
      setByDate((prev) => {
        const next = new Map(prev);
        const empty = !day.gym.trim() && !day.learning.trim();
        if (empty) {
          next.delete(day.date);
        } else {
          next.set(day.date, day);
        }
        return next;
      });
      setSavedAt(day.updatedAt);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [date, gym, learning]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const removeDay = async () => {
    const row = byDate.get(date);
    if (!row || (!row.gym.trim() && !row.learning.trim())) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/progress/${encodeURIComponent(date)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      setByDate((prev) => {
        const next = new Map(prev);
        next.delete(date);
        return next;
      });
      setGym("");
      setLearning("");
      setSavedAt(null);
      setDirty(false);
    } catch {
      setError("Could not delete this day.");
    } finally {
      setSaving(false);
    }
  };

  const shiftDate = (delta: number) => {
    const d = parseISODate(date);
    d.setDate(d.getDate() + delta);
    setDate(toISODate(d));
  };

  const recent = useMemo(() => {
    return [...byDate.values()]
      .filter((r) => r.gym.trim() || r.learning.trim())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 16);
  }, [byDate]);

  const rowForDate = byDate.get(date);
  const hasSavedRow = Boolean(
    rowForDate &&
      (rowForDate.gym.trim() || rowForDate.learning.trim())
  );

  return (
    <div className="relative min-h-full flex-1 overflow-hidden bg-white">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[min(100vw,48rem)] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--learn-soft), transparent 55%), radial-gradient(ellipse at 30% 40%, var(--gym-soft), transparent 50%)",
        }}
      />
      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 text-center sm:mb-10">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-3 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm ${
              storage.mode === "unconfigured"
                ? "border-red-200 bg-red-50 text-red-900"
                : storage.mode === "redis"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)]"
            }`}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            {storage.mode === "unconfigured" ? (
              <>
                <span>Not saving:</span>
                <span className="text-left">{storage.pathLabel}</span>
              </>
            ) : storage.mode === "redis" ? (
              <>
                <span>Persistent:</span>
                <code className="font-mono text-zinc-900">{storage.pathLabel}</code>
              </>
            ) : (
              <>
                Stored in{" "}
                <code className="font-mono text-zinc-900">{storage.pathLabel}</code>
              </>
            )}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl"
          >
            Daily progress
          </motion.h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {storage.mode === "unconfigured"
              ? "Vercel cannot write to your repo. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from upstash.com (free tier), redeploy, and logs will persist."
              : storage.mode === "redis"
                ? "Logs are stored as JSON in Upstash Redis — durable on Vercel."
                : "Gym on the left, learning on the right — one calm log per day."}
          </p>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-3xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-[var(--shadow)] sm:p-6"
        >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 flex-col items-center px-2 sm:items-start">
                <span className="text-lg font-semibold text-zinc-900">
                  {formatHeading(date)}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 max-w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm text-zinc-800"
                />
              </div>
              <button
                type="button"
                onClick={() => shiftDate(1)}
                disabled={date >= today}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-35"
                aria-label="Next day"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setDate(today)}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Today
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-45"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Save
              </button>
              {hasSavedRow && (
                <button
                  type="button"
                  onClick={() => void removeDay()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-45"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Clear day
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20 text-zinc-500">
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col rounded-2xl border border-zinc-200 bg-[var(--gym-soft)] p-4 ring-1 ring-transparent transition focus-within:ring-[var(--gym)]">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--gym)]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <Dumbbell className="h-4 w-4" aria-hidden />
                  </span>
                  Gym & movement
                </span>
                <textarea
                  value={gym}
                  onChange={(e) => {
                    setGym(e.target.value);
                    markDirty();
                  }}
                  rows={10}
                  placeholder="Workout, steps, mobility, how you felt…"
                  className="min-h-[10rem] w-full resize-y rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--gym)] focus:outline-none focus:ring-2 focus:ring-[var(--gym-soft)]"
                />
              </label>
              <label className="flex flex-col rounded-2xl border border-zinc-200 bg-[var(--learn-soft)] p-4 ring-1 ring-transparent transition focus-within:ring-[var(--learn)]">
                <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--learn)]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                    <BookOpen className="h-4 w-4" aria-hidden />
                  </span>
                  Learning
                </span>
                <textarea
                  value={learning}
                  onChange={(e) => {
                    setLearning(e.target.value);
                    markDirty();
                  }}
                  rows={10}
                  placeholder="Courses, reading, practice, notes…"
                  className="min-h-[10rem] w-full resize-y rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--learn)] focus:outline-none focus:ring-2 focus:ring-[var(--learn-soft)]"
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <span>
              {dirty ? "Unsaved changes" : savedAt ? "All changes saved" : " "}
            </span>
            <span className="tabular-nums">
              {savedAt
                ? `Last saved ${new Date(savedAt).toLocaleString()}`
                : "Tip: Ctrl / ⌘ + S to save"}
            </span>
          </div>
        </motion.section>

        {recent.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold text-zinc-700">
              Recent days
            </h2>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r.date}
                  type="button"
                  onClick={() => setDate(r.date)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    r.date === date
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {r.date === today
                    ? "Today"
                    : parseISODate(r.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                </button>
              ))}
            </div>
          </section>
        )}

        {(storage.mode === "redis" ||
          storage.mode === "local" ||
          storage.mode === "custom") && (
          <p className="mt-8 text-center text-xs text-zinc-500">
            {storage.mode === "redis" ? (
              <>
                Redis key{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono text-zinc-800">
                  dailyprogress:logs
                </code>
              </>
            ) : (
              <>
                File:{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono text-zinc-800">
                  {storage.pathLabel}
                </code>
              </>
            )}
          </p>
        )}

        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 text-center text-sm text-red-600"
            >
              {error}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </motion.p>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
