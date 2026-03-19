/**
 * BGA (Background Animation) 모듈
 *
 * #BGAxx 명령어를 파싱하여 BMP 참조, 크롭 좌표, 오프셋 정보를 관리합니다.
 *
 * 형식: #BGAxx yy x1 y1 x2 y2 [dx dy]
 * - xx: BGA 인덱스 (Base36)
 * - yy: BMP 인덱스 (참조할 이미지)
 * - x1, y1, x2, y2: 크롭 영역 (픽셀 좌표)
 * - dx, dy: 표시 오프셋 (선택적)
 */

import type { BMSChart } from '../../bms/chart';

export interface BGADefinition {
    /** BGA 인덱스 (Base36) */
    id: string;
    /** 참조하는 BMP 인덱스 */
    bmpId: string;
    /** 크롭 영역 */
    crop: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    };
    /** 표시 오프셋 (선택적) */
    offset?: {
        dx: number;
        dy: number;
    };
}

export class BGA {
    private _map: Map<string, BGADefinition> = new Map();

    /**
     * BMSChart에서 BGA 정의 추출
     */
    static fromBMSChart(chart: BMSChart): BGA {
        const bga = new BGA();

        // 모든 헤더를 순회하며 #BGAxx 찾기
        chart.headers.each((name: string, value: string) => {
            const bgaMatch = name.match(/^BGA([0-9A-Z]{2})$/i);
            if (bgaMatch && value) {
                const bgaId = bgaMatch[1].toUpperCase();
                const parsed = bga.parseBGAValue(value);
                if (parsed) {
                    bga._map.set(bgaId, {
                        id: bgaId,
                        ...parsed,
                    });
                }
            }
        });

        return bga;
    }

    /**
     * #BGAxx 값 파싱
     * 형식: yy x1 y1 x2 y2 [dx dy]
     */
    private parseBGAValue(value: string): Omit<BGADefinition, 'id'> | null {
        // 공백으로 분리
        const parts = value.trim().split(/\s+/);

        if (parts.length < 5) {
            return null;
        }

        const bmpId = parts[0].toUpperCase();
        const x1 = parseInt(parts[1], 10);
        const y1 = parseInt(parts[2], 10);
        const x2 = parseInt(parts[3], 10);
        const y2 = parseInt(parts[4], 10);

        // 크롭 좌표 유효성 검사
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
            return null;
        }

        const result: Omit<BGADefinition, 'id'> = {
            bmpId,
            crop: { x1, y1, x2, y2 },
        };

        // 오프셋이 있는 경우 (7개 파라미터)
        if (parts.length >= 7) {
            const dx = parseInt(parts[5], 10);
            const dy = parseInt(parts[6], 10);
            if (!isNaN(dx) && !isNaN(dy)) {
                result.offset = { dx, dy };
            }
        }

        return result;
    }

    /**
     * BGA 정의 조회
     */
    get(id: string): BGADefinition | undefined {
        return this._map.get(id.toUpperCase());
    }

    /**
     * 모든 BGA 정의 반환
     */
    all(): Record<string, BGADefinition> {
        const result: Record<string, BGADefinition> = {};
        this._map.forEach((def, id) => {
            result[id] = def;
        });
        return result;
    }

    /**
     * BGA 정의 개수
     */
    count(): number {
        return this._map.size;
    }

    /**
     * BGA 정의가 있는지 확인
     */
    has(id: string): boolean {
        return this._map.has(id.toUpperCase());
    }
}
