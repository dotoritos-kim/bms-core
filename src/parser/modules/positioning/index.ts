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
 * When #BASEBPM is set, the scroll speed is normalized against BPM changes.
 * normalizedSpeed = currentBPM / baseBPM
 */
export class Positioning {
    _speedcore: Speedcore;
    _normalizedSpeedcore: Speedcore | null = null;
    _baseBpm: number | null = null;
    _timing: Timing | null = null;

    /**
     * Creates a Positioning from the given `segments`.
     * @param segments
     * @param baseBpm the #BASEBPM value (if set)
     * @param timing Timing object (needed to reflect BPM changes)
     */
    constructor(segments: PositioningSegment[], baseBpm?: number | null, timing?: Timing | null) {
        this._speedcore = new Speedcore(segments);
        this._baseBpm = baseBpm ?? null;
        this._timing = timing ?? null;

        // If Timing is available, build normalized segments that reflect BPM changes.
        // Without BASEBPM, the initial BPM is used as the reference.
        if (this._timing) {
            this._normalizedSpeedcore = this._buildNormalizedSpeedcore(segments);
        }
    }

    /**
     * Builds a Speedcore that reflects BPM changes.
     * Merges SCROLL segments with BPM change points to produce new segments.
     * Without BASEBPM, the initial BPM is used as the reference.
     */
    private _buildNormalizedSpeedcore(scrollSegments: PositioningSegment[]): Speedcore {
        if (!this._timing) {
            return new Speedcore(scrollSegments);
        }

        const bpmSegments = this._timing.getBpmSegments();
        // Use the initial BPM when BASEBPM is not set
        const baseBpm = this._baseBpm ?? this._timing.getInitialBpm();

        // If baseBpm is invalid, return without normalization
        if (!baseBpm || baseBpm <= 0) {
            return new Speedcore(scrollSegments);
        }

        // Collect all event points (SCROLL + BPM)
        const eventBeats = new Set<number>();
        for (const seg of scrollSegments) eventBeats.add(seg.t);
        for (const seg of bpmSegments) eventBeats.add(seg.beat);
        const sortedBeats = Array.from(eventBeats).sort((a, b) => a - b);

        // Compute the SCROLL speed and BPM at each point to build new segments
        const normalizedSegments: SpeedSegment[] = [];
        let position = 0;

        for (let i = 0; i < sortedBeats.length; i++) {
            const beat = sortedBeats[i];
            const scrollSpeed = this._speedcore.dx(beat);
            const currentBpm = this._timing.bpmAtBeat(beat);
            const bpmRatio = currentBpm / baseBpm;
            const normalizedSpeed = scrollSpeed * bpmRatio;

            // If there is a previous segment, compute the position
            if (i > 0) {
                const prevBeat = sortedBeats[i - 1];
                const prevSeg = normalizedSegments[normalizedSegments.length - 1];
                position = prevSeg.x + (beat - prevBeat) * prevSeg.dx;
            }

            normalizedSegments.push({
                t: beat,
                x: position,
                dx: normalizedSpeed,
                inclusive: true,
            });
        }

        // If there are no segments, add a default one
        if (normalizedSegments.length === 0) {
            normalizedSegments.push({
                t: 0,
                x: 0,
                dx: 1,
                inclusive: true,
            });
        }

        return new Speedcore(normalizedSegments);
    }

    /**
     * Returns the scroll speed at the specified beat.
     * When #BASEBPM is set, it is normalized by the BPM ratio.
     * @param beat beat number
     */
    speed(beat: number) {
        if (this._normalizedSpeedcore) {
            return this._normalizedSpeedcore.dx(beat);
        }
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
     * When #BASEBPM is set, BPM normalization is applied.
     * @param beat beat number
     */
    position(beat: number) {
        if (this._normalizedSpeedcore) {
            return this._normalizedSpeedcore.x(beat);
        }
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
     * @param {Timing} timing Timing object (needed for #BASEBPM normalization, optional)
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
