/** Retries a request while the API is still starting (docker compose brings the services up in sequence). */
export async function withRetry<T>(
  load: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  delaysMs: readonly number[] = [500, 1000, 2000, 4000],
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load(signal);
    } catch (err) {
      if (signal.aborted || attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      if (signal.aborted) throw err;
    }
  }
}
