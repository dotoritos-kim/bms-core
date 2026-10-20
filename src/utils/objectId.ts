/**
 * BMS object IDs (#WAVxx, #BMPxx, note values, #LNOBJ ...).
 *
 * Classic charts use base36 IDs, which are case-insensitive ("0a" == "0A").
 * `#BASE 62` charts use base62 IDs, which are case-sensitive ("0a" != "0A")
 * and allow up to 3843 definitions — folding their case merges different
 * keysounds into one.
 */

export const BASE36_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const BASE62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** True when a `#BASE` header value selects base62 IDs. */
export function isBase62Value(value: unknown): boolean {
    return String(value ?? '').trim() === '62';
}

/** True when the headers declare `#BASE 62` (BMSHeaders or BMSHeaderData-like). */
export function isBase62Headers(headers: {
    get?: (name: string) => string | undefined;
    custom?: Map<string, string>;
    base?: unknown;
} | null | undefined): boolean {
    if (!headers) return false;
    if (headers.base !== undefined) return isBase62Value(headers.base);
    if (typeof headers.get === 'function') return isBase62Value(headers.get('base'));
    if (headers.custom) return isBase62Value(headers.custom.get('BASE') ?? headers.custom.get('base'));
    return false;
}

/**
 * Canonical form of an object ID: base36 → upper-case, base62 → unchanged.
 * Two IDs refer to the same object iff their canonical forms are equal.
 */
export function canonicalObjectId(id: string, base62: boolean): string {
    return base62 ? id : id.toUpperCase();
}

/** Number of usable IDs ('01'..'ZZ' = 1295, '01'..'zz' = 3843). */
export function maxObjectIds(base62: boolean): number {
    const n = base62 ? 62 : 36;
    return n * n - 1;
}

/** Index of an ID in its base (NaN for invalid characters) — for sorting. */
export function objectIdIndex(id: string, base62: boolean): number {
    const digits = base62 ? BASE62_DIGITS : BASE36_DIGITS;
    const s = base62 ? id : id.toUpperCase();
    if (s.length !== 2) return Number.NaN;
    const hi = digits.indexOf(s[0]);
    const lo = digits.indexOf(s[1]);
    return hi < 0 || lo < 0 ? Number.NaN : hi * digits.length + lo;
}

/** ID for an index (1-based usable range; 0 is '00'). */
export function objectIdAt(index: number, base62: boolean): string {
    const digits = base62 ? BASE62_DIGITS : BASE36_DIGITS;
    const n = digits.length;
    return digits[Math.floor(index / n) % n] + digits[index % n];
}

/**
 * Allocates up to `count` IDs not in `used` (compared canonically), in
 * ascending order, never '00'. Returns fewer when the base runs out.
 */
export function allocateObjectIds(used: Iterable<string>, count: number, base62: boolean): string[] {
    const taken = new Set<string>();
    for (const id of used) taken.add(canonicalObjectId(id, base62));
    const out: string[] = [];
    const max = maxObjectIds(base62);
    for (let i = 1; i <= max && out.length < count; i++) {
        const id = objectIdAt(i, base62);
        if (!taken.has(id)) {
            out.push(id);
            taken.add(id);
        }
    }
    return out;
}

/**
 * Lookup key used by keysound maps (`KeySounds`, audio preloaders):
 * base36 → lower-case (historical form of `chart.keysounds`), base62 → unchanged.
 */
export function keysoundKey(id: string, base62: boolean): string {
    return base62 ? id : id.toLowerCase();
}
