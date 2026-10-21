// Module that takes a buffer, detects the character set,
// and returns the decoded string.
//
// To detect the character set, the Reader follows
// [ruv-it!'s](http://hitkey.nekokan.dyndns.info/cmds.htm#CHARSET).
//
import { ReaderOptions } from './types';

/**
 * Legacy (non-Unicode) encodings, in tie-break priority order. UTF-8 is tried
 * first and strictly; among the legacy encodings that decode without errors,
 * the one whose output looks most like real text wins (see `plausibility`).
 * - Shift-JIS: most common in Japanese BMS files (wins ties)
 * - GBK / GB18030: Simplified Chinese
 * - Big5: Traditional Chinese
 * - EUC-KR (WHATWG: windows-949): Korean
 * - Windows-1251: Russian/Cyrillic (compatibility with old BMS charts)
 *
 * Simply taking the first encoding that decodes without errors never reached
 * EUC-KR: GBK (and often Shift-JIS) accept almost every EUC-KR byte sequence.
 */
const LEGACY_ENCODINGS = [
    'shift-jis',
    'gbk',
    'gb18030',
    'big5',
    'euc-kr',
    'windows-1251',
] as const;

type LegacyEncoding = (typeof LEGACY_ENCODINGS)[number];

/**
 * Frequent Hangul syllables. Real Korean text is dominated by them, while
 * Shift-JIS / GBK bytes misread as windows-949 land on rare syllables.
 */
const COMMON_HANGUL = new Set(
    '이의가에는을를은다고하지서도로한기사자대리수아나인그일정어시전부만것들우주보해국상장비소내여제공적' +
    '연관방위성실미중모신오유물개화조면문무경발동구원생간선회분세계거마학교과진명등요용작통결음악곡노래' +
    '사랑너나우리별꿈밤하늘바람눈물마음날안녕그대빛영원세상봄여름가을겨울소녀소년춤불꽃새길손끝너의나의' +
    '처럼까지부터에서으로라고하고했다있다없다된다된하는했던있는없는같은위한대한통해모든우리들저것이것' +
    '그것여기거기언제어디무엇왜어떻게좋아싫어보고싶어기억시작마지막처음다시함께혼자오늘내일어제지금' +
    '파도바다하얀검은붉은푸른노란달해빛속밖앞뒤위아래곁품숨소리목소리향기얼굴미소웃음눈빛꽃잎나비' +
    '천사악마전설영웅전쟁평화운명시간공간우주은하행성혜성태양구름비번개폭풍천둥얼음화염어둠광명' +
    '편곡작사작곡보컬피아노기타드럼베이스믹스리믹스버전에디트오리지널스페셜라이트하드노멀이지',
);

function hangulWeight(code: number, encoding: LegacyEncoding): number {
    if (encoding !== 'euc-kr') return 0;
    return COMMON_HANGUL.has(String.fromCharCode(code)) ? 2 : 0.5;
}

/**
 * How plausible a character is as real text under the encoding it came from.
 * Shared symbols score 1; script-specific characters score by how typical they
 * are for that encoding's language.
 */
function charWeight(code: number, encoding: LegacyEncoding): number {
    if (code >= 0xac00 && code <= 0xd7a3) return hangulWeight(code, encoding); // Hangul syllables
    if (code >= 0x3131 && code <= 0x318e) return encoding === 'euc-kr' ? 0.5 : 0; // Hangul jamo
    if (code >= 0x3040 && code <= 0x30ff) return encoding === 'shift-jis' ? 2 : 1; // Kana
    if (code >= 0xff61 && code <= 0xff9f) return encoding === 'shift-jis' ? 1 : 0; // Half-width kana
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) {
        return encoding === 'euc-kr' ? 0.5 : encoding === 'windows-1251' ? 0 : 1; // CJK ideographs
    }
    if (code >= 0x0400 && code <= 0x04ff) return encoding === 'windows-1251' ? 1 : 0; // Cyrillic
    if ((code >= 0x3000 && code <= 0x303f) || (code >= 0xff01 && code <= 0xff5e)) return 1; // CJK punct / full-width
    if (code >= 0x2010 && code <= 0x27bf) return 1; // Punctuation, arrows, shapes (★, ♪ ...)
    if (code >= 0x00a0 && code <= 0x024f) return 0.3; // Latin-1 / Latin extended
    return 0;
}

/** Average plausibility of the non-ASCII characters (0 when there are none). */
function plausibility(text: string, encoding: LegacyEncoding): number {
    let total = 0;
    let score = 0;
    const limit = Math.min(text.length, 200_000);
    for (let i = 0; i < limit; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) continue;
        total++;
        score += charWeight(code, encoding);
    }
    return total === 0 ? 0 : score / total;
}

/**
 * Detects the encoding by checking the BOM (Byte Order Mark).
 * @returns the encoding and BOM length if a BOM is present, otherwise null
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
 * Checks whether the decoded string is valid.
 * - A replacement character (U+FFFD) indicates a wrong encoding
 * - A C1 control character (0x80-0x9F) appearing in text indicates a wrong encoding
 */
function isValidDecode(str: string): boolean {
    // Invalid if a replacement character is present
    if (str.includes('\ufffd')) {
        return false;
    }

    // Check for C1 control characters (should not appear in normal text)
    for (let i = 0; i < Math.min(str.length, 1000); i++) {
        const code = str.charCodeAt(i);
        if (code >= 0x80 && code <= 0x9f) {
            return false;
        }
    }

    return true;
}

/**
 * Tries multiple encodings and decodes with the most suitable one.
 * @returns the decoded text and the encoding used
 */
function decodeWithAutoDetect(buffer: Uint8Array): { text: string; encoding: string } {
    // 1. Check for a BOM
    const bom = detectBOM(buffer);
    if (bom) {
        const decoder = new TextDecoder(bom.encoding);
        const text = decoder.decode(buffer);
        // Remove the BOM character
        return {
            text: text.charCodeAt(0) === 0xfeff ? text.substring(1) : text,
            encoding: bom.encoding
        };
    }

    // 2. Strict UTF-8 (ASCII-only files end here too)
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        if (isValidDecode(text)) return { text, encoding: 'utf-8' };
    } catch {
        // not UTF-8
    }

    // 3. Legacy encodings: the most plausible valid decode wins; ties keep the
    //    priority order (Shift-JIS first, as before).
    let best: { text: string; encoding: string; score: number } | null = null;
    for (const encoding of LEGACY_ENCODINGS) {
        let text: string;
        try {
            text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
        } catch {
            continue; // encoding not supported by this runtime
        }
        if (!isValidDecode(text)) continue;
        const score = plausibility(text, encoding);
        if (!best || score > best.score) best = { text, encoding, score };
    }
    if (best) return { text: best.text, encoding: best.encoding };

    // 4. Fall back to UTF-8 when all encodings fail (replacement characters allowed)
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return { text: decoder.decode(buffer), encoding: 'utf-8' };
}

/**
 * Reads an ArrayBuffer, detects the character set, and returns the decoded string.
 *
 * Supported encodings:
 * - UTF-8 (emoji, full Unicode)
 * - Shift-JIS (Japanese)
 * - GBK, GB18030 (Simplified Chinese)
 * - Big5 (Traditional Chinese)
 * - EUC-KR (Korean)
 *
 * @returns the decoded text
 */
export function read(buffer: ArrayBuffer | Uint8Array, options: ReaderOptions | null = null): string {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // When forceEncoding is specified, use only that encoding
    if (options?.forceEncoding) {
        const decoder = new TextDecoder(options.forceEncoding);
        const text = decoder.decode(uint8Array);
        // Remove the BOM
        return text.charCodeAt(0) === 0xfeff ? text.substring(1) : text;
    }

    // Auto-detect
    const { text } = decodeWithAutoDetect(uint8Array);
    return text;
}

/**
 * Like `read`, but also reports the encoding the text was decoded with and
 * whether the file started with a byte order mark — so an editor can write
 * the file back in the same encoding.
 * @returns `encoding` as a WHATWG label (e.g. 'utf-8', 'shift-jis', 'euc-kr')
 */
export function readWithEncoding(
    buffer: ArrayBuffer | Uint8Array,
    options: ReaderOptions | null = null,
): { text: string; encoding: string; bom: boolean } {
    const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const bom = detectBOM(uint8Array) !== null;
    if (options?.forceEncoding) {
        const decoder = new TextDecoder(options.forceEncoding);
        const text = decoder.decode(uint8Array);
        return {
            text: text.charCodeAt(0) === 0xfeff ? text.substring(1) : text,
            encoding: decoder.encoding,
            bom,
        };
    }
    const { text, encoding } = decodeWithAutoDetect(uint8Array);
    // Report the canonical WHATWG name ('shift-jis' -> 'shift_jis').
    let canonical = encoding;
    try {
        canonical = new TextDecoder(encoding).encoding;
    } catch {
        // keep the label as is
    }
    return { text, encoding: canonical, bom };
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
