export type ProgressStorageInfo =
  | { mode: "local"; pathLabel: string }
  | { mode: "custom"; pathLabel: string }
  | { mode: "redis"; pathLabel: string }
  | { mode: "unconfigured"; pathLabel: string };

export function hasUpstashRedis(): boolean {
  return (
    !!process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function getProgressStorageInfo(): ProgressStorageInfo {
  if (hasUpstashRedis()) {
    return {
      mode: "redis",
      pathLabel: "Upstash Redis (persistent)",
    };
  }
  if (process.env.PROGRESS_STORAGE_PATH) {
    return { mode: "custom", pathLabel: process.env.PROGRESS_STORAGE_PATH };
  }
  if (process.env.VERCEL === "1") {
    return {
      mode: "unconfigured",
      pathLabel: "Add Upstash Redis env vars (see banner)",
    };
  }
  return { mode: "local", pathLabel: "data/progress.json" };
}
