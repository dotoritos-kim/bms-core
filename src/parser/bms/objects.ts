/**
 * BMSObjects holds the collection of objects within a BMS chart.
 */
export class BMSObjects {
    private _objects: BMSObject[];
    /**
     * Dedup cache: `"channel:measure:fraction"` → index in `_objects`.
     * The BGM channel (01) allows duplicates, so it is never cached.
     * Performance: turns `add`'s duplicate scan from O(n) into O(1) (M2).
     */
    private _dedup: Map<string, number>;

    constructor() {
        this._objects = [];
        this._dedup = new Map();
    }

    /**
     * Builds the dedup key (excludes the BGM channel).
     */
    private static _key(obj: BMSObject): string {
        return `${obj.channel}:${obj.measure}:${obj.fraction}`;
    }

    /**
     * Adds a new object to this collection. If an object already exists at
     * the same channel and position it is replaced — except for the
     * auto-keysound track.
     * @param object the object to add
     */
    add(object: BMSObject) {
        if (object.channel !== '01') {
            const key = BMSObjects._key(object);
            const existingIndex = this._dedup.get(key);
            if (existingIndex !== undefined) {
                this._objects[existingIndex] = object;
                return;
            }
            this._dedup.set(key, this._objects.length);
        }
        this._objects.push(object);
    }

    /**
     * Returns an array of every object.
     */
    all() {
        return this._objects.slice();
    }

    /**
     * Returns every object as a time-sorted array.
     */
    allSorted() {
        const list = this.all();
        list.sort(function (a, b) {
            return a.measure + a.fraction - (b.measure + b.fraction);
        });
        return list;
    }
}

/** An object within a {BMSChart}. */
export interface BMSObject {
    /** Raw two-character BMS channel of this object. */
    channel: string;

    /** Measure number, 0-indexed (corresponds to `#000`). */
    measure: number;

    /**
     * Fractional position within the measure, in the half-open range
     * [0, 1). 0 means the object sits at the start of the measure;
     * values approaching 1 sit near its end.
     */
    fraction: number;

    /** Raw value of the BMS object. */
    value: string;
}
