/**
 *   - Reader: reads a BMS file from a Buffer, detects its character
 *     encoding, and decodes the buffer into a String using that encoding.
 *   - Compiler: ingests a BMS source String and converts it into a
 *     BMSChart, producing the in-memory representation of the chart.
 *
 *   - BMSChart: composed of BMSHeaders, BMSObjects, and TimeSignatures.
 *   - BMSHeaders: represents the header statements of a BMS file.
 *   - BMSObjects: represents the object collection of a BMS file.
 *   - BMSObject: represents an individual object.
 *
 *   - TimeSignatures: represents the chart's time-signature collection and
 *     converts (measure number, fraction) pairs to a beat number.
 *   - Timing: represents the chart's timing data and converts between
 *     musical time (beats) and metric time (seconds).
 *   - SongInfo: holds basic song metadata (title, artist, genre, etc.).
 *   - Notes: represents the sound objects within the chart.
 *   - Keysounds: maps keysound IDs to their file names.
 *   - Positioning: maps beats to in-game positions. Some rhythm games
 *     adjust the scroll amount per beat.
 *   - Spacing: maps beats to note spacing. Some rhythm games dynamically
 *     change note spacing (HI-SPEED).
 *   - Speedcore: represents a linear animation.
 */

import * as Reader from './modules/reader';
import * as Compiler from './modules/compiler';
import { BMSChart } from './bms/chart';
import { TimeSignatures } from './modules/timeSignatures';
import { Notes } from './modules/notes';
import { Timing } from './modules/timing';
import { SongInfo } from './modules/songInfo';
import { KeySounds } from './modules/keysounds';
import { Positioning } from './modules/positioning';
import { Spacing } from './modules/spacing';
export class BMSParser {
    chart: BMSChart | null = null;

    /**
     * Fetches and reads a BMS file from a URL.
     * @param url - URL of the BMS file
     * @param fetchOptions - options forwarded to `fetch`
     * @returns the decoded BMS file contents as a string
     */
    async fetchFromUrl(url: string, fetchOptions?: RequestInit): Promise<string> {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return this.readBuffer(arrayBuffer);
    }

    /**
     * Reads a BMS file buffer and decodes it into a string.
     * @param buffer - BMS file buffer (ArrayBuffer or Uint8Array)
     * @returns the decoded BMS file contents as a string
     */
    async readBuffer(buffer: ArrayBuffer | Uint8Array): Promise<string> {
        return await Reader.readAsync(buffer);
    }

    /**
     * Compiles a BMS source string into a BMSChart structure.
     * @param bmsString - BMS file contents as a string
     * @returns the compiled BMSChart
     */
    compileString(bmsString: string): BMSChart {
        this.chart = Compiler.compile(bmsString).chart;
        return this.chart;
    }

    /**
     * Extracts song metadata (title, artist, genre, etc.) from the BMSChart.
     * @returns the song info object
     */
    getSongInfo(): SongInfo | null {
        if (!this.chart) return null;
        return SongInfo.fromBMSChart(this.chart);
    }

    /**
     * Extracts timing data needed to convert between beats and seconds.
     * @returns the Timing object that manages beat-to-second conversion
     */
    getTiming(): Timing | null {
        if (!this.chart) return null;
        return Timing.fromBMSChart(this.chart);
    }

    /**
     * Extracts positioning data for converting beats to in-game positions.
     * @returns the Positioning object that manages beat-to-position conversion
     */
    getPositioning(): Positioning | null {
        if (!this.chart) return null;
        return Positioning.fromBMSChart(this.chart);
    }

    /**
     * Extracts note data from the BMSChart.
     * @returns the Notes object containing parsed notes
     */
    getNotes(): Notes | null {
        if (!this.chart) return null;
        return Notes.fromBMSChart(this.chart);
    }

    /**
     * Returns the keysound mapping.
     * @returns the KeySounds object
     */
    getKeySounds(): KeySounds | null {
        if (!this.chart) return null;
        return KeySounds.fromBMSChart(this.chart);
    }
    calculateTotalPlayTime(): number {
        if (!this.chart) return 0;

        // Delegate to Timing to keep the SSoT (M1).
        const timing = Timing.fromBMSChart(this.chart);

        // Compute the final note's beat across every object (channels 01/02/03/08/09 included).
        const objects = this.chart.objects.allSorted();
        if (objects.length === 0) return 0;

        const lastObj = objects[objects.length - 1];
        const lastBeat = this.chart.measureToBeat(lastObj.measure, lastObj.fraction);

        return timing.beatToSeconds(lastBeat) * 1000;
    }
}
export { Reader, Compiler, KeySounds, Timing, SongInfo, Positioning, Spacing, BMSChart, Notes, TimeSignatures };
export type { ReaderOptions } from './modules/reader/types';
export type { BMSNote, NoteType } from './modules/notes';
export type { TimingAction, BaseTimingAction, BPMTimingAction, StopTimingAction } from './modules/timing';
export type { ISongInfoData } from './modules/songInfo';
export type { PositioningSegment } from './modules/positioning';
export type { SpacingSegment } from './modules/spacing';
