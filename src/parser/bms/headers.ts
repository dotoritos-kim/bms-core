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
export class BMSHeaders {
    private _data: { [field: string]: string };
    private _dataAll: { [field: string]: string[] };

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
        return this._data[name.toLowerCase()];
    }

    /**
     * Returns every value of a header field. Useful when the field has been
     * specified multiple times.
     * @param name field name
     */
    getAll(name: string): string[] | undefined {
        return this._dataAll[name.toLowerCase()];
    }

    /**
     * Sets the value of a header field.
     * @param name field name
     * @param value field value
     */
    set(name: string, value: string) {
        const key = name.toLowerCase();
        this._data[key] = value;
        (this._dataAll[key] || (this._dataAll[key] = [])).push(value);
    }
}
