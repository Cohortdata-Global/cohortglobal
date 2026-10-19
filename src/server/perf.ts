import "server-only";

/**
 * Request timing for finding slowness (plan item P1).
 * Prints lines like "[perf] get_my_context 48 ms" in the terminal running the app.
 * On by default in development; in production set CG_PERF=1 to enable.
 */
const enabled = process.env.NODE_ENV !== "production" || process.env.CG_PERF === "1";

export async function timed<T>(label: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
  if (!enabled) return typeof work === "function" ? await work() : await work;
  const start = performance.now();
  try {
    return typeof work === "function" ? await work() : await work;
  } finally {
    const ms = performance.now() - start;
    const flag = ms > 400 ? " (slow)" : "";
    console.log(`[perf] ${label} ${Math.round(ms)} ms${flag}`);
  }
}
