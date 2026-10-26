/**
 * BMSHeaders holds the header information of a BMS file, including fields
 * such as `#TITLE`, `#ARTIST`, and `#BPM`.
 *
 * Use `get()` to look up a header value:
 *
 * ```js
 * chart.headers.get('title');
 * ```
 *
 * For header fields that may have multiple values (e.g. `#SUBTITLE`),
 * use `getAll()` to retrieve every value:
 *
 * ```js
 * chart.headers.getAll('subtitle');
 * ```
 */
/**
 * Header commands that carry a two-character object ID (#WAVxx, #BMPxx ...).
 * The command part is case-insensitive, but the ID keeps its case: in
 * `#BASE 62` charts `#WAV0a` and `#WAV0A` are different keysounds.
 */
const ID_HEADER = /^(wav|bmp|bpm|exbpm|stop|volwav|exwav|exbmp|argb|text|song|exrank|bga|swbga|scroll|speed|seek)([0-9a-z]{2})$/i;

/** Storage key for a header name: lower-case command, ID case preserved. */
export function headerKey(name: string): string {
    const m = ID_HEADER.exec(name);
    return m ? m[1].toLowerCase() + m[2] : name.toLowerCase();
}

export class BMSHeaders {
    private _data: { [field: string]: string };
    private _dataAll: { [field: string]: string[] };
    private _foldedCache: { [lower: string]: string } | null = null;
    /** stored key → sequence number of its latest `set()` (file order) */
    private _order: { [field: string]: number } = {};
    private _seq = 0;

    /** lower-case key → stored key (first wins), for case-insensitive fallback lookups */
    private _folded(): { [lower: string]: string } {
        if (!this._foldedCache) {
            const f: { [lower: string]: string } = {};
            for (const k in this._data) {
                const lower = k.toLowerCase();
                if (!(lower in f)) f[lower] = k;
            }
            this._foldedCache = f;
        }
        return this._foldedCache;
    }

    constructor() {
        this._data = {};
        this._dataAll = {};
    }

    /**
     * Iterates over every header field via a callback.
     * @param callback function invoked for each (key, value) pair
     */
    each(callback: (key: string, value: string) => void) {
        for (const i in this._data) {
            callback(i, this._data[i]);
        }
    }

    /**
     * Returns the latest value of a header field.
     * @param name field name
     * @return the latest value of the field
     */
    get(name: string): string | undefined {
        const key = headerKey(name);
        const v = this._data[key];
        // Base36 charts: IDs are case-insensitive ("#WAV0a" looked up as "0A").
        if (v !== undefined || key === name.toLowerCase() || this._data['base']?.trim() === '62') return v;
        return this._data[this._folded()[key.toLowerCase()] ?? ''];
    }

    /**
     * Returns every value of a header field. Useful when the field has been
     * specified multiple times.
     * @param name field name
     */
    getAll(name: string): string[] | undefined {
        return this._dataAll[headerKey(name)];
    }

    /**
     * Sets the value of a header field.
     * @param name field name
     * @param value field value
     */
    set(name: string, value: string) {
        const key = headerKey(name);
        this._data[key] = value;
        this._order[key] = ++this._seq;
        this._foldedCache = null;
        (this._dataAll[key] || (this._dataAll[key] = [])).push(value);
    }

    /**
     * Position of the latest definition of a header field in file order
     * (larger = closer to EOF), or -1 when the field is absent. Lets callers
     * resolve commands that override each other by order, e.g. `#RANK` vs
     * `#DEFEXRANK` ("the one closer to EOF wins").
     * @param name field name
     */
    order(name: string): number {
        return this._order[headerKey(name)] ?? -1;
    }

    /**
     * Whether a header field is present, including value-less commands such
     * as Qwilight's `#4K` / `#6K` / `#8K` (whose `get()` is undefined).
     * @param name field name
     */
    has(name: string): boolean {
        return this.order(name) >= 0;
    }
}
