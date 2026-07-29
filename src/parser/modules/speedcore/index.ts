import { assertSpeedSegment, SpeedSegment } from './segment';

/**
 * Speedcore is a small library used internally.
 * Speedcore represents keyframed linear motion in a single dimension,
 * and is useful when working with BPM changes ({Timing}), note spacing
 * factors ({Spacing}), or scrolling segments ({Positioning}).
 * A Speedcore is created from an array of Segments.
 *
 * A {Segment} is defined as `{ t, x, dx }`, where:
 *
 * * speedcore.x(segment.t) = segment.x
 * * speedcore.t(segment.x) = segment.t
 * * speedcore.x(segment.t + dt) = segment.x + (segment.dx / dt)
 *
 * ## Explanation
 *
 * You can think of these segments as tempo changes, where:
 *
 * * `t` is the elapsed time (in seconds) since the song started.
 * * `x` is the elapsed beats since the song started.
 * * `dx` is the amount `x` increases per `t`, in this case beats per second.
 *
 * For example, consider a song that starts at 140 BPM, changes tempo to
 * 160 BPM after 32 beats, and returns to 140 BPM 128 beats later
 * (at the 160th beat).
 *
 * We can derive three segments:
 *
 * 1. At 0 seconds, we are at beat 0, moving at 2.333 beats per second.
 * 2. At 13.714 seconds, we are at beat 32, moving at 2.667 beats per second.
 * 3. At 61.714 seconds, we are at beat 160, moving at 2.333 beats per second.
 *
 * This structure is represented as follows:
 *
 * ```js
 * [ [0]: { t:  0.000,  x:   0,  dx: 2.333,  inclusive: true },
 *   [1]: { t: 13.714,  x:  32,  dx: 2.667,  inclusive: true },
 *   [2]: { t: 61.714,  x: 160,  dx: 2.333,  inclusive: true } ]
 * ```
 *
 * With this data we can find the value of `x` at any given `t`.
 *
 * For example, to answer "how many beats are at 30 seconds?",
 * find the segment with the largest `t` such that `t < 30`.
 * In this case, that is segment `[1]`.
 *
 * Compute `segment.x + (t - segment.t) * segment.dx`.
 * The resulting number of beats is (32 + (30 - 13.714) * 2.667) = 75.435.
 *
 * The inverse calculation can be performed in a similar way.
 *
 * Interestingly, these segments can also represent the effect of BPM changes
 * and STOP segments in the same array. For example, in a 150 BPM song with
 * a 2-beat stop at the 32nd beat, it can be represented as:
 *
 * ```js
 * [ [0]: { t:  0.0,  x:  0,  dx: 2.5,  inclusive: true  },
 *   [1]: { t: 12.8,  x: 32,  dx: 0,    inclusive: true  },
 *   [2]: { t: 13.6,  x: 32,  dx: 2.5,  inclusive: false } ]
 * ```
 */
export class Speedcore<S extends SpeedSegment = SpeedSegment> {
    _segments: S[];
    /**
     * Creates a new `Speedcore` with the given segments.
     */
    constructor(segments: S[]) {
        segments.forEach(assertSpeedSegment);
        this._segments = segments;
    }

    _reached(index: number, targetFn: (segment: S) => number, position: number) {
        if (index >= this._segments.length) return false;
        const segment = this._segments[index];
        const target = targetFn(segment);
        return segment.inclusive ? position >= target : position > target;
    }

    _segmentAt(targetFn: (segment: S) => number, position: number): S {
        // Binary search for O(log n) lookup (M3)
        // Invariant: _segments are inserted in ascending order of targetFn
        let lo = 0;
        let hi = this._segments.length - 1;
        // Find the last index that satisfies the _reached condition
        let result = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (this._reached(mid, targetFn, position)) {
                result = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return this._segments[result];
    }

    segmentAtX(x: number) {
        return this._segmentAt(X, x);
    }

    segmentAtT(t: number) {
        return this._segmentAt(T, t);
    }

    /**
     * Calculates _t_ given _x_.
     */
    t(x: number) {
        const segment = this.segmentAtX(x);
        return segment.t + (x - segment.x) / (segment.dx || 1);
    }

    /**
     * Calculates _x_ given _t_.
     * @param {number} t
     */
    x(t: number) {
        const segment = this.segmentAtT(t);
        return segment.x + (t - segment.t) * segment.dx;
    }

    /**
     * Finds _dx_ at the given _t_.
     * @param {number} t
     */
    dx(t: number) {
        const segment = this.segmentAtT(t);
        return segment.dx;
    }
}

const T = (segment: SpeedSegment) => segment.t;
const X = (segment: SpeedSegment) => segment.x;
