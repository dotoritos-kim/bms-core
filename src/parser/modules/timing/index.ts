import { Speedcore } from '../speedcore';
import { uniq, map } from '../../utils/lodash';
import { BMSChart } from '../../bms/chart';
import { SpeedSegment } from '../speedcore/segment';

const precedence = { bpm: 1, stop: 2 };

/** BPM applied when #BPM is omitted (BMS spec default). */
export const DEFAULT_BPM = 130;

/**
 * Raw definition referenced by a channel-08 (extended BPM) object.
 * `#EXBPMxx n` is an alias of `#BPMxx n` (nanasi, pomu2, ... — introduced to
 * dodge a BMSC bug); `#BPMxx` wins when both are defined.
 * @returns the header value, or undefined when neither is defined
 */
export function extendedBpmHeader(
    headers: { get(name: string): string | undefined },
    id: string,
): string | undefined {
    return headers.get('bpm' + id) ?? headers.get('exbpm' + id);
}

/**
 * Timing represents the timing information of a chart.
 * A Timing object provides facilities to synchronize between metric time
 * (seconds) and musical time (beats).
 *
 * A Timing is created from several actions:
 *
 * - BPM changes
 * - STOP actions
 */
export class Timing {
    _speedcore: Speedcore<TimingSegment>;
    _eventBeats: number[];
    /**
     * Creates a Timing with an initial BPM and the specified actions.
     *
     * Usually you would use `Timing.fromBMSChart` to create an instance from a BMSChart.
     */
    constructor(initialBPM: number, actions: TimingAction[]) {
        const state = { bpm: initialBPM, beat: 0, seconds: 0 };
        const segments: TimingSegment[] = [];
        segments.push({
            t: 0,
            x: 0,
            dx: state.bpm / 60,
            bpm: state.bpm,
            inclusive: true,
        });
        actions = actions.slice();
        actions.sort(function (a, b) {
            return a.beat - b.beat || precedence[a.type] - precedence[b.type];
        });
        actions.forEach(function (action) {
            const beat = action.beat;
            let seconds = state.seconds + ((beat - state.beat) * 60) / state.bpm;
            switch (action.type) {
                case 'bpm':
                    state.bpm = action.bpm;
                    segments.push({
                        t: seconds,
                        x: beat,
                        dx: state.bpm / 60,
                        bpm: state.bpm,
                        inclusive: true,
                    });
                    break;
                case 'stop': {
                    const stopBeats = action.stopBeats || 0;
                    if (stopBeats >= 0) {
                        // Positive STOP: pause (existing behavior)
                        segments.push({
                            t: seconds,
                            x: beat,
                            dx: 0,
                            bpm: state.bpm,
                            inclusive: true,
                        });
                        seconds += (stopBeats * 60) / state.bpm;
                        segments.push({
                            t: seconds,
                            x: beat,
                            dx: state.bpm / 60,
                            bpm: state.bpm,
                            inclusive: false,
                        });
                    } else {
                        // Negative STOP: beats move backwards (rewind effect)
                        // Time advances normally while beats decrease
                        const negativeDuration = Math.abs(stopBeats * 60 / state.bpm);
                        segments.push({
                            t: seconds,
                            x: beat,
                            dx: -state.bpm / 60, // backwards
                            bpm: state.bpm,
                            inclusive: true,
                        });
                        seconds += negativeDuration;
                        // After rewinding, return to the original beat + stopBeats (a decreased position, since it is negative)
                        segments.push({
                            t: seconds,
                            x: beat + stopBeats, // less than beat, since stopBeats is negative
                            dx: state.bpm / 60,
                            bpm: state.bpm,
                            inclusive: false,
                        });
                    }
                    break;
                }
                default:
                    throw new Error('인식할 수 없는 세그먼트 객체입니다!');
            }
            state.beat = beat;
            state.seconds = seconds;
        });
        this._speedcore = new Speedcore(segments);
        this._eventBeats = uniq(map(actions, (action) => action.beat));
    }

    /**
     * Converts the given beat to seconds.
     * @param {number} beat
     */
    beatToSeconds(beat: number) {
        return this._speedcore.t(beat);
    }

    /**
     * Converts the given seconds to beats.
     * @param {number} seconds
     */
    secondsToBeat(seconds: number) {
        return this._speedcore.x(seconds);
    }

    /**
     * Returns the BPM at the specified beat.
     * @param {number} beat
     */
    bpmAtBeat(beat: number) {
        return this._speedcore.segmentAtX(beat).bpm;
    }

    /**
     * Returns an array of the beats that have events.
     */
    getEventBeats() {
        return this._eventBeats;
    }

    /**
     * Returns all BPM change points and their BPM values.
     * Used for BASEBPM normalization.
     */
    getBpmSegments(): { beat: number; bpm: number }[] {
        const segments = this._speedcore._segments;
        const result: { beat: number; bpm: number }[] = [];
        let lastBpm = -1;
        for (const seg of segments) {
            if (seg.bpm !== lastBpm) {
                result.push({ beat: seg.x, bpm: seg.bpm });
                lastBpm = seg.bpm;
            }
        }
        return result;
    }

    /**
     * Returns the initial BPM (the BPM at the start of the song).
     */
    getInitialBpm(): number {
        return this._speedcore._segments[0]?.bpm ?? 120;
    }

    /**
     * Creates a Timing instance from a BMSChart.
     * @param {BMSChart} chart
     */
    static fromBMSChart(chart: BMSChart) {
        void BMSChart;
        const actions: TimingAction[] = [];
        chart.objects.all().forEach(function (object) {
            let bpm;
            const beat = chart.measureToBeat(object.measure, object.fraction);
            if (object.channel === '03') {
                bpm = parseInt(object.value, 16);
                actions.push({ type: 'bpm', beat: beat, bpm: bpm });
            } else if (object.channel === '08') {
                bpm = +extendedBpmHeader(chart.headers, object.value)!;
                if (!isNaN(bpm)) actions.push({ type: 'bpm', beat: beat, bpm: bpm });
            } else if (object.channel === '09') {
                const stopBeats = +chart.headers.get('stop' + object.value)! / 48;
                actions.push({ type: 'stop', beat: beat, stopBeats: stopBeats });
            }
        });
        return new Timing(+chart.headers.get('bpm')! || DEFAULT_BPM, actions);
    }
}

export type TimingAction = BPMTimingAction | StopTimingAction;
export interface BaseTimingAction {
    /** The position where this action occurs */
    beat: number;
}
export interface BPMTimingAction extends BaseTimingAction {
    type: 'bpm';
    /** The BPM value to change to */
    bpm: number;
}
export interface StopTimingAction extends BaseTimingAction {
    type: 'stop';
    /** The number of beats to stop */
    stopBeats: number;
}

interface TimingSegment extends SpeedSegment {
    bpm: number;
}
