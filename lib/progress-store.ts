import { promises as fs } from "fs";
import path from "path";

export type DayLog = {
  date: string;
  gym: string;
  learning: string;
  updatedAt: string;
};

export type ProgressStorageInfo =
  | { mode: "local"; pathLabel: string }
  | { mode: "serverless"; pathLabel: string }
  | { mode: "custom"; pathLabel: string };

const TMP_FILE = path.join("/tmp", "daily-progress.json");

let ephemeralOverride: string | null = null;

function dataFile(): string {
  if (process.env.PROGRESS_STORAGE_PATH) {
    return process.env.PROGRESS_STORAGE_PATH;
  }
  if (ephemeralOverride) {
    return ephemeralOverride;
  }
  if (process.env.VERCEL === "1") {
    return TMP_FILE;
  }
  return path.join(process.cwd(), "data", "progress.json");
}

export function getProgressStorageInfo(): ProgressStorageInfo {
  if (process.env.PROGRESS_STORAGE_PATH) {
    return { mode: "custom", pathLabel: process.env.PROGRESS_STORAGE_PATH };
  }
  if (process.env.VERCEL === "1") {
    return { mode: "serverless", pathLabel: "server /tmp (ephemeral)" };
  }
  return { mode: "local", pathLabel: "data/progress.json" };
}

function normalizeDay(raw: unknown): DayLog | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const date = String(o.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    date,
    gym: String(o.gym ?? ""),
    learning: String(o.learning ?? ""),
    updatedAt: String(o.updatedAt ?? new Date().toISOString()),
  };
}

async function ensureFile(): Promise<void> {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {});
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "[]", "utf-8");
  }
}

let writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function readAllLogs(): Promise<DayLog[]> {
  await ensureFile();
  const raw = await fs.readFile(dataFile(), "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const days = parsed
    .map(normalizeDay)
    .filter((d): d is DayLog => d !== null);
  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return days;
}

async function writeAll(days: DayLog[]): Promise<void> {
  await ensureFile();
  const file = dataFile();
  const payload = JSON.stringify(days, null, 2);
  try {
    await fs.writeFile(file, payload, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const readOnly =
      err.code === "EROFS" ||
      err.code === "EACCES" ||
      err.code === "ENOTSUP";
    if (readOnly && !process.env.PROGRESS_STORAGE_PATH && !ephemeralOverride) {
      ephemeralOverride = TMP_FILE;
      await ensureFile();
      await fs.writeFile(dataFile(), payload, "utf-8");
      return;
    }
    throw e;
  }
}

export async function getDay(date: string): Promise<DayLog | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = await readAllLogs();
  return days.find((d) => d.date === date) ?? null;
}

export async function upsertDay(input: {
  date: string;
  gym: string;
  learning: string;
}): Promise<DayLog> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("Invalid date");
  }
  return serialized(async () => {
    const days = await readAllLogs();
    const empty = !input.gym.trim() && !input.learning.trim();
    if (empty) {
      const next = days.filter((d) => d.date !== input.date);
      await writeAll(next);
      return {
        date: input.date,
        gym: "",
        learning: "",
        updatedAt: new Date().toISOString(),
      };
    }

    const next: DayLog = {
      date: input.date,
      gym: input.gym,
      learning: input.learning,
      updatedAt: new Date().toISOString(),
    };
    const i = days.findIndex((d) => d.date === input.date);
    if (i === -1) {
      days.push(next);
    } else {
      days[i] = next;
    }
    days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    await writeAll(days);
    return next;
  });
}

export async function deleteDay(date: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return serialized(async () => {
    const days = await readAllLogs();
    const next = days.filter((d) => d.date !== date);
    if (next.length === days.length) return false;
    await writeAll(next);
    return true;
  });
}
