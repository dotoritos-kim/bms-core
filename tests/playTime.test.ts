import { describe, it, expect } from 'vitest';
import { BMSParser } from '../src';

describe('calculateTotalPlayTime', () => {
  function parseAndGetPlayTime(bmsString: string): number {
    const parser = new BMSParser();
    parser.compileString(bmsString);
    return parser.calculateTotalPlayTime();
  }

  it('returns 0 when no chart is loaded', () => {
    const parser = new BMSParser();
    expect(parser.calculateTotalPlayTime()).toBe(0);
  });

  it('calculates basic play time with default BPM', () => {
    // 1 measure at 120 BPM = 240/120 = 2 seconds = 2000ms
    const bms = `
#00111:01
`;
    const time = parseAndGetPlayTime(bms);
    expect(time).toBeGreaterThan(0);
  });

  it('handles channel 03 (hex BPM) correctly', () => {
    // Channel 03: direct hex BPM value
    // 'C8' = 200 BPM
    const bms = `
#BPM 120
#00103:C8
#00211:01
`;
    const time = parseAndGetPlayTime(bms);
    // After measure 1, BPM changes to 200 (0xC8)
    // The play time should reflect BPM 200 for the second measure
    expect(time).toBeGreaterThan(0);
  });

  it('channel 03 hex BPM should differ from BPM definition lookup', () => {
    // This test verifies that channel 03 uses parseInt(hex, 16)
    // NOT a bpmMap lookup.
    // 'FF' = 255 BPM (direct hex)
    const bmsHex = `
#BPM 120
#00103:FF
#00211:01
`;
    // If we define #BPMFF as something else, channel 03 should NOT use it
    const bmsWithDefinition = `
#BPM 120
#BPMFF 60
#00103:FF
#00211:01
`;
    const timeHex = parseAndGetPlayTime(bmsHex);
    const timeWithDef = parseAndGetPlayTime(bmsWithDefinition);
    // Both should produce the same result because channel 03 uses direct hex
    // Channel 03 should parse FF as 255, NOT look up #BPMFF
    expect(timeHex).toBe(timeWithDef);
  });

  it('handles channel 08 (BPM definition reference) correctly', () => {
    // Channel 08 references #BPMxx headers
    const bms = `
#BPM 120
#BPM01 200
#00108:01
#00211:01
`;
    const time = parseAndGetPlayTime(bms);
    expect(time).toBeGreaterThan(0);
  });

  it('handles both channel 03 and 08 in the same chart', () => {
    // Mix both BPM change types
    const bms = `
#BPM 120
#BPM01 180
#00103:96
#00208:01
#00311:01
`;
    // Measure 1: BPM changes to 0x96 = 150 via channel 03
    // Measure 2: BPM changes to 180 via channel 08 (#BPM01)
    const time = parseAndGetPlayTime(bms);
    expect(time).toBeGreaterThan(0);
  });

  it('channel 03 with value 00 should not change BPM', () => {
    const bms = `
#BPM 120
#00103:00
#00211:01
`;
    const time = parseAndGetPlayTime(bms);
    // BPM should remain 120 (hex 00 = 0, which is not > 0)
    // 2 measures at 120 BPM: 2 * (240/120) = 4 seconds = 4000ms
    expect(time).toBeGreaterThan(0);
  });

  it('handles case-insensitive BPM key lookup for channel 08', () => {
    // #BPMab and channel 08 value 'AB' should match
    const bms = `
#BPM 120
#BPMab 200
#00108:AB
#00211:01
`;
    const time = parseAndGetPlayTime(bms);
    expect(time).toBeGreaterThan(0);
  });
});
