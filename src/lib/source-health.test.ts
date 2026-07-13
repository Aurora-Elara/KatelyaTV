import { calculateSourceHealthScore } from './source-health';

describe('source health scoring', () => {
  it('keeps an unknown source neutral', () => {
    const score = calculateSourceHealthScore({
      searchOk: 0,
      searchCount: 0,
      searchLatencyTotal: 0,
      playbackOk: 0,
      playbackCount: 0,
      startupTotal: 0,
      startupCount: 0,
      speedTotal: 0,
      speedCount: 0,
      heightTotal: 0,
      heightCount: 0,
      updatedAt: 0,
    });
    expect(score.searchSuccessRate).toBe(0.5);
    expect(score.playbackSuccessRate).toBe(0.5);
    expect(score.overallScore).toBeGreaterThan(0);
  });

  it('ranks a fast playable 1080p source above a failing source', () => {
    const now = Date.now();
    const healthy = calculateSourceHealthScore(
      {
        searchOk: 9,
        searchCount: 10,
        searchLatencyTotal: 12000,
        playbackOk: 9,
        playbackCount: 10,
        startupTotal: 12000,
        startupCount: 10,
        speedTotal: 45000,
        speedCount: 10,
        heightTotal: 10800,
        heightCount: 10,
        updatedAt: now,
      },
      now
    );
    const failing = calculateSourceHealthScore(
      {
        searchOk: 1,
        searchCount: 10,
        searchLatencyTotal: 55000,
        playbackOk: 0,
        playbackCount: 10,
        startupTotal: 70000,
        startupCount: 10,
        speedTotal: 1000,
        speedCount: 10,
        heightTotal: 4800,
        heightCount: 10,
        updatedAt: now,
      },
      now
    );
    expect(healthy.overallScore).toBeGreaterThan(failing.overallScore);
  });
});
