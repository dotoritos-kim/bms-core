import { Speedcore } from '../speedcore';
import { BMSChart } from '../../bms/chart';
import { SpeedSegment } from '../speedcore/segment';
import { Timing } from '../timing';

/**
 * Positioning represents the relationship between a song's beats and
 * on-screen positions, and provides ways to convert between the two.
 *
 * In some rhythm games, the amount of scrolling per beat can vary.
 * StepMania's `#SCROLL` segments are one example.
 *
 * Positions advance by beats × `#SCROLL` only. BPM is deliberately NOT
 * folded in: the player already advances the current beat at BPM/60 beats
 * per second, so scaling position by currentBPM / baseBPM as well would make
 * on-screen speed grow with BPM² instead of BPM. `#BASEBPM` is the reference
 * for hi-speed auto-setting; the BPM ratio is exposed separately via
 * `bpmRatioAtBeat()` / `effectiveSpeed()`.
 */
export class Positioning {
    _speedcore: Speedcore;
    _baseBpm: number | null = null;
    _timing: Timing | null = null;

    /**
     * Creates a Positioning from the given `segments`.
     * @param segments
     * @param baseBpm the #BASEBPM value (if set)
     * @param timing Timing object (used by `bpmRatioAtBeat()` / `effectiveSpeed()`)
     */
    constructor(segments: PositioningSegment[], baseBpm?: number | null, timing?: Timing | null) {
        this._speedcore = new Speedcore(segments);
        this._baseBpm = baseBpm ?? null;
        this._timing = timing ?? null;
    }

    /**
     * Returns the scroll speed (position units per beat) at the specified beat.
     * @param beat beat number
     */
    speed(beat: number) {
        return this._speedcore.dx(beat);
    }

    /**
     * Returns the raw scroll speed at the specified beat (no BPM normalization).
     * Returns only the speed set by SCROLL commands.
     * @param beat beat number
     */
    rawScrollSpeed(beat: number) {
        return this._speedcore.dx(beat);
    }

    /**
     * Returns the effective scroll speed at the specified beat.
     * Takes both the scroll speed and the BPM ratio into account.
     * Used for visual effects such as width scaling.
     * @param beat beat number
     */
    effectiveSpeed(beat: number) {
        const scrollSpeed = this._speedcore.dx(beat);
        const bpmRatio = this.bpmRatioAtBeat(beat);
        return scrollSpeed * bpmRatio;
    }

    /**
     * Returns the total accumulated scroll amount at the specified beat.
     * @param beat beat number
     */
    position(beat: number) {
        return this._speedcore.x(beat);
    }

    /**
     * Returns the #BASEBPM value.
     */
    getBaseBpm(): number | null {
        return this._baseBpm;
    }

    /**
     * Returns the BPM ratio at the specified beat.
     * - When BASEBPM is set: currentBPM / BASEBPM
     * - Otherwise: currentBPM / initialBPM
     * @param beat beat number
     */
    bpmRatioAtBeat(beat: number): number {
        if (!this._timing) return 1;
        const currentBpm = this._timing.bpmAtBeat(beat);
        const baseBpm = this._baseBpm ?? this._timing.getInitialBpm();
        if (baseBpm <= 0) return 1;
        return currentBpm / baseBpm;
    }

    /**
     * Creates a Positioning object from a BMSChart.
     * @param {BMSChart} chart the BMSChart to create the Positioning from
     * @param {Timing} timing Timing object (needed for `bpmRatioAtBeat()`, optional)
     */
    static fromBMSChart(chart: BMSChart, timing?: Timing) {
        void BMSChart;
        const segments: SpeedSegment[] = [];
        let x = 0;
        segments.push({
            t: 0,
            x: x,
            dx: 1,
            inclusive: true,
        });
        chart.objects.allSorted().forEach(function (object) {
            if (object.channel === 'SC') {
                const beat = chart.measureToBeat(object.measure, object.fraction);
                const dx = +chart.headers.get('scroll' + object.value)!;
                if (isNaN(dx)) return;
                const previous = segments[segments.length - 1];
                x += (beat - previous.t) * previous.dx;
                if (beat === 0 && segments.length === 1) {
                    segments[0].dx = dx;
                } else {
                    segments.push({
                        t: beat,
                        x: x,
                        dx: dx,
                        inclusive: true,
                    });
                }
            }
        });

        // Parse #BASEBPM
        const baseBpmHeader = chart.headers.get('BASEBPM');
        const baseBpm = baseBpmHeader ? parseFloat(baseBpmHeader) : null;

        return new Positioning(segments, baseBpm, timing);
    }
}

export interface PositioningSegment extends SpeedSegment {
    /** Beat number */
    t: number;
    /** Total accumulated scroll amount at beat `t` */
    x: number;
    /** Scroll amount per beat */
    dx: number;
    /** Whether the starting beat `t` is included as part of the segment */
    inclusive: boolean;
}
