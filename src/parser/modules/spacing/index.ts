import { Speedcore } from '../speedcore';
import { BMSChart } from '../../bms/chart';
import { SpeedSegment } from '../speedcore/segment';

/**
 * Spacing represents the relationship between a song's beats and note spacing.
 *
 * In some rhythm games, such as Pump It Up!,
 * the speed (note spacing factor) can be adjusted by the notechart.
 * StepMania's `#SPEED` segments are one example.
 */
export class Spacing {
    private _speedcore?: Speedcore;
    /**
     * Creates a Spacing from the given `segments`.
     */
    constructor(segments: SpacingSegment[]) {
        if (segments.length > 0) {
            this._speedcore = new Speedcore(segments);
        }
    }

    /**
     * Returns the note spacing factor at the specified beat.
     * @param beat the beat
     */
    factor(beat: number) {
        if (this._speedcore) {
            return this._speedcore.x(beat);
        } else {
            return 1;
        }
    }

    /**
     * Creates a Spacing object from a BMSChart.
     *
     * ## `#SPEED` and `#xxxSP`
     *
     * Speeds are defined as keyframes. These keyframes are interpolated linearly.
     *
     * ```
     * #SPEED01 1.0
     * #SPEED02 2.0
     *
     * #001SP:01010202
     * ```
     *
     * In this example, the note spacing factor starts at 1.0x at beat 1
     * and gradually changes to 2.0x at beat 2.
     *
     * Returns a Spacing object.
     *
     * @param {BMSChart} chart the chart
     */
    static fromBMSChart(chart: BMSChart) {
        void BMSChart;
        const segments: SpacingSegment[] = [];
        chart.objects.allSorted().forEach(function (object) {
            if (object.channel === 'SP') {
                const beat = chart.measureToBeat(object.measure, object.fraction);
                const factor = +chart.headers.get('speed' + object.value)!;
                if (isNaN(factor)) return;
                if (segments.length > 0) {
                    const previous = segments[segments.length - 1];
                    previous.dx = (factor - previous.x) / (beat - previous.t);
                }
                segments.push({
                    t: beat,
                    x: factor,
                    dx: 0,
                    inclusive: true,
                });
            }
        });
        if (segments.length > 0) {
            segments.unshift({
                t: 0,
                x: segments[0].x,
                dx: 0,
                inclusive: true,
            });
        }
        return new Spacing(segments);
    }
}

export interface SpacingSegment extends SpeedSegment {
    /** Beat number */
    t: number;
    /** Spacing at beat `t` */
    x: number;
    /**
     * Change in the spacing factor per beat, used to create continuous speed changes
     */
    dx: number;
    /**
     * Whether the starting beat `t` is included as part of the segment
     */
    inclusive: boolean;
}
