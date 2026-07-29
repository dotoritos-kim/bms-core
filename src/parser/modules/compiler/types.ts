// Compiler result type definitions (REFACTOR-PLAN §5 P3)
//
// For external compatibility every existing `compile()` return field is kept
// as-is, while adding:
//   - `CompileWarning.code`: warning classification code (allows external classification/filtering)
//   - `CompileStats`: grouped statistics fields (alias)
//
// The types themselves are not external export targets, but they are exposed
// from the same module as `BMSCompileOptions` so compiler results can be received with precise types.

import type { BMSChart } from '../../bms/chart';

/**
 * Classification code for warnings found during compilation.
 *
 * - `INVALID_DIRECTIVE`: unknown header/directive line
 *
 * New codes may only be added; existing values are kept (semver patch compatible).
 */
export type WarningCode = 'INVALID_DIRECTIVE';

/**
 * A warning found during compilation. In addition to the existing fields
 * (`lineNumber`, `message`), a new `code` field was added — an additive change
 * that does not break compatibility for external code.
 */
export interface CompileWarning {
    lineNumber: number;
    message: string;
    /** Warning classification code. Newly added field (non-breaking). */
    code: WarningCode;
}

/**
 * BMS compile statistics.
 */
export interface CompileStats {
    headerSentences: number;
    channelSentences: number;
    controlSentences: number;
    skippedSentences: number;
    malformedSentences: number;
}

/**
 * WAV/BMP header collection stats (for debugging).
 */
export interface WavStats {
    total: number;
    inSkippedBlocks: number;
}

/**
 * Return type of the `compile()` function.
 *
 * For external compatibility every existing flat field (`headerSentences`, etc.)
 * is kept, and the new `code` field is added to `warnings[i]`.
 */
export interface CompileResult extends CompileStats {
    /** The generated chart */
    chart: BMSChart;
    /** Warnings found during compilation (each item includes `code`) */
    warnings: CompileWarning[];
    /** WAV header collection stats (debug) */
    wavStats: WavStats;
}
