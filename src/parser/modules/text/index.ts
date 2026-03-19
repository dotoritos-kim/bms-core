/**
 * Text 모듈
 *
 * #TEXTxx 명령어와 채널 99를 파싱하여
 * 인게임 텍스트 표시를 관리합니다.
 *
 * - #TEXTxx "string": 인덱스별 텍스트 정의
 * - 채널 99: 특정 비트에서 텍스트 표시
 *
 * 사용 예:
 * #TEXT01 "Ready?"
 * #TEXT02 "GO!"
 * #00099:0102
 */

import type { BMSChart } from '../../bms/chart';

export interface TextEvent {
    /** 비트 위치 */
    beat: number;
    /** 표시할 텍스트 */
    text: string;
    /** 텍스트 인덱스 (참조용) */
    textId: string;
}

export class Text {
    /** 인덱스별 텍스트 정의 (#TEXTxx) */
    private _definitions: Map<string, string> = new Map();
    /** 비트별 텍스트 이벤트 (채널 99) */
    private _events: TextEvent[] = [];

    /**
     * BMSChart에서 Text 정보 추출
     */
    static fromBMSChart(chart: BMSChart): Text {
        const text = new Text();

        // #TEXTxx 파싱
        chart.headers.each((name: string, value: string) => {
            const textMatch = name.match(/^TEXT([0-9A-Z]{2})$/i);
            if (textMatch && value) {
                const index = textMatch[1].toUpperCase();
                // 따옴표 제거
                let textValue = value.trim();
                if ((textValue.startsWith('"') && textValue.endsWith('"')) ||
                    (textValue.startsWith("'") && textValue.endsWith("'"))) {
                    textValue = textValue.slice(1, -1);
                }
                text._definitions.set(index, textValue);
            }
        });

        // 채널 99 이벤트 추출
        const objects = chart.objects.all();
        for (const obj of objects) {
            if (obj.channel === '99') {
                const beat = chart.measureToBeat(obj.measure, obj.fraction);
                const textId = obj.value.toUpperCase();

                // 텍스트 정의에서 값 조회
                const textValue = text._definitions.get(textId);
                if (textValue !== undefined) {
                    text._events.push({
                        beat,
                        text: textValue,
                        textId,
                    });
                }
            }
        }

        // 이벤트 정렬
        text._events.sort((a, b) => a.beat - b.beat);

        return text;
    }

    /**
     * 특정 비트에서 활성화된 텍스트 반환
     * (가장 최근에 표시된 텍스트)
     */
    atBeat(beat: number): string | null {
        if (this._events.length === 0) {
            return null;
        }

        let lastText: string | null = null;
        for (const event of this._events) {
            if (event.beat > beat) break;
            lastText = event.text;
        }

        return lastText;
    }

    /**
     * 특정 비트 범위 내의 텍스트 이벤트 반환
     */
    getEventsInRange(startBeat: number, endBeat: number): TextEvent[] {
        return this._events.filter(
            event => event.beat >= startBeat && event.beat <= endBeat
        );
    }

    /**
     * 모든 텍스트 이벤트 반환
     */
    allEvents(): TextEvent[] {
        return [...this._events];
    }

    /**
     * 텍스트 정의 조회
     */
    getDefinition(index: string): string | undefined {
        return this._definitions.get(index.toUpperCase());
    }

    /**
     * 모든 텍스트 정의 반환
     */
    allDefinitions(): Record<string, string> {
        const result: Record<string, string> = {};
        this._definitions.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * 텍스트 이벤트가 있는지 여부
     */
    hasTextEvents(): boolean {
        return this._events.length > 0;
    }
}
