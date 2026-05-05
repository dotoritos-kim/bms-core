// 컴파일러 결과 타입 정의 (REFACTOR-PLAN §5 P3)
//
// 외부 호환성을 위해 기존 `compile()` 리턴 필드는 모두 그대로 유지하면서,
// 다음을 추가합니다:
//   - `CompileWarning.code`: 경고 분류 코드 (외부에서 분류·필터링 가능)
//   - `CompileStats`: 통계 필드 그룹화 (alias)
//
// 타입 자체는 외부 export 대상이 아니지만, `BMSCompileOptions`와 동일한 모듈에서
// 노출되어 컴파일러 결과를 정확하게 받을 수 있도록 합니다.

import type { BMSChart } from '../../bms/chart';

/**
 * 컴파일 중 발견된 경고의 분류 코드.
 *
 * - `INVALID_DIRECTIVE`: 알 수 없는 헤더/명령 라인
 *
 * 신규 코드는 추가만 가능하며 기존 값은 유지됩니다 (semver patch 호환).
 */
export type WarningCode = 'INVALID_DIRECTIVE';

/**
 * 컴파일 중 발견된 경고. 기존 필드(`lineNumber`, `message`)에 더해
 * 새 `code` 필드가 추가되었습니다 — 외부 코드의 호환성을 깨지 않는 추가 변경입니다.
 */
export interface CompileWarning {
    lineNumber: number;
    message: string;
    /** 경고 분류 코드. 신규 추가 필드 (non-breaking). */
    code: WarningCode;
}

/**
 * BMS 컴파일 통계.
 */
export interface CompileStats {
    headerSentences: number;
    channelSentences: number;
    controlSentences: number;
    skippedSentences: number;
    malformedSentences: number;
}

/**
 * WAV/BMP 헤더 수집 통계 (디버그용).
 */
export interface WavStats {
    total: number;
    inSkippedBlocks: number;
}

/**
 * `compile()` 함수의 리턴 타입.
 *
 * 외부 호환성을 위해 기존 평탄한 필드(`headerSentences` 등)는 모두 유지하며,
 * 새 `code` 필드는 `warnings[i]`에 추가됩니다.
 */
export interface CompileResult extends CompileStats {
    /** 생성된 차트 */
    chart: BMSChart;
    /** 컴파일 중 발견된 경고 (각 항목에 `code` 포함) */
    warnings: CompileWarning[];
    /** WAV 헤더 수집 통계 (디버그) */
    wavStats: WavStats;
}
