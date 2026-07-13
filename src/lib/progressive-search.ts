export async function runProgressiveQueue<T>(
  items: T[],
  concurrency: number,
  signal: AbortSignal,
  worker: (item: T, index: number) => Promise<void>
): Promise<number> {
  let cursor = 0;
  let completed = 0;

  const runWorker = async () => {
    while (!signal.aborted) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (!item) return;
      await worker(item, index);
      completed += 1;
    }
  };

  await Promise.allSettled(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => runWorker()
    )
  );
  return completed;
}
