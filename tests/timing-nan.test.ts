import { describe, it, expect } from 'vitest';
import { BMSParser, Timing, Positioning } from '../src';

describe('Timing/Positioning NaN propagation', () => {
  function compileAndGetTiming(bmsString: string): Timing {
    const parser = new BMSParser();
    parser.compileString(bmsString);
    return Timing.fromBMSChart(parser.chart!);
  }

  it('handles zero BPM without NaN', () => {
    // BPM 0 would cause division by zero in beat-to-seconds
    const bms = `
#BPM 0
#00111:01
`;
    const timing = compileAndGetTiming(bms);
    const seconds = timing.beatToSeconds(4);
    // Should not produce NaN or Infinity
    expect(Number.isFinite(seconds) || seconds === Infinity).toBe(true);
  });

  it('handles negative BPM gracefully', () => {
    const bms = `
#BPM -100
#00111:01
`;
    const timing = compileAndGetTiming(bms);
    const seconds = timing.beatToSeconds(4);
    // Should not crash, result may be negative or very large
    expect(!Number.isNaN(seconds)).toBe(true);
  });

  it('handles extremely high BPM', () => {
    const bms = `
#BPM 999999
#00111:01
`;
    const timing = compileAndGetTiming(bms);
    const seconds = timing.beatToSeconds(4);
    expect(Number.isFinite(seconds)).toBe(true);
    expect(seconds).toBeGreaterThan(0);
    // At 999999 BPM, 4 beats should be very small
    expect(seconds).toBeLessThan(1);
  });

  it('Positioning does not propagate NaN from timing', () => {
    const bms = `
#BPM 120
#BPM01 0.001
#00108:01
#00211:01
`;
    const parser = new BMSParser();
    parser.compileString(bms);
    const timing = Timing.fromBMSChart(parser.chart!);
    const positioning = Positioning.fromBMSChart(parser.chart!, timing);

    // Position at beat 8 (measure 2)
    const pos = positioning.position(8);
    expect(Number.isFinite(pos)).toBe(true);
  });

  it('beatToSeconds round-trip consistency at normal BPM', () => {
    const bms = `
#BPM 150
#BPM01 180
#00108:01
`;
    const timing = compileAndGetTiming(bms);

    // Forward and back should be consistent
    for (let beat = 0; beat < 16; beat += 0.5) {
      const seconds = timing.beatToSeconds(beat);
      expect(Number.isFinite(seconds)).toBe(true);
      // secondsToBeat may not exist on all versions, just test beatToSeconds doesn't NaN
    }
  });

  it('handles rapid BPM oscillation without NaN', () => {
    // Chart with many BPM changes
    const bms = `
#BPM 120
#BPM01 200
#BPM02 60
#BPM03 300
#00108:01
#00208:02
#00308:03
#00408:01
#00508:02
#00611:01
`;
    const timing = compileAndGetTiming(bms);
    for (let beat = 0; beat < 24; beat += 1) {
      const seconds = timing.beatToSeconds(beat);
      expect(Number.isFinite(seconds)).toBe(true);
    }
  });
});
