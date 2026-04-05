import { describe, it, expect } from 'vitest';
import { TimeSignatures } from '../src';

describe('TimeSignatures', () => {
  describe('default 4/4 time signature', () => {
    it('should return size 1 for any measure by default', () => {
      const ts = new TimeSignatures();
      expect(ts.get(0)).toBe(1);
      expect(ts.get(1)).toBe(1);
      expect(ts.get(99)).toBe(1);
    });

    it('should return 4 beats per measure by default', () => {
      const ts = new TimeSignatures();
      expect(ts.getBeats(0)).toBe(4);
      expect(ts.getBeats(5)).toBe(4);
    });

    it('measureToBeat with default signatures should behave as 4/4', () => {
      const ts = new TimeSignatures();
      // measure 0, fraction 0 => beat 0
      expect(ts.measureToBeat(0, 0)).toBe(0);
      // measure 0, fraction 0.5 => beat 2
      expect(ts.measureToBeat(0, 0.5)).toBe(2);
      // measure 1, fraction 0 => beat 4
      expect(ts.measureToBeat(1, 0)).toBe(4);
      // measure 2, fraction 0 => beat 8
      expect(ts.measureToBeat(2, 0)).toBe(8);
      // measure 1, fraction 0.25 => beat 5
      expect(ts.measureToBeat(1, 0.25)).toBe(5);
    });
  });

  describe('non-4/4 time signatures (#xxx02:0.75)', () => {
    it('should handle 3/4 time (size 0.75) on a single measure', () => {
      const ts = new TimeSignatures();
      ts.set(0, 0.75);
      // measure 0 has 3 beats (0.75 * 4)
      expect(ts.getBeats(0)).toBe(3);
      expect(ts.measureToBeat(0, 0)).toBe(0);
      expect(ts.measureToBeat(0, 0.5)).toBe(1.5);
      // measure 1 starts at beat 3, default 4/4
      expect(ts.measureToBeat(1, 0)).toBe(3);
    });

    it('should handle 7/8 time (size 0.875)', () => {
      const ts = new TimeSignatures();
      ts.set(0, 0.875);
      expect(ts.getBeats(0)).toBe(3.5);
      expect(ts.measureToBeat(1, 0)).toBe(3.5);
    });

    it('should handle half-size measures (size 0.5 = 2/4)', () => {
      const ts = new TimeSignatures();
      ts.set(0, 0.5);
      expect(ts.getBeats(0)).toBe(2);
      expect(ts.measureToBeat(0, 0.5)).toBe(1);
      expect(ts.measureToBeat(1, 0)).toBe(2);
    });

    it('should handle double-size measures (size 2.0 = 8/4)', () => {
      const ts = new TimeSignatures();
      ts.set(0, 2.0);
      expect(ts.getBeats(0)).toBe(8);
      expect(ts.measureToBeat(0, 0.5)).toBe(4);
      expect(ts.measureToBeat(1, 0)).toBe(8);
    });
  });

  describe('multiple measures with different signatures', () => {
    it('should accumulate beats across measures with mixed signatures', () => {
      const ts = new TimeSignatures();
      // Matches the docstring example:
      // measure 0: size 1 (4 beats), measure 1: size 0.75 (3 beats), measure 2: size 1.25 (5 beats)
      ts.set(1, 0.75);
      ts.set(2, 1.25);

      // measure 0 fraction 0 => 0
      expect(ts.measureToBeat(0, 0)).toBe(0);
      // measure 0 fraction 0.5 => 2
      expect(ts.measureToBeat(0, 0.5)).toBe(2);
      // measure 1 fraction 0 => 4 (after 4 beats in measure 0)
      expect(ts.measureToBeat(1, 0)).toBe(4);
      // measure 1 fraction 0.5 => 4 + 0.5 * 3 = 5.5
      expect(ts.measureToBeat(1, 0.5)).toBe(5.5);
      // measure 2 fraction 0 => 4 + 3 = 7
      expect(ts.measureToBeat(2, 0)).toBe(7);
      // measure 2 fraction 0.5 => 7 + 0.5 * 5 = 9.5
      expect(ts.measureToBeat(2, 0.5)).toBe(9.5);
      // measure 3 fraction 0 => 7 + 5 = 12
      expect(ts.measureToBeat(3, 0)).toBe(12);
    });

    it('should handle alternating time signatures', () => {
      const ts = new TimeSignatures();
      // Alternating 3/4 and 4/4
      ts.set(0, 0.75); // 3 beats
      // measure 1 default: 4 beats
      ts.set(2, 0.75); // 3 beats
      // measure 3 default: 4 beats

      expect(ts.measureToBeat(0, 0)).toBe(0);
      expect(ts.measureToBeat(1, 0)).toBe(3);   // after 3 beats
      expect(ts.measureToBeat(2, 0)).toBe(7);   // after 3 + 4
      expect(ts.measureToBeat(3, 0)).toBe(10);  // after 3 + 4 + 3
      expect(ts.measureToBeat(4, 0)).toBe(14);  // after 3 + 4 + 3 + 4
    });
  });

  describe('edge cases', () => {
    it('measure 0 with fraction 0 should always be beat 0', () => {
      const ts = new TimeSignatures();
      expect(ts.measureToBeat(0, 0)).toBe(0);

      ts.set(0, 0.75);
      expect(ts.measureToBeat(0, 0)).toBe(0);

      ts.set(0, 2.0);
      expect(ts.measureToBeat(0, 0)).toBe(0);
    });

    it('measure 0 with fraction 1.0 should equal the full measure beat count', () => {
      const ts = new TimeSignatures();
      expect(ts.measureToBeat(0, 1.0)).toBe(4);

      ts.set(0, 0.75);
      expect(ts.measureToBeat(0, 1.0)).toBe(3);
    });

    it('should handle large measure numbers', () => {
      const ts = new TimeSignatures();
      // All default 4/4 => measure 999 starts at beat 999*4 = 3996
      expect(ts.measureToBeat(999, 0)).toBe(3996);
    });

    it('should handle large measure with custom signature', () => {
      const ts = new TimeSignatures();
      ts.set(500, 0.5); // measure 500 is 2 beats
      // measure 501 starts at: 500*4 + 2 = 2002
      expect(ts.measureToBeat(501, 0)).toBe(2002);
    });

    it('set and get should be consistent', () => {
      const ts = new TimeSignatures();
      ts.set(5, 0.75);
      expect(ts.get(5)).toBe(0.75);
      expect(ts.get(4)).toBe(1); // unset => default
    });
  });
});
