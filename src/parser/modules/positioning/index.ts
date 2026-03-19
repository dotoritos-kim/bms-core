import { Speedcore } from '../speedcore';
import { BMSChart } from '../../bms/chart';
import { SpeedSegment } from '../speedcore/segment';
import { Timing } from '../timing';

/**
 * Positioning은 곡의 박자와 화면상의 위치 간의 관계를 나타내며,
 * 두 값 사이를 변환하는 방법을 제공합니다.
 *
 * 일부 리듬 게임에서는 박자당 스크롤 양이 다를 수 있습니다.
 * StepMania의 `#SCROLL` 세그먼트가 그 예입니다.
 *
 * #BASEBPM이 설정된 경우, BPM 변화에 따라 스크롤 속도가 정규화됩니다.
 * normalizedSpeed = currentBPM / baseBPM
 */
export class Positioning {
    _speedcore: Speedcore;
    _normalizedSpeedcore: Speedcore | null = null;
    _baseBpm: number | null = null;
    _timing: Timing | null = null;

    /**
     * 주어진 `segments`로 Positioning을 생성합니다.
     * @param segments
     * @param baseBpm #BASEBPM 값 (설정된 경우)
     * @param timing Timing 객체 (BPM 변화 반영에 필요)
     */
    constructor(segments: PositioningSegment[], baseBpm?: number | null, timing?: Timing | null) {
        this._speedcore = new Speedcore(segments);
        this._baseBpm = baseBpm ?? null;
        this._timing = timing ?? null;

        // Timing이 있으면 BPM 변화를 반영한 정규화된 세그먼트 생성
        // BASEBPM이 없으면 초기 BPM을 기준으로 사용
        if (this._timing) {
            this._normalizedSpeedcore = this._buildNormalizedSpeedcore(segments);
        }
    }

    /**
     * BPM 변화를 반영한 Speedcore를 생성합니다.
     * SCROLL 세그먼트와 BPM 변경 지점을 병합하여 새 세그먼트를 생성합니다.
     * BASEBPM이 없으면 초기 BPM을 기준으로 사용합니다.
     */
    private _buildNormalizedSpeedcore(scrollSegments: PositioningSegment[]): Speedcore {
        if (!this._timing) {
            return new Speedcore(scrollSegments);
        }

        const bpmSegments = this._timing.getBpmSegments();
        // BASEBPM이 없으면 초기 BPM 사용
        const baseBpm = this._baseBpm ?? this._timing.getInitialBpm();

        // baseBpm이 유효하지 않으면 정규화 없이 반환
        if (!baseBpm || baseBpm <= 0) {
            return new Speedcore(scrollSegments);
        }

        // 모든 이벤트 지점을 수집 (SCROLL + BPM)
        const eventBeats = new Set<number>();
        for (const seg of scrollSegments) eventBeats.add(seg.t);
        for (const seg of bpmSegments) eventBeats.add(seg.beat);
        const sortedBeats = Array.from(eventBeats).sort((a, b) => a - b);

        // 각 지점에서의 SCROLL 속도와 BPM을 계산하여 새 세그먼트 생성
        const normalizedSegments: SpeedSegment[] = [];
        let position = 0;

        for (let i = 0; i < sortedBeats.length; i++) {
            const beat = sortedBeats[i];
            const scrollSpeed = this._speedcore.dx(beat);
            const currentBpm = this._timing.bpmAtBeat(beat);
            const bpmRatio = currentBpm / baseBpm;
            const normalizedSpeed = scrollSpeed * bpmRatio;

            // 이전 세그먼트가 있으면 위치 계산
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

        // 세그먼트가 비어있으면 기본 세그먼트 추가
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
     * 지정된 박자에서의 스크롤 속도를 반환합니다.
     * #BASEBPM이 설정된 경우 BPM 비율로 정규화됩니다.
     * @param beat 박자 번호
     */
    speed(beat: number) {
        if (this._normalizedSpeedcore) {
            return this._normalizedSpeedcore.dx(beat);
        }
        return this._speedcore.dx(beat);
    }

    /**
     * 지정된 박자에서의 원본 스크롤 속도를 반환합니다 (BPM 정규화 미적용).
     * SCROLL 명령어에 의한 속도만 반환합니다.
     * @param beat 박자 번호
     */
    rawScrollSpeed(beat: number) {
        return this._speedcore.dx(beat);
    }

    /**
     * 지정된 박자에서의 유효 스크롤 속도를 반환합니다.
     * 스크롤 속도와 BPM 비율을 모두 고려합니다.
     * 너비 스케일링 등 시각적 효과에 사용됩니다.
     * @param beat 박자 번호
     */
    effectiveSpeed(beat: number) {
        const scrollSpeed = this._speedcore.dx(beat);
        const bpmRatio = this.bpmRatioAtBeat(beat);
        return scrollSpeed * bpmRatio;
    }

    /**
     * 지정된 박자에서 총 경과된 스크롤 양을 반환합니다.
     * #BASEBPM이 설정된 경우 BPM 정규화가 적용됩니다.
     * @param beat 박자 번호
     */
    position(beat: number) {
        if (this._normalizedSpeedcore) {
            return this._normalizedSpeedcore.x(beat);
        }
        return this._speedcore.x(beat);
    }

    /**
     * #BASEBPM 값 반환
     */
    getBaseBpm(): number | null {
        return this._baseBpm;
    }

    /**
     * 지정된 박자에서의 BPM 비율을 반환합니다.
     * - BASEBPM이 설정된 경우: currentBPM / BASEBPM
     * - 그렇지 않으면: currentBPM / initialBPM
     * @param beat 박자 번호
     */
    bpmRatioAtBeat(beat: number): number {
        if (!this._timing) return 1;
        const currentBpm = this._timing.bpmAtBeat(beat);
        const baseBpm = this._baseBpm ?? this._timing.getInitialBpm();
        if (baseBpm <= 0) return 1;
        return currentBpm / baseBpm;
    }

    /**
     * BMSChart에서 Positioning 객체를 생성합니다.
     * @param {BMSChart} chart Positioning을 생성할 BMSChart
     * @param {Timing} timing Timing 객체 (#BASEBPM 정규화에 필요, 선택적)
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

        // #BASEBPM 파싱
        const baseBpmHeader = chart.headers.get('BASEBPM');
        const baseBpm = baseBpmHeader ? parseFloat(baseBpmHeader) : null;

        return new Positioning(segments, baseBpm, timing);
    }
}

export interface PositioningSegment extends SpeedSegment {
    /** 박자 번호 */
    t: number;
    /** 박자 `t`에서의 총 경과된 스크롤 양 */
    x: number;
    /** 박자당 스크롤 양 */
    dx: number;
    /** 세그먼트의 일부로 시작 박자 `t`를 포함할지 여부 */
    inclusive: boolean;
}
