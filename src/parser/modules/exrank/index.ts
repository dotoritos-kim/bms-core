/**
 * ExRank (Extended Rank/Judgment) 모듈
 *
 * #DEFEXRANK, #EXRANKxx 명령어와 채널 A0을 파싱하여
 * 비트별 판정 배율을 관리합니다.
 *
 * - #DEFEXRANK n: 기본 판정 배율 (100 = Normal)
 * - #EXRANKxx n: 인덱스별 판정 배율 정의
 * - 채널 A0: 특정 비트에서 판정 배율 변경
 *
 * 판정 배율 계산:
 * - 100 = 기본 판정 (Normal)
 * - 200 = 판정 2배 더 관대
 * - 50 = 판정 절반으로 엄격
 */

import type { BMSChart } from '../../bms/chart';

export interface ExRankEvent {
    /** 비트 위치 */
    beat: number;
    /** 판정 배율 (100 = Normal) */
    value: number;
}

export class ExRank {
    /** 기본 판정 배율 (#DEFEXRANK) */
    private _defaultValue: number = 100;
    /** 인덱스별 판정 배율 (#EXRANKxx) */
    private _definitions: Map<string, number> = new Map();
    /** 비트별 판정 변경 이벤트 (채널 A0) */
    private _events: ExRankEvent[] = [];

    /**
     * BMSChart에서 ExRank 정보 추출
     */
    static fromBMSChart(chart: BMSChart): ExRank {
        const exrank = new ExRank();

        // #DEFEXRANK 파싱
        const defExRank = chart.headers.get('DEFEXRANK');
        if (defExRank) {
            const value = parseInt(defExRank, 10);
            if (!isNaN(value) && value > 0) {
                exrank._defaultValue = value;
            }
        }

        // #EXRANKxx 파싱
        chart.headers.each((name: string, value: string) => {
            const exrankMatch = name.match(/^EXRANK([0-9A-Z]{2})$/i);
            if (exrankMatch && value) {
                const index = exrankMatch[1].toUpperCase();
                const rankValue = parseInt(value, 10);
                if (!isNaN(rankValue)) {
                    exrank._definitions.set(index, rankValue);
                }
            }
        });

        // 채널 A0 이벤트 추출
        const objects = chart.objects.all();
        for (const obj of objects) {
            if (obj.channel.toUpperCase() === 'A0') {
                const beat = chart.measureToBeat(obj.measure, obj.fraction);
                const valueIndex = obj.value.toUpperCase();

                // #EXRANKxx에서 값 조회
                let rankValue = exrank._definitions.get(valueIndex);
                if (rankValue === undefined) {
                    // Base36 값을 직접 사용 (00-ZZ → 0-1295)
                    rankValue = parseInt(valueIndex, 36);
                }

                if (!isNaN(rankValue)) {
                    exrank._events.push({ beat, value: rankValue });
                }
            }
        }

        // 이벤트 정렬
        exrank._events.sort((a, b) => a.beat - b.beat);

        return exrank;
    }

    /**
     * 기본 판정 배율 반환
     */
    getDefault(): number {
        return this._defaultValue;
    }

    /**
     * 특정 비트의 판정 배율 반환
     */
    atBeat(beat: number): number {
        // 이벤트가 없으면 기본값 반환
        if (this._events.length === 0) {
            return this._defaultValue;
        }

        // 현재 비트보다 이전의 마지막 이벤트 찾기
        let result = this._defaultValue;
        for (const event of this._events) {
            if (event.beat > beat) break;
            result = event.value;
        }

        return result;
    }

    /**
     * 모든 판정 변경 이벤트 반환
     */
    allEvents(): ExRankEvent[] {
        return [...this._events];
    }

    /**
     * 인덱스별 판정 정의 반환
     */
    getDefinition(index: string): number | undefined {
        return this._definitions.get(index.toUpperCase());
    }

    /**
     * 모든 정의 반환
     */
    allDefinitions(): Record<string, number> {
        const result: Record<string, number> = {};
        this._definitions.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * 판정 배율이 변경되는지 여부
     */
    hasDynamicRank(): boolean {
        return this._events.length > 0;
    }
}
