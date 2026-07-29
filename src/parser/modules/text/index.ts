/**
 * Text module
 *
 * Parses the #TEXTxx command and channel 99 to manage
 * in-game text display.
 *
 * - #TEXTxx "string": defines text per index
 * - Channel 99: displays text at a specific beat
 *
 * Usage example:
 * #TEXT01 "Ready?"
 * #TEXT02 "GO!"
 * #00099:0102
 */

import type { BMSChart } from '../../bms/chart';

export interface TextEvent {
    /** Beat position */
    beat: number;
    /** Text to display */
    text: string;
    /** Text index (for reference) */
    textId: string;
}

export class Text {
    /** Text definitions by index (#TEXTxx) */
    private _definitions: Map<string, string> = new Map();
    /** Text events by beat (channel 99) */
    private _events: TextEvent[] = [];

    /**
     * Extracts Text information from a BMSChart
     */
    static fromBMSChart(chart: BMSChart): Text {
        const text = new Text();

        // Parse #TEXTxx
        chart.headers.each((name: string, value: string) => {
            const textMatch = name.match(/^TEXT([0-9A-Z]{2})$/i);
            if (textMatch && value) {
                const index = textMatch[1].toUpperCase();
                // Strip quotes
                let textValue = value.trim();
                if ((textValue.startsWith('"') && textValue.endsWith('"')) ||
                    (textValue.startsWith("'") && textValue.endsWith("'"))) {
                    textValue = textValue.slice(1, -1);
                }
                text._definitions.set(index, textValue);
            }
        });

        // Extract channel 99 events
        const objects = chart.objects.all();
        for (const obj of objects) {
            if (obj.channel === '99') {
                const beat = chart.measureToBeat(obj.measure, obj.fraction);
                const textId = obj.value.toUpperCase();

                // Look up the value in the text definitions
                const textValue = text._definitions.get(textId);
                if (textValue !== undefined) {
                    text._events.push({
                        beat,
                        text: textValue,
                        textId,
                    });
                }
            }
        }

        // Sort events
        text._events.sort((a, b) => a.beat - b.beat);

        return text;
    }

    /**
     * Returns the text active at a specific beat
     * (the most recently displayed text)
     */
    atBeat(beat: number): string | null {
        if (this._events.length === 0) {
            return null;
        }

        let lastText: string | null = null;
        for (const event of this._events) {
            if (event.beat > beat) break;
            lastText = event.text;
        }

        return lastText;
    }

    /**
     * Returns the text events within a specific beat range
     */
    getEventsInRange(startBeat: number, endBeat: number): TextEvent[] {
        return this._events.filter(
            event => event.beat >= startBeat && event.beat <= endBeat
        );
    }

    /**
     * Returns all text events
     */
    allEvents(): TextEvent[] {
        return [...this._events];
    }

    /**
     * Looks up a text definition
     */
    getDefinition(index: string): string | undefined {
        return this._definitions.get(index.toUpperCase());
    }

    /**
     * Returns all text definitions
     */
    allDefinitions(): Record<string, string> {
        const result: Record<string, string> = {};
        this._definitions.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }

    /**
     * Whether there are any text events
     */
    hasTextEvents(): boolean {
        return this._events.length > 0;
    }
}
