/**
 * `#LNTYPE 2` (MGQ-notation) long notes.
 *
 * Per the BMS command memo: an LN is opened where a non-00 object appears on a
 * long-note channel, continues while the following slots stay non-00 (also
 * across a bar line when the last slot of a measure and the first slot of the
 * next are both non-00), and closes where the next 00 appears. The keysound is
 * the one of the first object.
 *
 * `#LNTYPE 1` (RDM-notation, the default) pairs objects instead: one marks the
 * start, the next one the end.
 */
import type { BMSObject } from '../../bms/objects';

const EPS = 1e-9;

export interface MgqLongNote {
    /** Object that opens the long note */
    start: BMSObject;
    /** Measure / fraction where the long note closes (the first 00 slot) */
    endMeasure: number;
    endFraction: number;
}

/** True when the chart declares MGQ-notation long notes (`#LNTYPE 2`). */
export function isMgqLnType(lntype: string | undefined): boolean {
    return lntype !== undefined && parseInt(lntype.trim(), 10) === 2;
}

/** True for long-note channels (5x / 6x). */
export function isLongNoteChannel(channel: string): boolean {
    const first = channel.charAt(0);
    return first === '5' || first === '6';
}

/** Where an object's slot ends, normalised so the end of a measure is the next measure's 0. */
function slotEnd(obj: BMSObject): { measure: number; fraction: number } {
    const size = obj.size ?? 0;
    const f = obj.fraction + size;
    return f >= 1 - EPS ? { measure: obj.measure + 1, fraction: 0 } : { measure: obj.measure, fraction: f };
}

/**
 * Groups the long-note channel objects of an MGQ chart into long notes.
 * @param objects all chart objects in time order (`BMSObjects.allSorted()`)
 * @returns long notes keyed by their opening object, and the set of objects
 *          that only continue an already open long note
 */
export function groupMgqLongNotes(objects: readonly BMSObject[]): {
    starts: Map<BMSObject, MgqLongNote>;
    continuations: Set<BMSObject>;
} {
    const starts = new Map<BMSObject, MgqLongNote>();
    const continuations = new Set<BMSObject>();
    const open = new Map<string, MgqLongNote>();

    for (const obj of objects) {
        if (!isLongNoteChannel(obj.channel)) continue;
        const channel = obj.channel.toUpperCase();
        const ln = open.get(channel);
        if (
            ln &&
            obj.size !== undefined &&
            ln.endMeasure === obj.measure &&
            Math.abs(ln.endFraction - obj.fraction) < EPS
        ) {
            // Directly adjacent to the open LN: it continues.
            const end = slotEnd(obj);
            ln.endMeasure = end.measure;
            ln.endFraction = end.fraction;
            continuations.add(obj);
            continue;
        }
        const end = slotEnd(obj);
        const next: MgqLongNote = { start: obj, endMeasure: end.measure, endFraction: end.fraction };
        starts.set(obj, next);
        open.set(channel, next);
    }
    return { starts, continuations };
}
