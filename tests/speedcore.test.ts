import { describe, it, expect } from 'vitest';
import { Speedcore } from '../src/parser/modules/speedcore';
import type { SpeedSegment } from '../src/parser/modules/speedcore/segment';

function seg(t: number, x: number, dx: number, inclusive = true): SpeedSegment {
  return { t, x, dx, inclusive };
}

describe('Speedcore', () => {
  describe('single segment', () => {
    it('should compute x from t with a single segment', () => {
      const sc = new Speedcore([seg(0, 0, 2)]);
      expect(sc.x(0)).toBe(0);
      expect(sc.x(1)).toBe(2);
      expect(sc.x(5)).toBe(10);
    });

    it('should compute t from x with a single segment', () => {
      const sc = new Speedcore([seg(0, 0, 2)]);
      expect(sc.t(0)).toBe(0);
      expect(sc.t(2)).toBe(1);
      expect(sc.t(10)).toBe(5);
    });

    it('should return dx at any t', () => {
      const sc = new Speedcore([seg(0, 0, 3.5)]);
      expect(sc.dx(0)).toBe(3.5);
      expect(sc.dx(100)).toBe(3.5);
    });

    it('should handle non-zero origin segment', () => {
      const sc = new Speedcore([seg(10, 100, 5)]);
      // x(10) = 100 + (10-10)*5 = 100
      expect(sc.x(10)).toBe(100);
      // x(12) = 100 + (12-10)*5 = 110
      expect(sc.x(12)).toBe(110);
      // t(100) = 10 + (100-100)/5 = 10
      expect(sc.t(100)).toBe(10);
      // t(110) = 10 + (110-100)/5 = 12
      expect(sc.t(110)).toBe(12);
    });
  });

  describe('multiple segments', () => {
    it('should switch segments based on t', () => {
      const sc = new Speedcore([
        seg(0, 0, 2),
        seg(5, 10, 4),
      ]);
      // Before switch
      expect(sc.x(0)).toBe(0);
      expect(sc.x(3)).toBe(6);
      // After switch
      expect(sc.x(5)).toBe(10);
      expect(sc.x(7)).toBe(18);
    });

    it('should switch segments based on x for t()', () => {
      const sc = new Speedcore([
        seg(0, 0, 2),
        seg(5, 10, 4),
      ]);
      expect(sc.t(0)).toBe(0);
      expect(sc.t(6)).toBe(3);
      expect(sc.t(10)).toBe(5);
      expect(sc.t(18)).toBe(7);
    });
  });

  describe('zero dx segments (STOP / division by zero guard)', () => {
    it('t() should use fallback of 1 when dx is 0', () => {
      // When dx=0, the code does: segment.t + (x - segment.x) / (segment.dx || 1)
      // So for dx=0, it uses 1 as divisor
      const sc = new Speedcore([
        seg(0, 0, 0),
      ]);
      // t(0) = 0 + (0-0)/(0||1) = 0
      expect(sc.t(0)).toBe(0);
      // t(5) = 0 + (5-0)/(0||1) = 5
      expect(sc.t(5)).toBe(5);
    });

    it('x() should return same x when dx is 0 (STOP behavior)', () => {
      // x(t) = segment.x + (t - segment.t) * segment.dx
      // With dx=0: x is always segment.x regardless of t
      const sc = new Speedcore([
        seg(0, 0, 2),
        seg(5, 10, 0, true),     // STOP at x=10
        seg(7, 10, 2, false),    // resume
      ]);
      // During stop: x stays at 10
      expect(sc.x(5)).toBe(10);
      expect(sc.x(6)).toBe(10);
      expect(sc.x(6.9)).toBe(10);
      // After stop resumes
      expect(sc.x(8)).toBe(12);
    });

    it('t() should handle transition through a zero-dx stop segment', () => {
      const sc = new Speedcore([
        seg(0, 0, 2),
        seg(5, 10, 0, true),
        seg(7, 10, 2, false),
      ]);
      // Before stop
      expect(sc.t(6)).toBe(3);
      // At stop boundary x=10, first segment with inclusive match
      expect(sc.t(10)).toBe(5 + (10 - 10) / (0 || 1)); // = 5
      // After stop: t(12) => segment[2]: 7 + (12-10)/2 = 8
      expect(sc.t(12)).toBe(8);
    });
  });

  describe('negative dx', () => {
    it('x() should decrease over time with negative dx', () => {
      const sc = new Speedcore([
        seg(0, 100, -2),
      ]);
      expect(sc.x(0)).toBe(100);
      expect(sc.x(5)).toBe(90);
      expect(sc.x(50)).toBe(0);
    });

    it('t() should work correctly with negative dx', () => {
      const sc = new Speedcore([
        seg(0, 100, -2),
      ]);
      // t(100) = 0 + (100-100)/(-2) = 0
      expect(sc.t(100)).toBe(0);
      // t(90) = 0 + (90-100)/(-2) = 5
      expect(sc.t(90)).toBe(5);
    });
  });

  describe('empty segments', () => {
    it('should throw when calling x() with no segments', () => {
      const sc = new Speedcore([]);
      expect(() => sc.x(0)).toThrow();
    });

    it('should throw when calling t() with no segments', () => {
      const sc = new Speedcore([]);
      expect(() => sc.t(0)).toThrow();
    });

    it('should throw when calling dx() with no segments', () => {
      const sc = new Speedcore([]);
      expect(() => sc.dx(0)).toThrow();
    });
  });

  describe('inclusive vs exclusive segments', () => {
    it('should respect inclusive flag when choosing segment', () => {
      const sc = new Speedcore([
        seg(0, 0, 2, true),
        seg(5, 10, 0, true),     // inclusive at t=5
        seg(5, 10, 3, false),    // exclusive at t=5 (only reached when t > 5)
      ]);
      // At exactly t=5, should use segment[1] (inclusive, dx=0)
      expect(sc.x(5)).toBe(10);
      expect(sc.dx(5)).toBe(0);
    });
  });
});
