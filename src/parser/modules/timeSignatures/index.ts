/**
 * TimeSignatures is a collection of time-signature values indexed by measure number.
 *
 * Measure numbers start at 0.
 * By default, each measure has a measure size of 1,
 * which represents a common 4/4 time signature.
 *
 * After parsing into a BMSChart using the Compiler,
 * the TimeSignatures object can be accessed:
 *
 * A TimeSignatures can also be created from scratch using the constructor.
 *
 * The most useful application of this class is
 * converting a measure and fraction into a beat number.
 *
 * ```js
 * timeSignatures.measureToBeat(0, 0.000) // =>  0.0
 * timeSignatures.measureToBeat(0, 0.500) // =>  2.0
 * timeSignatures.measureToBeat(1, 0.000) // =>  4.0
 * timeSignatures.measureToBeat(1, 0.500) // =>  5.5
 * timeSignatures.measureToBeat(2, 0.000) // =>  7.0
 * timeSignatures.measureToBeat(2, 0.500) // =>  9.5
 * timeSignatures.measureToBeat(3, 0.000) // => 12.0
 * ```
 */
export class TimeSignatures {
    private _values: { [measure: number]: number };
    constructor() {
        this._values = {};
    }

    /**
     * Sets the size of the specified measure.
     * @param measure the measure number, starting from 0.
     * @param value the measure size.
     *  For example, a size of 1.0 represents a common 4/4 time signature,
     *  while a size of 0.75 represents 3/4 or 6/8 time.
     */
    set(measure: number, value: number) {
        // BUG-P4: sizes <= 0 cause infinite loops / division by zero -> enforce a minimum
        this._values[measure] = value > 0 ? value : 1;
    }

    /**
     * Gets the size of the specified measure.
     * @param measure the measure number.
     * @returns the size of the measure.
     *  By default, a measure has size 1.
     */
    get(measure: number): number {
        return this._values[measure] || 1;
    }

    /**
     * Gets the number of beats in the specified measure.
     *
     * Since one beat is equivalent to a quarter note in 4/4 time,
     * this is the same as `(timeSignatures.get(measure) * 4)`.
     * @param measure the measure number.
     * @returns the size of the measure in beats.
     */
    getBeats(measure: number): number {
        return this.get(measure) * 4;
    }

    /**
     * Converts a measure number and a fraction within that measure
     * into a beat number.
     *
     * @param measure the measure number.
     * @param fraction the fraction of the measure,
     * @returns the number of beats since measure 0.
     */
    measureToBeat(measure: number, fraction: number): number {
        let sum = 0;
        for (let i = 0; i < measure; i++) sum += this.getBeats(i);
        return sum + this.getBeats(measure) * fraction;
    }

    /**
     * Converts a beat number into a measure number and a fraction within the measure.
     * This is the inverse of measureToBeat.
     *
     * ```js
     * timeSignatures.beatToMeasure(0.0)  // => { measure: 0, fraction: 0.0 }
     * timeSignatures.beatToMeasure(2.0)  // => { measure: 0, fraction: 0.5 }
     * timeSignatures.beatToMeasure(4.0)  // => { measure: 1, fraction: 0.0 }
     * timeSignatures.beatToMeasure(5.5)  // => { measure: 1, fraction: 0.5 } (for a 3/4 measure)
     * ```
     *
     * @param beat the beat number (starting from 0)
     * @param maxMeasure upper bound of measures to search (default: 999)
     * @returns { measure, fraction }
     */
    beatToMeasure(beat: number, maxMeasure: number = 999): { measure: number; fraction: number } {
        if (beat <= 0) return { measure: 0, fraction: 0 };
        let sum = 0;
        for (let i = 0; i <= maxMeasure; i++) {
            const beats = this.getBeats(i);
            if (sum + beats > beat) {
                const fraction = beats > 0 ? (beat - sum) / beats : 0;
                return { measure: i, fraction };
            }
            sum += beats;
        }
        // If the beat exceeds maxMeasure, estimate assuming 4/4
        const remaining = beat - sum;
        const extraMeasures = Math.floor(remaining / 4);
        const extraFraction = (remaining % 4) / 4;
        return { measure: maxMeasure + 1 + extraMeasures, fraction: extraFraction };
    }

    /**
     * Creates a TimeSignatures from a Map<number, number> (editor format).
     */
    static fromMap(map: Map<number, number>): TimeSignatures {
        const ts = new TimeSignatures();
        for (const [measure, size] of map) {
            ts.set(measure, size);
        }
        return ts;
    }

    /**
     * Converts the TimeSignatures to a Map<number, number>.
     */
    toMap(): Map<number, number> {
        const map = new Map<number, number>();
        for (const [key, value] of Object.entries(this._values)) {
            map.set(Number(key), value);
        }
        return map;
    }
}
