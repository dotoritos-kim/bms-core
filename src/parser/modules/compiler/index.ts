// BMS 노트차트를 나타내는 문자열을 받아 파싱하고 BMSChart로 컴파일하는 모듈입니다.
/* module */
import { match } from '../../utils/match';
import { BMSChart } from '../../bms/chart';
import { BMSObject } from '../../bms/objects';

const matchers = {
    bms: {
        // #RANDOM 제어 흐름
        random: /^#RANDOM\s+(\d+)$/i,
        setrandom: /^#SETRANDOM\s+(\d+)$/i,
        endrandom: /^#ENDRANDOM$/i,
        if: /^#IF\s+(\d+)$/i,
        elseif: /^#ELSEIF\s+(\d+)$/i,
        else: /^#ELSE$/i,
        endif: /^#ENDIF$/i,
        // #SWITCH 제어 흐름
        switch: /^#SWITCH\s+(\d+)$/i,
        setswitch: /^#SETSWITCH\s+(\d+)$/i,
        case: /^#CASE\s+(\d+)$/i,
        skip: /^#SKIP$/i,
        def: /^#DEF$/i,
        endsw: /^#ENDSW$/i,
        // 채널 및 헤더
        timeSignature: /^#(\d\d\d)02:(\S*)$/,
        channel: /^#(?:EXT\s+#)?(\d\d\d)(\S\S):(\S*)$/,
        // 헤더: 공백 또는 콜론으로 구분되는 두 가지 형식 모두 지원
        // #WAV01 sound.wav 또는 #WAV01:sound.wav
        header: /^#(\w+)(?:[:\s]\s*(\S.*))?$/,
    },
    dtx: {
        // #RANDOM 제어 흐름
        random: /^#RANDOM\s+(\d+)$/i,
        setrandom: /^#SETRANDOM\s+(\d+)$/i,
        endrandom: /^#ENDRANDOM$/i,
        if: /^#IF\s+(\d+)$/i,
        elseif: /^#ELSEIF\s+(\d+)$/i,
        else: /^#ELSE$/i,
        endif: /^#ENDIF$/i,
        // #SWITCH 제어 흐름
        switch: /^#SWITCH\s+(\d+)$/i,
        setswitch: /^#SETSWITCH\s+(\d+)$/i,
        case: /^#CASE\s+(\d+)$/i,
        skip: /^#SKIP$/i,
        def: /^#DEF$/i,
        endsw: /^#ENDSW$/i,
        // 채널 및 헤더
        timeSignature: /^#(\d\d\d)02:\s*(\S*)$/,
        channel: /^#(?:EXT\s+#)?(\d\d\d)(\S\S):\s*(\S*)$/,
        header: /^#(\w+):(?:\s+(\S.*))?$/,
    },
};

/**
 * BMS 노트차트를 나타내는 문자열을 읽고, 파싱하여 {BMSChart}로 컴파일합니다.
 * @param text BMS 노트차트
 * @param options 추가 파서 옵션
 */
export function compile(text: string, options?: Partial<BMSCompileOptions>) {
    options = options || {};

    const chart = new BMSChart();

    const rng =
        options.rng ||
        function (max) {
            return 1 + Math.floor(Math.random() * max);
        };

    const matcher = (options.format && matchers[options.format]) || matchers.bms;

    // 랜덤 값 스택 (각 #RANDOM 블록의 현재 랜덤 값)
    const randomStack: number[] = [];
    // 스킵 상태 스택 (현재 블록을 스킵할지 여부)
    const skipStack = [false];
    // 매칭 여부 스택 (#IF/#ELSEIF 중 하나라도 매칭되었는지 추적)
    const matchedStack = [false];
    // #SETRANDOM 고정값 (테스트용)
    const setRandomValue = options.setrandom;

    // #SWITCH 제어 흐름용 스택
    interface SwitchState {
        value: number;      // 스위치 값
        matched: boolean;   // CASE가 매칭되었는지
        skipping: boolean;  // SKIP 이후 ENDSW까지 스킵
    }
    const switchStack: SwitchState[] = [];
    // #SETSWITCH 고정값 (테스트용)
    const setSwitchValue = options.setswitch;

    // WAV/BMP 수집 통계 (디버그용)
    let wavHeadersCollected = 0;
    let wavHeadersInSkippedBlocks = 0;
    const sampleWavHeaders: string[] = [];

    const result = {
        headerSentences: 0,
        channelSentences: 0,
        controlSentences: 0,
        skippedSentences: 0,
        malformedSentences: 0,

        /**
         * 생성된 차트
         */
        chart: chart,

        /**
         * 컴파일 중 발견된 경고
         */
        warnings: [] as { lineNumber: number; message: string }[],

        /**
         * WAV 헤더 수집 통계 (디버그)
         */
        wavStats: {
            total: 0,
            inSkippedBlocks: 0,
        },
    };

    // 디버그: BMS 파일 크기 로깅
    const lineCount = text.split(/\r\n|\r|\n/).length;

    eachLine(text, function (text, lineNumber) {
        let flow = true;
        if (text.charAt(0) !== '#') return;
        match(text)
            .when(matcher.random, function (m) {
                result.controlSentences += 1;
                // #SETRANDOM이 설정되어 있으면 고정값 사용
                const value = setRandomValue !== undefined ? setRandomValue : rng(+m[1]);
                randomStack.push(value);
            })
            .when(matcher.setrandom, function () {
                // #SETRANDOM은 다음 #RANDOM의 값을 고정 (이미 options에서 처리)
                result.controlSentences += 1;
            })
            .when(matcher.endrandom, function () {
                result.controlSentences += 1;
                randomStack.pop();
            })
            .when(matcher.if, function (m) {
                result.controlSentences += 1;
                const randomValue = randomStack[randomStack.length - 1];
                const matches = randomValue === +m[1];
                skipStack.push(!matches);
                matchedStack.push(matches);
            })
            .when(matcher.elseif, function (m) {
                result.controlSentences += 1;
                const alreadyMatched = matchedStack[matchedStack.length - 1];
                if (alreadyMatched) {
                    // 이미 매칭된 분기가 있으면 스킵
                    skipStack[skipStack.length - 1] = true;
                } else {
                    // 아직 매칭된 분기가 없으면 새로운 조건 평가
                    const randomValue = randomStack[randomStack.length - 1];
                    const matches = randomValue === +m[1];
                    skipStack[skipStack.length - 1] = !matches;
                    if (matches) {
                        matchedStack[matchedStack.length - 1] = true;
                    }
                }
            })
            .when(matcher.else, function () {
                result.controlSentences += 1;
                const alreadyMatched = matchedStack[matchedStack.length - 1];
                // 이미 매칭된 분기가 있으면 스킵, 없으면 실행
                skipStack[skipStack.length - 1] = alreadyMatched;
            })
            .when(matcher.endif, function () {
                result.controlSentences += 1;
                skipStack.pop();
                matchedStack.pop();
            })
            // #SWITCH 제어 흐름
            .when(matcher.switch, function (m) {
                result.controlSentences += 1;
                const value = setSwitchValue !== undefined ? setSwitchValue : rng(+m[1]);
                switchStack.push({ value, matched: false, skipping: false });
            })
            .when(matcher.setswitch, function () {
                // #SETSWITCH는 options에서 처리됨
                result.controlSentences += 1;
            })
            .when(matcher.case, function (m) {
                result.controlSentences += 1;
                const current = switchStack[switchStack.length - 1];
                if (current) {
                    if (current.skipping || current.matched) {
                        // SKIP 이후거나 이미 매칭된 경우 스킵
                        skipStack[skipStack.length - 1] = true;
                    } else if (current.value === +m[1]) {
                        // 매칭됨 - 실행
                        current.matched = true;
                        skipStack[skipStack.length - 1] = false;
                    } else {
                        // 매칭 안됨 - 스킵
                        skipStack[skipStack.length - 1] = true;
                    }
                }
            })
            .when(matcher.skip, function () {
                result.controlSentences += 1;
                const current = switchStack[switchStack.length - 1];
                if (current) {
                    // SKIP 이후 ENDSW까지 모든 코드 스킵
                    current.skipping = true;
                    skipStack[skipStack.length - 1] = true;
                }
            })
            .when(matcher.def, function () {
                result.controlSentences += 1;
                const current = switchStack[switchStack.length - 1];
                if (current) {
                    if (current.skipping || current.matched) {
                        // SKIP 이후거나 이미 매칭된 경우 스킵
                        skipStack[skipStack.length - 1] = true;
                    } else {
                        // 아무 CASE도 매칭 안된 경우 실행
                        skipStack[skipStack.length - 1] = false;
                    }
                }
            })
            .when(matcher.endsw, function () {
                result.controlSentences += 1;
                switchStack.pop();
                // 스위치 종료 후 정상 실행 재개
                if (skipStack.length > 1 && switchStack.length === 0) {
                    // 최상위 스킵 상태로 복원
                    skipStack[skipStack.length - 1] = false;
                }
            })
            .else(function () {
                flow = false;
            });
        if (flow) return;
        const skipped = skipStack[skipStack.length - 1];
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
                // WAV/BMP 정의는 #RANDOM 분기에 관계없이 항상 수집
                // WAV/BMP는 파일 매핑일 뿐이고, 사용 여부는 채널 데이터에서 결정됨
                // 이렇게 하면 #RANDOM으로 선택되지 않은 분기의 WAV도 로드 가능
                const headerName = m[1].toLowerCase();
                if (headerName.startsWith('wav') || headerName.startsWith('bmp')) {
                    chart.headers.set(m[1], m[2]);
                    wavHeadersCollected++;
                    if (skipped) {
                        wavHeadersInSkippedBlocks++;
                    }
                    // 샘플 수집 (처음 20개만)
                    if (sampleWavHeaders.length < 20) {
                        sampleWavHeaders.push(m[1]);
                    }
                } else if (!skipped) {
                    chart.headers.set(m[1], m[2]);
                }
            })
            .else(function () {
                warn(lineNumber, '잘못된 명령');
            });
    });

    // 디버그 통계 업데이트
    result.wavStats.total = wavHeadersCollected;
    result.wavStats.inSkippedBlocks = wavHeadersInSkippedBlocks;

    // 디버그 로그 출력 (logger 옵션이 명시적으로 주어진 경우에만 출력)
    if (options.logger) {
        const log = options.logger.info ?? (() => undefined);
        log(`[BMS Compiler] Parsed ${lineCount} lines: ${result.headerSentences} headers, ${result.channelSentences} channels, ${result.controlSentences} control`);
        log(`[BMS Compiler] WAV/BMP headers: ${wavHeadersCollected} total (${wavHeadersInSkippedBlocks} from skipped #RANDOM/#SWITCH blocks)`);
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

    function warn(lineNumber: number, message: string) {
        result.warnings.push({
            lineNumber: lineNumber,
            message: message,
        });
    }
}

function eachLine(text: string, callback: (line: string, index: number) => void) {
    text.split(/\r\n|\r|\n/)
        .map(function (line) {
            return line.trim();
        })
        .forEach(function (line, index) {
            callback(line, index + 1);
        });
}

export interface BMSCompileOptions {
    /** 파일 형식 */
    format: 'bms' | 'dtx';

    /** 난수 생성 함수.
     *  `#RANDOM n` 명령을 처리할 때 사용됩니다.
     *  이 함수는 1에서 `n` 사이의 정수를 반환해야 합니다.
     */
    rng: (max: number) => number;

    /** #SETRANDOM 고정값 (테스트용).
     *  설정하면 모든 #RANDOM 블록이 이 값을 사용합니다.
     */
    setrandom?: number;

    /** #SETSWITCH 고정값 (테스트용).
     *  설정하면 모든 #SWITCH 블록이 이 값을 사용합니다.
     */
    setswitch?: number;

    /** 디버그 로거 (선택).
     *  주어진 경우 컴파일 통계가 `logger.info`로 출력됩니다.
     *  주어지지 않으면 라이브러리는 어떠한 콘솔 출력도 하지 않습니다.
     */
    logger?: {
        info?: (message: string) => void;
        warn?: (message: string) => void;
    };
}
