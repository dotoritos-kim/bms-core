import { BMSHeaders } from './headers';
import { BMSObjects } from './objects';
import { TimeSignatures } from '../modules/timeSignatures';

/**
 * BMSChart holds information about a specific BMS chart.
 * After compilation, a BMSChart no longer contains the `#RANDOM`
 * information that was already resolved.
 *
 * On its own, BMSChart only exposes its header fields and inner objects —
 * not much else.
 *
 * To extract higher-level information from a BMSChart, see the docs for
 * higher-level classes such as {Keysounds}, {Notes}, and {Timing}.
 */
export class BMSChart {
    headers: BMSHeaders;
    objects: BMSObjects;
    timeSignatures: TimeSignatures;
    constructor() {
        /**
         * {BMSHeaders} — the BMS-specific headers of this chart.
         */
        this.headers = new BMSHeaders();
        /**
         * {BMSObjects} — every object in this chart.
         */
        this.objects = new BMSObjects();
        /**
         * {TimeSignatures} — the time-signature data of this chart.
         */
        this.timeSignatures = new TimeSignatures();
    }

    /**
     * Converts a (measure number, fraction) pair into beats. One beat is
     * normally equivalent to a quarter note in the time signature.
     *
     * @param {number} measure 0-based measure number.
     * @param {number} fraction position within the measure, in the range [0, 1].
     */
    measureToBeat(measure: number, fraction: number) {
        return this.timeSignatures.measureToBeat(measure, fraction);
    }
}
