/**
 * ExRank (Extended Rank/Judgment) module
 *
 * Parses the #DEFEXRANK and #EXRANKxx commands and channel A0 to manage
 * per-beat judgment multipliers.
 *
 * - #DEFEXRANK n: default judgment multiplier (100 = Normal)
 * - #EXRANKxx n: per-index judgment multiplier definitions
 * - Channel A0: changes the judgment multiplier at a specific beat
 *
 * Judgment multiplier semantics:
 * - 100 = default judgment (Normal)
 * - 200 = judgment twice as lenient
 * - 50 = judgment half as strict
 */

import type { BMSChart } from '../../bms/chart';

export interface ExRankEvent {
    /** Beat position */
    beat: number;
    /** Judgment multiplier (100 = Normal) */
    value: number;
}

export class ExRank {
    /** Default judgment multiplier (#DEFEXRANK) */
    private _defaultValue: number = 100;
    /** Per-index judgment multipliers (#EXRANKxx) */
    private _definitions: Map<string, number> = new Map();
    /** Per-beat judgment change events (channel A0) */
    private _events: ExRankEvent[] = [];

    /**
     * Extracts ExRank information from a BMSChart.
     */
    static fromBMSChart(chart: BMSChart): ExRank {
        const exrank = new ExRank();

        // Parse #DEFEXRANK
        const defExRank = chart.headers.get('DEFEXRANK');
        if (defExRank) {
            const value = parseInt(defExRank, 10);
            if (!isNaN(value) && value > 0) {
                exrank._defaultValue = value;
            }
        }

        // Parse #EXRANKxx
        chart.headers.each((name: string, value: string) => {
            const exrankMatch = name.match(/^EXRANK([0-9A-Z]{2})$/i);
            if (exrankMatch && value) {
                const index = exrankMatch[1].toUpperCase();
                const rankValue = parseInt(value, 10);
                if (!isNaN(rankValue)) {
                    exrank._definitions.set(index, rankValue);
                }
            }
        });

        // Extract channel A0 events
        const objects = chart.objects.all();
        for (const obj of objects) {
            if (obj.channel.toUpperCase() === 'A0') {
                const beat = chart.measureToBeat(obj.measure, obj.fraction);
                const valueIndex = obj.value.toUpperCase();

                // Look up the value from #EXRANKxx
                let rankValue = exrank._definitions.get(valueIndex);
                if (rankValue === undefined) {
                    // Use the Base36 value directly (00-ZZ → 0-1295)
                    rankValue = parseInt(valueIndex, 36);
                }

                if (!isNaN(rankValue)) {
                    exrank._events.push({ beat, value: rankValue });
                }
            }
        }

        // Sort events
        exrank._events.sort((a, b) => a.beat - b.beat);

        return exrank;
    }

    /**
     * Returns the default judgment multiplier.
     */
    getDefault(): number {
        return this._defaultValue;
    }

    /**
     * Returns the judgment multiplier at a specific beat.
     */
    atBeat(beat: number): number {
        // Return the default when there are no events
        if (this._events.length === 0) {
            return this._defaultValue;
        }

        // Find the last event at or before the current beat
        let result = this._defaultValue;
        for (const event of this._events) {
            if (event.beat > beat) break;
            result = event.value;
        }

        return result;
    }

    /**
     * Returns every judgment change event.
     */
    allEvents(): ExRankEvent[] {
        return [...this._events];
    }

    /**
     * Returns the judgment definition for an index.
     */
    getDefinition(index: string): number | undefined {
        return this._definitions.get(index.toUpperCase());
    }

    /**
     * Returns every definition.
     */
    allDefinitions(): Record<string, number> {
        const result: Record<string, number> = {};
        this._definitions.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * Whether the judgment multiplier changes over time.
     */
    hasDynamicRank(): boolean {
        return this._events.length > 0;
    }
}
