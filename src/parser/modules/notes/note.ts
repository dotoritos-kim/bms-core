/**
 * Note type definitions
 * - playable: notes the player must hit (channels 11-19, 21-29)
 * - invisible: invisible ghost notes (channels 31-39, 41-49)
 * - landmine: landmine notes (channels D1-D9, E1-E9)
 * - bgm: auto-played BGM notes (channel 01)
 */
export type NoteType = 'playable' | 'invisible' | 'landmine' | 'bgm';

/** An individual note in a notechart */
export interface BMSNote {
    beat: number;
    endBeat?: number;
    /** Tick position (960 ticks/beat). Primary for editor precision, derived from beat in parser. */
    tick?: number;
    /** End tick for long notes (960 ticks/beat). */
    endTick?: number;
    column?: string;
    keysound: string;

    /**
     * Note type
     */
    noteType?: NoteType;

    /**
     * Original BMS channel (for debugging/analysis)
     */
    channel?: string;

    /**
     * Landmine note damage (0-100%)
     * Only valid for landmine-type notes
     */
    damage?: number;

    /**
     * [bmson] Time (in seconds) at which playback of the sound file starts.
     */
    keysoundStart?: number;

    /**
     * [bmson] Time (in seconds) at which playback of the sound file stops.
     * When `undefined`, the sound file plays to the end.
     */
    keysoundEnd?: number;
}

/**
 * Validates the required fields of a BMSNote object at runtime.
 *
 * This used to be validated via a custom `DataStructure` façade, but the only
 * call site is the internal `Notes` collection and the field types are already
 * enforced by TypeScript, so it was replaced with a small inline guard.
 * The external API is unaffected.
 */
export function assertBMSNote(value: BMSNote): void {
    if (typeof value.beat !== 'number') {
        throw new Error('Error in property "beat": Value should be of type number');
    }
    if (value.endBeat !== undefined && value.endBeat !== null && typeof value.endBeat !== 'number') {
        throw new Error('Error in property "endBeat": Value should be of type number');
    }
    if (value.column !== undefined && value.column !== null && typeof value.column !== 'string') {
        throw new Error('Error in property "column": Value should be of type string');
    }
    if (typeof value.keysound !== 'string') {
        throw new Error('Error in property "keysound": Value should be of type string');
    }
}
