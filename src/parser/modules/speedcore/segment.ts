export interface SpeedSegment {
    t: number;
    x: number;
    /** t당 x의 변화량 */
    dx: number;
    /** 세그먼트가 t를 포함하는지 여부 */
    inclusive: boolean;
}

/**
 * 런타임에서 SpeedSegment의 필수 수치 필드를 검증합니다.
 *
 * 과거에는 자체 `DataStructure` Façade로 검증했으나, `Speedcore`는 라이브러리
 * 내부에서만 생성되고 필드 타입은 TypeScript로 이미 강제되므로 작은
 * 인라인 가드로 대체합니다. 외부 API에는 영향이 없습니다.
 */
export function assertSpeedSegment(value: SpeedSegment): void {
    if (typeof value.t !== 'number') {
        throw new Error('Error in property "t": Value should be of type number');
    }
    if (typeof value.x !== 'number') {
        throw new Error('Error in property "x": Value should be of type number');
    }
    if (typeof value.dx !== 'number') {
        throw new Error('Error in property "dx": Value should be of type number');
    }
}
