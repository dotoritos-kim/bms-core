// Module that takes a string representing a BMS notechart, parses it, and compiles it into a BMSChart.
/* module */
import { match } from '../../utils/match';
import { BMSChart } from '../../bms/chart';
import { BMSObject } from '../../bms/objects';
import { ControlFlowState } from './controlFlow';
import type { CompileResult } from './types';

export type { CompileResult, CompileWarning, CompileStats, WavStats, WarningCode } from './types';

// Control-flow commands (shared by BMS and DTX).
// The delimiter between a command and its value is optional (`#random5`), and the
// typo forms `#RONDAM n`, `#END IF` and `#IFEND` are accepted (see the command memo,
// "Examples of Mistakes").
const controlFlowMatchers = {
    // #RANDOM control flow
    random: /^#R(?:ANDOM|ONDAM)\s*(\d+)$/i,
    setrandom: /^#SETRANDOM\s*(\d+)$/i,
    endrandom: /^#ENDRANDOM$/i,
    if: /^#IF\s*(\d+)$/i,
    elseif: /^#ELSEIF\s*(\d+)$/i,
    else: /^#ELSE$/i,
    endif: /^#(?:END\s*IF|IFEND)$/i,
    // #SWITCH control flow
    switch: /^#SWITCH\s*(\d+)$/i,
    setswitch: /^#SETSWITCH\s*(\d+)$/i,
    case: /^#CASE\s*(\d+)$/i,
    skip: /^#SKIP$/i,
    def: /^#DEF$/i,
    endsw: /^#ENDSW$/i,
};

const matchers = {
    bms: {
        ...controlFlowMatchers,
        // Channels and headers
        timeSignature: /^#(\d\d\d)02:(\S*)$/,
        channel: /^#(?:EXT\s+#)?(\d\d\d)(\S\S):(\S*)$/,
        // Header: supports both whitespace- and colon-separated forms
        // #WAV01 sound.wav or #WAV01:sound.wav
        header: /^#(\w+)(?:[:\s]\s*(\S.*))?$/,
    },
    dtx: {
        ...controlFlowMatchers,
        // Channels and headers
        timeSignature: /^#(\d\d\d)02:\s*(\S*)$/,
        channel: /^#(?:EXT\s+#)?(\d\d\d)(\S\S):\s*(\S*)$/,
        header: /^#(\w+):(?:\s+(\S.*))?$/,
    },
};

/**
 * Reads a string representing a BMS notechart, parses it, and compiles it into a {BMSChart}.
 * @param text BMS notechart
 * @param options additional parser options
 */
export function compile(text: string, options?: Partial<BMSCompileOptions>): CompileResult {
    options = options || {};

    const chart = new BMSChart();

    const rng =
        options.rng ||
        function (max) {
            return 1 + Math.floor(Math.random() * max);
        };

    const matcher = (options.format && matchers[options.format]) || matchers.bms;

    // Control-flow state machine (P4: single frame stack for #RANDOM/#IF/#SWITCH)
    const cf = new ControlFlowState();
    // Fixed value for every #RANDOM (test hook; an in-file #SETRANDOM n uses its own n)
    const setRandomValue = options.setrandom;
    // Fixed value for every #SWITCH (test hook; an in-file #SETSWITCH n uses its own n)
    const setSwitchValue = options.setswitch;

    // WAV/BMP collection stats (for debugging)
    let wavHeadersCollected = 0;
    let wavHeadersInSkippedBlocks = 0;
    const sampleWavHeaders: string[] = [];

    const result: CompileResult = {
        headerSentences: 0,
        channelSentences: 0,
        controlSentences: 0,
        skippedSentences: 0,
        malformedSentences: 0,

        /**
         * The generated chart
         */
        chart: chart,

        /**
         * Warnings found during compilation
         */
        warnings: [],

        /**
         * WAV header collection stats (debug)
         */
        wavStats: {
            total: 0,
            inSkippedBlocks: 0,
        },
    };

    // Debug: log the BMS file size
    const lines = splitLines(text);
    const lineCount = lines.length;
    // #CASE labels of each #SWITCH, keyed by the #SWITCH line number
    const switchLabels = collectSwitchLabels(lines, matcher);

    lines.forEach(function (text, index) {
        const lineNumber = index + 1;
        let flow = true;
        if (text.charAt(0) !== '#') return;
        match(text)
            .when(matcher.random, function (m) {
                result.controlSentences += 1;
                // Inside a skipped region the value is irrelevant — don't consume randomness
                const value = cf.isSkipped() ? 0 : setRandomValue !== undefined ? setRandomValue : rng(+m[1]);
                cf.beginRandom(value);
            })
            .when(matcher.setrandom, function (m) {
                // #SETRANDOM n is a #RANDOM that always generates n
                result.controlSentences += 1;
                cf.beginRandom(+m[1]);
            })
            .when(matcher.endrandom, function () {
                result.controlSentences += 1;
                cf.endRandom();
            })
            .when(matcher.if, function (m) {
                result.controlSentences += 1;
                cf.beginIf(+m[1]);
            })
            .when(matcher.elseif, function (m) {
                result.controlSentences += 1;
                cf.beginElseIf(+m[1]);
            })
            .when(matcher.else, function () {
                result.controlSentences += 1;
                cf.beginElse();
            })
            .when(matcher.endif, function () {
                result.controlSentences += 1;
                cf.endIf();
            })
            // #SWITCH control flow
            .when(matcher.switch, function (m) {
                result.controlSentences += 1;
                const value = cf.isSkipped() ? 0 : setSwitchValue !== undefined ? setSwitchValue : rng(+m[1]);
                cf.beginSwitch(value, switchLabels.get(lineNumber));
            })
            .when(matcher.setswitch, function (m) {
                // #SETSWITCH n is a #SWITCH that always generates n
                result.controlSentences += 1;
                cf.beginSwitch(+m[1], switchLabels.get(lineNumber));
            })
            .when(matcher.case, function (m) {
                result.controlSentences += 1;
                cf.beginCase(+m[1]);
            })
            .when(matcher.skip, function () {
                result.controlSentences += 1;
                cf.beginSkip();
            })
            .when(matcher.def, function () {
                result.controlSentences += 1;
                cf.beginDef();
            })
            .when(matcher.endsw, function () {
                result.controlSentences += 1;
                cf.endSwitch();
            })
            .else(function () {
                flow = false;
            });
        if (flow) return;
        const skipped = cf.isSkipped();
        if (skipped) result.skippedSentences += 1;
        match(text)
            .when(matcher.timeSignature, function (m) {
                result.channelSentences += 1;
                if (!skipped) chart.timeSignatures.set(+m[1], +m[2]);
            })
            .when(matcher.channel, function (m) {
                result.channelSentences += 1;
                if (!skipped) handleChannelSentence(+m[1], m[2], m[3], lineNumber);
            })
            .when(matcher.header, function (m) {
                result.headerSentences += 1;
                // Headers in unselected #RANDOM/#SWITCH branches are ignored like any other
                // line — WAV/BMP included. Otherwise `#IF 1 / #WAV01 a.wav` + `#IF 2 /
                // #WAV01 b.wav` would always resolve to the last (possibly unselected) file.
                const headerName = m[1].toLowerCase();
                if (headerName.startsWith('wav') || headerName.startsWith('bmp')) {
                    wavHeadersCollected++;
                    if (skipped) {
                        wavHeadersInSkippedBlocks++;
                    }
                    // Collect samples (first 20 only)
                    if (sampleWavHeaders.length < 20) {
                        sampleWavHeaders.push(m[1]);
                    }
                }
                if (!skipped) chart.headers.set(m[1], m[2]);
            })
            .else(function () {
                warn(lineNumber, '잘못된 명령', 'INVALID_DIRECTIVE');
            });
    });

    // Update debug stats
    result.wavStats.total = wavHeadersCollected;
    result.wavStats.inSkippedBlocks = wavHeadersInSkippedBlocks;

    // Emit debug logs (only when the logger option is explicitly provided)
    if (options.logger) {
        const log = options.logger.info ?? (() => undefined);
        log(`[BMS Compiler] Parsed ${lineCount} lines: ${result.headerSentences} headers, ${result.channelSentences} channels, ${result.controlSentences} control`);
        log(`[BMS Compiler] WAV/BMP headers: ${wavHeadersCollected} total (${wavHeadersInSkippedBlocks} ignored in skipped #RANDOM/#SWITCH blocks)`);
        if (sampleWavHeaders.length > 0) {
            log(`[BMS Compiler] Sample WAV headers: [${sampleWavHeaders.join(', ')}]`);
        }
    }

    return result;

    function handleChannelSentence(measure: number, channel: string, string: string, lineNumber: number) {
        const items = Math.floor(string.length / 2);
        if (items === 0) return;
        for (let i = 0; i < items; i++) {
            const value = string.substr(i * 2, 2);
            const fraction = i / items;
            if (value === '00') continue;
            chart.objects.add({
                measure: measure,
                fraction: fraction,
                value: value,
                channel: channel,
                lineNumber: lineNumber,
            } as BMSObject);
        }
    }

    function warn(lineNumber: number, message: string, code: 'INVALID_DIRECTIVE') {
        result.warnings.push({
            lineNumber: lineNumber,
            message: message,
            code: code,
        });
    }
}

function splitLines(text: string): string[] {
    return text.split(/\r\n|\r|\n/).map(function (line) {
        return line.trim();
    });
}

/**
 * Pre-scans the #CASE labels of every #SWITCH/#SETSWITCH block (keyed by the
 * 1-based line number of the #SWITCH line), so that a #DEF written before the
 * matching #CASE can be skipped. Labels of nested switches belong to the
 * innermost open switch.
 */
function collectSwitchLabels(lines: string[], matcher: typeof controlFlowMatchers): Map<number, Set<number>> {
    const labels = new Map<number, Set<number>>();
    const open: Set<number>[] = [];
    lines.forEach(function (line, index) {
        if (line.charAt(0) !== '#') return;
        if (matcher.switch.test(line) || matcher.setswitch.test(line)) {
            const set = new Set<number>();
            labels.set(index + 1, set);
            open.push(set);
            return;
        }
        const m = matcher.case.exec(line);
        if (m) {
            if (open.length > 0) open[open.length - 1].add(+m[1]);
        } else if (matcher.endsw.test(line)) {
            open.pop();
        }
    });
    return labels;
}

export interface BMSCompileOptions {
    /** File format */
    format: 'bms' | 'dtx';

    /** Random number generator function.
     *  Used when processing the `#RANDOM n` command.
     *  This function must return an integer between 1 and `n`.
     */
    rng: (max: number) => number;

    /** Fixed #SETRANDOM value (for tests).
     *  When set, every #RANDOM block uses this value.
     */
    setrandom?: number;

    /** Fixed #SETSWITCH value (for tests).
     *  When set, every #SWITCH block uses this value.
     */
    setswitch?: number;

    /** Debug logger (optional).
     *  When provided, compile stats are emitted via `logger.info`.
     *  When omitted, the library produces no console output at all.
     */
    logger?: {
        info?: (message: string) => void;
        warn?: (message: string) => void;
    };
}
