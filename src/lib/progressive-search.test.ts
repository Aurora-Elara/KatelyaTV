import { runProgressiveQueue } from './progressive-search';

describe('progressive search queue', () => {
  it('respects the concurrency limit and reports completed work', async () => {
    const controller = new AbortController();
    let active = 0;
    let maxActive = 0;
    const completed = await runProgressiveQueue(
      [1, 2, 3, 4],
      2,
      controller.signal,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
      }
    );
    expect(completed).toBe(4);
    expect(maxActive).toBe(2);
  });

  it('does not start additional work after cancellation', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const completed = await runProgressiveQueue(
      [1, 2, 3],
      1,
      controller.signal,
      async (item) => {
        started.push(item);
        controller.abort();
      }
    );
    expect(started).toEqual([1]);
    expect(completed).toBe(1);
  });
});
