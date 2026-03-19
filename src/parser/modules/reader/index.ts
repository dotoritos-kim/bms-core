// 버퍼를 받아 문자 집합을 감지하고
// 디코딩된 문자열을 반환하는 모듈입니다.
//
// Reader는 문자 집합을 감지하기 위해
// [ruv-it!'s](http://hitkey.nekokan.dyndns.info/cmds.htm#CHARSET)을 따릅니다.
//
import { ReaderOptions } from './types';

/**
 * 시도할 인코딩 목록 (우선순위 순서)
 * - UTF-8: 유니코드 표준 (이모지 포함)
 * - Shift-JIS: 일본어 BMS 파일에서 가장 흔함
 * - GBK: 중국어 간체 (Windows)
 * - GB18030: 중국어 간체 (유니코드 호환)
 * - Big5: 중국어 번체 (대만/홍콩)
 * - EUC-KR: 한국어
 */
const ENCODINGS_TO_TRY = ['utf-8', 'shift-jis', 'gbk', 'gb18030', 'big5', 'euc-kr'] as const;

/**
 * BOM(Byte Order Mark)을 확인하여 인코딩을 감지합니다.
 * @returns BOM이 있으면 인코딩과 BOM 길이, 없으면 null
 */
function detectBOM(buffer: Uint8Array): { encoding: string; bomLength: number } | null {
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return { encoding: 'utf-8', bomLength: 3 };
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return { encoding: 'utf-16le', bomLength: 2 };
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return { encoding: 'utf-16be', bomLength: 2 };
    }
    return null;
}

/**
 * 디코딩된 문자열이 유효한지 검사합니다.
 * - 대체 문자(U+FFFD)가 있으면 잘못된 인코딩
 * - C1 제어 문자(0x80-0x9F)가 텍스트에 나타나면 잘못된 인코딩
 */
function isValidDecode(str: string): boolean {
    // 대체 문자가 있으면 무효
    if (str.includes('\ufffd')) {
        return false;
    }

    // C1 제어 문자 확인 (일반 텍스트에서는 나타나지 않아야 함)
    for (let i = 0; i < Math.min(str.length, 1000); i++) {
        const code = str.charCodeAt(i);
        if (code >= 0x80 && code <= 0x9f) {
            return false;
        }
    }

    return true;
}

/**
 * 여러 인코딩을 시도하여 가장 적합한 인코딩으로 디코딩합니다.
 * @returns 디코딩된 텍스트와 사용된 인코딩
 */
function decodeWithAutoDetect(buffer: Uint8Array): { text: string; encoding: string } {
    // 1. BOM 확인
    const bom = detectBOM(buffer);
    if (bom) {
        const decoder = new TextDecoder(bom.encoding);
        const text = decoder.decode(buffer);
        // BOM 문자 제거
        return {
            text: text.charCodeAt(0) === 0xfeff ? text.substring(1) : text,
            encoding: bom.encoding
        };
    }

    // 2. 각 인코딩을 순서대로 시도
    for (const encoding of ENCODINGS_TO_TRY) {
        try {
            const decoder = new TextDecoder(encoding, { fatal: false });
            const text = decoder.decode(buffer);

            if (isValidDecode(text)) {
                return { text, encoding };
            }
        } catch {
            // 해당 인코딩 지원하지 않으면 다음으로
            continue;
        }
    }

    // 3. 모든 인코딩 실패 시 UTF-8로 폴백 (대체 문자 허용)
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return { text: decoder.decode(buffer), encoding: 'utf-8' };
}

/**
 * ArrayBuffer를 읽고, 문자 집합을 감지하며, 디코딩된 문자열을 반환합니다.
 *
 * 지원 인코딩:
 * - UTF-8 (이모지, 유니코드 전체)
 * - Shift-JIS (일본어)
 * - GBK, GB18030 (중국어 간체)
 * - Big5 (중국어 번체)
 * - EUC-KR (한국어)
 *
 * @returns 디코딩된 텍스트
 */
export function read(buffer: ArrayBuffer | Uint8Array, options: ReaderOptions | null = null): string {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // forceEncoding이 지정되면 해당 인코딩만 사용
    if (options?.forceEncoding) {
        const decoder = new TextDecoder(options.forceEncoding);
        const text = decoder.decode(uint8Array);
        // BOM 제거
        return text.charCodeAt(0) === 0xfeff ? text.substring(1) : text;
    }

    // 자동 감지
    const { text } = decodeWithAutoDetect(uint8Array);
    return text;
}

export function readAsync(
    buffer: ArrayBuffer | Uint8Array,
    options: ReaderOptions | null
): Promise<string>;
export function readAsync(buffer: ArrayBuffer | Uint8Array): Promise<string>;
export function readAsync(...args: unknown[]) {
    const buffer = args[0] as ArrayBuffer | Uint8Array;
    const options = args[1] as ReaderOptions | null | undefined;
    return new Promise<string>(function (resolve, reject) {
        try {
            resolve(read(buffer, options ?? null));
        } catch (e: unknown) {
            reject(e);
        }
    });
}

export { getReaderOptionsFromFilename } from './getReaderOptionsFromFilename';
