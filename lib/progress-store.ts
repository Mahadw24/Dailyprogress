import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";

import { hasUpstashRedis } from "./progress-storage-meta";

export type DayLog = {
  date: string;
  gym: string;
  learning: string;
  updatedAt: string;
};

/** Same JSON as `data/progress.json`, stored in Upstash when env is set. */
const REDIS_KEY = "dailyprogress:logs";

export class PersistenceNotConfiguredError extends Error {
  readonly code = "PERSISTENCE_NOT_CONFIGURED" as const;
  constructor() {
    super(
      "This host cannot write files. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (free Upstash Redis) in Vercel → Settings → Environment Variables, then redeploy."
    );
    this.name = "PersistenceNotConfiguredError";
  }
}

function getRedis(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN!.trim(),
  });
}

function dataFile(): string {
  if (process.env.PROGRESS_STORAGE_PATH) {
    return process.env.PROGRESS_STORAGE_PATH;
  }
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "progress.json"
  );
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

function parseLogsJson(raw: string): DayLog[] {
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

let writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readAllLogsFile(): Promise<DayLog[]> {
  await ensureFile();
  const raw = await fs.readFile(dataFile(), "utf-8");
  return parseLogsJson(raw);
}

async function writeAllFile(days: DayLog[]): Promise<void> {
  await ensureFile();
  const payload = JSON.stringify(days, null, 2);
  try {
    await fs.writeFile(dataFile(), payload, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (
      err.code === "EROFS" ||
      err.code === "EACCES" ||
      err.code === "ENOTSUP"
    ) {
      throw new PersistenceNotConfiguredError();
    }
    throw e;
  }
}

async function readAllLogsRedis(redis: Redis): Promise<DayLog[]> {
  const raw = await redis.get<unknown>(REDIS_KEY);
  if (raw == null || raw === "") return [];
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);
  return parseLogsJson(str);
}

async function writeAllRedis(redis: Redis, days: DayLog[]): Promise<void> {
  await redis.set(REDIS_KEY, JSON.stringify(days));
}

export async function readAllLogs(): Promise<DayLog[]> {
  const redis = getRedis();
  if (redis) {
    return readAllLogsRedis(redis);
  }
  return readAllLogsFile();
}

async function writeAll(days: DayLog[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await writeAllRedis(redis, days);
    return;
  }
  await writeAllFile(days);
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
