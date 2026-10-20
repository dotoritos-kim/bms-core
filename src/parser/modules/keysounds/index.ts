// Module that exposes Keysounds
/* module */

import { uniq, values } from '../../utils/lodash';
import { BMSChart } from '../../bms/chart';
import { isBase62Value, keysoundKey } from '../../../utils/objectId';

/**
 * A simple mapping between keysound IDs and file names.
 *
 * After parsing into a BMSChart with the Compiler, a Keysounds
 * object can be created with `fromBMSChart()`:
 *
 * Then `.get()` can be used to retrieve the file name:
 *
 */
export class KeySounds {
    _map: { [id: string]: string };
    _volumeMap: { [id: string]: number };
    /** `#BASE 62`: IDs are case-sensitive and keys keep their case. */
    readonly base62: boolean;
    constructor(map: { [id: string]: string }, volumeMap?: { [id: string]: number }, base62 = false) {
        this._map = map;
        this._volumeMap = volumeMap ?? {};
        this.base62 = base62;
    }

    /**
     * Returns the keysound file for the given ID.
     * @param id two-character keysound ID
     * @returns the sound file name
     */
    get(id: string): string | undefined {
        return this._map[keysoundKey(id, this.base62)];
    }

    /**
     * Returns the keysound volume for the given ID (0-100, default 100).
     * Parsed from BMS #VOLWAVxx headers.
     * @param id two-character keysound ID
     * @returns the volume (0-100)
     */
    getVolume(id: string): number {
        return this._volumeMap[keysoundKey(id, this.base62)] ?? 100;
    }

    /**
     * Returns the unique file names in this Keysounds object.
     * @returns an array of file names
     */
    files(): string[] {
        return uniq(values(this._map));
    }

    /**
     * Returns the mapping from keysound IDs to keysound file names.
     * Keys are lower-case for base36 charts and keep their case for `#BASE 62`
     * (see `keysoundKey`).
     *
     * **Caution:** this method returns the internal data structure used by
     * this Keysounds object. Do not mutate it!
     */
    all() {
        return this._map;
    }

    /**
     * Returns the mapping from keysound IDs to volumes.
     */
    allVolumes() {
        return this._volumeMap;
    }

    /**
     * Creates a new Keysounds object from a BMSChart.
     * @param chart
     */
    static fromBMSChart(chart: BMSChart) {
        void BMSChart;
        const map: { [id: string]: string } = {};
        const volumeMap: { [id: string]: number } = {};
        const base62 = isBase62Value(chart.headers.get('base'));
        chart.headers.each(function (name, value) {
            const wavMatch = name.match(/^wav(\S\S)$/i);
            if (wavMatch) {
                map[keysoundKey(wavMatch[1], base62)] = value;
                return;
            }
            // #VOLWAVxx yy — per-keysound volume (0-100)
            const volMatch = name.match(/^volwav(\S\S)$/i);
            if (volMatch) {
                const vol = parseInt(value, 10);
                if (!isNaN(vol)) {
                    volumeMap[keysoundKey(volMatch[1], base62)] = Math.max(0, Math.min(100, vol));
                }
            }
        });
        return new KeySounds(map, volumeMap, base62);
    }
}
