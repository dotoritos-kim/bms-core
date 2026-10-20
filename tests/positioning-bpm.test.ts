import { describe, it, expect } from 'vitest';
import { BMSParser, Timing, Positioning } from '../src';

function build(bms: string) {
  const parser = new BMSParser();
  parser.compileString(bms);
  const timing = Timing.fromBMSChart(parser.chart!);
  const positioning = Positioning.fromBMSChart(parser.chart!, timing);
  return { timing, positioning };
}

// The player advances `beat` with time at BPM/60 beats per second and draws
// notes at `position(beat)`. Position must therefore track beats (× SCROLL)
// only; folding the BPM ratio into it again makes on-screen speed scale with
// BPM² instead of BPM.
describe('Positioning across BPM changes', () => {
  const bms = `
#BPM 120
#BPM01 240
#00108:01
`;

  it('keeps one position unit per beat after a BPM change', () => {
    const { positioning } = build(bms);
    expect(positioning.position(4)).toBeCloseTo(4, 9);
    expect(positioning.position(8)).toBeCloseTo(8, 9);
    expect(positioning.speed(2)).toBe(1);
    expect(positioning.speed(6)).toBe(1);
  });

  it('scroll speed per second doubles (not quadruples) when BPM doubles', () => {
    const { timing, positioning } = build(bms);
    const posPerSecond = (fromBeat: number) => {
      const t0 = timing.beatToSeconds(fromBeat);
      return positioning.position(timing.secondsToBeat(t0 + 0.1)) - positioning.position(fromBeat);
    };
    const before = posPerSecond(1); // 120 BPM region
    const after = posPerSecond(5); // 240 BPM region
    expect(after / before).toBeCloseTo(2, 6);
  });

  it('#BASEBPM does not rescale positions per BPM segment', () => {
    const { positioning } = build(`
#BPM 120
#BASEBPM 150
#BPM01 240
#00108:01
`);
    expect(positioning.position(4)).toBeCloseTo(4, 9);
    expect(positioning.position(8)).toBeCloseTo(8, 9);
    expect(positioning.getBaseBpm()).toBe(150);
  });

  it('still applies #SCROLL segments', () => {
    const { positioning } = build(`
#BPM 120
#BPM01 240
#SCROLL01 0.5
#00108:01
#001SC:01
`);
    // beats 0-4 at 1x, beats 4-8 at 0.5x regardless of BPM
    expect(positioning.position(8)).toBeCloseTo(6, 9);
    expect(positioning.speed(6)).toBe(0.5);
  });

  it('effectiveSpeed / bpmRatioAtBeat still expose the BPM ratio', () => {
    const { positioning } = build(bms);
    expect(positioning.bpmRatioAtBeat(6)).toBeCloseTo(2, 9);
    expect(positioning.effectiveSpeed(6)).toBeCloseTo(2, 9);
  });
});
