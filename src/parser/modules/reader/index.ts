// Module that takes a buffer, detects the character set,
// and returns the decoded string.
//
// To detect the character set, the Reader follows
// [ruv-it!'s](http://hitkey.nekokan.dyndns.info/cmds.htm#CHARSET).
//
import { ReaderOptions } from './types';

/**
 * List of encodings to try (in priority order)
 * - UTF-8: Unicode standard (includes emoji)
 * - Shift-JIS: most common in Japanese BMS files
 * - GBK: Simplified Chinese (Windows)
 * - GB18030: Simplified Chinese (Unicode-compatible)
 * - Big5: Traditional Chinese (Taiwan/Hong Kong)
 * - EUC-KR: Korean
 * - Windows-1251: Russian/Cyrillic (compatibility with old BMS charts)
 */
const ENCODINGS_TO_TRY = [
    'utf-8',
    'shift-jis',
    'gbk',
    'gb18030',
    'big5',
    'euc-kr',
    'windows-1251',
] as const;

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

    // 2. Try each encoding in order
    for (const encoding of ENCODINGS_TO_TRY) {
        try {
            const decoder = new TextDecoder(encoding, { fatal: false });
            const text = decoder.decode(buffer);

            if (isValidDecode(text)) {
                return { text, encoding };
            }
        } catch {
            // Move on if the encoding is not supported
            continue;
        }
    }

    // 3. Fall back to UTF-8 when all encodings fail (replacement characters allowed)
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
