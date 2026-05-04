/**
 * 노트 타입 정의
 * - playable: 플레이어가 쳐야 하는 노트 (채널 11-19, 21-29)
 * - invisible: 보이지 않는 고스트 노트 (채널 31-39, 41-49)
 * - landmine: 지뢰 노트 (채널 D1-D9, E1-E9)
 * - bgm: 자동 재생 BGM 노트 (채널 01)
 */
export type NoteType = 'playable' | 'invisible' | 'landmine' | 'bgm';

/** 노트차트의 개별 노트 */
export interface BMSNote {
    beat: number;
    endBeat?: number;
    /** Tick position (960 ticks/beat). Primary for editor precision, derived from beat in parser. */
    tick?: number;
    /** End tick for long notes (960 ticks/beat). */
    endTick?: number;
    column?: string;
    keysound: string;

    /**
     * 노트 타입
     */
    noteType?: NoteType;

    /**
     * 원본 BMS 채널 (디버깅/분석용)
     */
    channel?: string;

    /**
     * 지뢰 노트 데미지 (0-100%)
     * landmine 타입 노트에서만 유효
     */
    damage?: number;

    /**
     * [bmson] 사운드 파일에서 재생을 시작할 시간(초).
     */
    keysoundStart?: number;

    /**
     * [bmson] 사운드 파일에서 재생을 중지할 시간(초).
     * `undefined`일 경우, 사운드 파일이 끝까지 재생됨을 의미합니다.
     */
    keysoundEnd?: number;
}

/**
 * 런타임에서 BMSNote 객체의 필수 필드를 검증합니다.
 *
 * 과거에는 자체 `DataStructure` Façade로 검증했으나, 사용처가 내부
 * `Notes` 컬렉션 한 곳뿐이고 필드 타입은 TypeScript로 이미 강제되므로
 * 작은 인라인 가드로 대체합니다. 외부 API에는 영향이 없습니다.
 */
export function assertBMSNote(value: BMSNote): void {
    if (typeof value.beat !== 'number') {
        throw new Error('Error in property "beat": Value should be of type number');
    }
    if (value.endBeat !== undefined && value.endBeat !== null && typeof value.endBeat !== 'number') {
        throw new Error('Error in property "endBeat": Value should be of type number');
    }
    if (value.column !== undefined && value.column !== null && typeof value.column !== 'string') {
        throw new Error('Error in property "column": Value should be of type string');
    }
    if (typeof value.keysound !== 'string') {
        throw new Error('Error in property "keysound": Value should be of type string');
    }
}
