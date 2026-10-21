/**
 * Text encoder for the legacy encodings BMS files use, so a chart can be
 * written back in the encoding it was read with (Shift_JIS, EUC-KR, ...).
 *
 * `TextEncoder` only produces UTF-8, so the reverse tables are built lazily
 * from the runtime's own `TextDecoder` — encoding and decoding then agree by
 * construction, and no dependency is needed.
 */

/** Reverse table: character -> bytes (only non-ASCII entries). */
type ReverseTable = Map<string, number[]>;

const tables = new Map<string, ReverseTable | null>();

/** Encodings with a 1- or 2-byte layout that can be enumerated. */
const LEAD_RANGES: Record<string, [number, number] | 'single'> = {
    shift_jis: [0x81, 0xfc],
    'euc-kr': [0x81, 0xfe],
    gbk: [0x81, 0xfe],
    big5: [0x81, 0xfe],
    'windows-1251': 'single',
};

/** Normalises a label to the WHATWG name used by TextDecoder (e.g. 'Shift-JIS' -> 'shift_jis'). */
export function canonicalEncoding(label: string): string | null {
    try {
        return new TextDecoder(label).encoding;
    } catch {
        return null;
    }
}

function buildTable(encoding: string): ReverseTable | null {
    const layout = LEAD_RANGES[encoding];
    if (!layout) return null;
    const table: ReverseTable = new Map();
    const decoder = new TextDecoder(encoding, { fatal: true });
    const add = (bytes: number[]) => {
        let ch: string;
        try {
            ch = decoder.decode(new Uint8Array(bytes));
        } catch {
            return;
        }
        // One character per byte sequence; the first (lowest) sequence wins
        // for characters that several sequences decode to.
        if (ch.length >= 1 && ch.length <= 2 && [...ch].length === 1 && !table.has(ch)) table.set(ch, bytes);
    };
    if (layout === 'single') {
        for (let b = 0x80; b <= 0xff; b++) add([b]);
        return table;
    }
    // Single bytes above ASCII (half-width katakana in Shift_JIS)
    for (let b = 0x80; b <= 0xff; b++) add([b]);
    const [lo, hi] = layout;
    for (let lead = lo; lead <= hi; lead++) {
        for (let trail = 0x40; trail <= 0xfe; trail++) add([lead, trail]);
    }
    return table;
}

function tableFor(encoding: string): ReverseTable | null {
    if (!tables.has(encoding)) tables.set(encoding, buildTable(encoding));
    return tables.get(encoding)!;
}

/** Encodings `encodeText` can write losslessly (when every character fits). */
export function isWritableEncoding(label: string): boolean {
    const enc = canonicalEncoding(label);
    return enc !== null && (enc === 'utf-8' || enc === 'utf-16le' || enc === 'utf-16be' || enc in LEAD_RANGES);
}

export interface EncodedText {
    bytes: Uint8Array;
    /** Encoding actually written (UTF-8 when the requested one could not represent the text) */
    encoding: string;
    /** False when the text had to be written in UTF-8 instead of the requested encoding */
    exact: boolean;
}

/**
 * Encodes text for a BMS file.
 * @param text  the file contents
 * @param label requested encoding (WHATWG label, e.g. 'shift_jis', 'euc-kr')
 * @param bom   write a byte order mark (UTF-8 / UTF-16 only)
 * @returns the bytes; falls back to UTF-8 (`exact: false`) when the requested
 *          encoding is unknown or cannot represent a character of `text`
 */
export function encodeText(text: string, label: string, bom = false): EncodedText {
    const enc = canonicalEncoding(label) ?? 'utf-8';

    if (enc === 'utf-16le' || enc === 'utf-16be') {
        const le = enc === 'utf-16le';
        const out = new Uint8Array((text.length + (bom ? 1 : 0)) * 2);
        let o = 0;
        const put = (u: number) => {
            out[o++] = le ? u & 0xff : u >> 8;
            out[o++] = le ? u >> 8 : u & 0xff;
        };
        if (bom) put(0xfeff);
        for (let i = 0; i < text.length; i++) put(text.charCodeAt(i));
        return { bytes: out, encoding: enc, exact: true };
    }

    const table = enc === 'utf-8' ? null : tableFor(enc);
    if (table) {
        const out: number[] = [];
        let ok = true;
        for (const ch of text) {
            const code = ch.charCodeAt(0);
            if (code < 0x80) {
                out.push(code);
                continue;
            }
            const bytes = table.get(ch);
            if (!bytes) {
                ok = false;
                break;
            }
            for (const b of bytes) out.push(b);
        }
        if (ok) return { bytes: Uint8Array.from(out), encoding: enc, exact: true };
    }

    // UTF-8 (requested, or fallback). A fallback from a legacy encoding gets a
    // BOM so readers do not try to guess the legacy encoding again.
    const utf8 = new TextEncoder().encode(text);
    const exact = enc === 'utf-8';
    const withBom = bom || !exact;
    const bytes = new Uint8Array(utf8.length + (withBom ? 3 : 0));
    if (withBom) bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(utf8, withBom ? 3 : 0);
    return { bytes, encoding: 'utf-8', exact };
}
