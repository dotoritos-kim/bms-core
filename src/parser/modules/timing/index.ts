import { Speedcore } from '../speedcore';
import { uniq, map } from '../../utils/lodash';
import { BMSChart } from '../../bms/chart';
import { SpeedSegment } from '../speedcore/segment';

const precedence = { bpm: 1, stop: 2 };

/**
 * Timing은 악보의 타이밍 정보를 나타냅니다.
 * Timing 객체는 메트릭 시간(초)과 음악 시간(박자) 간 동기화를 위한 기능을 제공합니다.
 *
 * Timing은 여러 작업(action)으로 생성됩니다:
 *
 * - BPM 변경
 * - 정지(STOP) 작업
 */
export class Timing {
    _speedcore: Speedcore<TimingSegment>;
    _eventBeats: number[];
    /**
     * 초기 BPM 및 지정된 작업으로 Timing을 생성합니다.
     *
     * 일반적으로 `Timing.fromBMSChart`를 사용하여 BMSChart에서 인스턴스를 생성합니다.
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
                        // 양수 STOP: 일시정지 (기존 동작)
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
                        // 음수 STOP: 비트가 역방향으로 진행 (역행 효과)
                        // 시간은 정상 진행, 비트는 감소
                        const negativeDuration = Math.abs(stopBeats * 60 / state.bpm);
                        segments.push({
                            t: seconds,
                            x: beat,
                            dx: -state.bpm / 60, // 역방향
                            bpm: state.bpm,
                            inclusive: true,
                        });
                        seconds += negativeDuration;
                        // 역행 후 원래 비트 + stopBeats (음수이므로 감소된 위치)로 복귀
                        segments.push({
                            t: seconds,
                            x: beat + stopBeats, // 음수이므로 beat보다 작음
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
     * 주어진 박자를 초 단위로 변환합니다.
     * @param {number} beat
     */
    beatToSeconds(beat: number) {
        return this._speedcore.t(beat);
    }

    /**
     * 주어진 초를 박자로 변환합니다.
     * @param {number} seconds
     */
    secondsToBeat(seconds: number) {
        return this._speedcore.x(seconds);
    }

    /**
     * 지정된 박자의 BPM을 반환합니다.
     * @param {number} beat
     */
    bpmAtBeat(beat: number) {
        return this._speedcore.segmentAtX(beat).bpm;
    }

    /**
     * 이벤트가 있는 박자를 나타내는 배열을 반환합니다.
     */
    getEventBeats() {
        return this._eventBeats;
    }

    /**
     * 모든 BPM 변경 지점과 해당 BPM 값을 반환합니다.
     * BASEBPM 정규화에 사용됩니다.
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
     * 초기 BPM (곡 시작 시점의 BPM)을 반환합니다.
     */
    getInitialBpm(): number {
        return this._speedcore._segments[0]?.bpm ?? 120;
    }

    /**
     * BMSChart에서 Timing 인스턴스를 생성합니다.
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
                bpm = +chart.headers.get('bpm' + object.value)!;
                if (!isNaN(bpm)) actions.push({ type: 'bpm', beat: beat, bpm: bpm });
            } else if (object.channel === '09') {
                const stopBeats = +chart.headers.get('stop' + object.value)! / 48;
                actions.push({ type: 'stop', beat: beat, stopBeats: stopBeats });
            }
        });
        return new Timing(+chart.headers.get('bpm')! || 60, actions);
    }
}

export type TimingAction = BPMTimingAction | StopTimingAction;
export interface BaseTimingAction {
    /** 이 작업이 발생하는 위치 */
    beat: number;
}
export interface BPMTimingAction extends BaseTimingAction {
    type: 'bpm';
    /** 변경할 BPM 값 */
    bpm: number;
}
export interface StopTimingAction extends BaseTimingAction {
    type: 'stop';
    /** 멈출 박자 수 */
    stopBeats: number;
}

interface TimingSegment extends SpeedSegment {
    bpm: number;
}
