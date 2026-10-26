/**
 * BMS Channel Writer
 * Converts note data into BMS channel strings
 */

import { canonicalObjectId, isBase62Headers } from '../utils/objectId';
import type {
  EditableBMSChart,
  EditableBMSNote,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  BMSExtraObject,
  ChannelData,
  ReverseChannelMapping,
  BMSWriterOptions,
  BMSWriterWarning,
  BMSWriterWarningCode,
} from './types';
import type { NoteType } from '../parser';

/** 1 beat = 960 ticks (MIDI standard) */
const TICKS_PER_BEAT = 960;

/** Highest measure number a BMS channel line can address (#000xx .. #999xx) */
const MAX_MEASURE = 999;

// ──────────────────────────────────────────────────────────────────────────────
// Warnings
// ──────────────────────────────────────────────────────────────────────────────

const WARNING_MESSAGES: Record<BMSWriterWarningCode, (n: number) => string> = {
  'slot-collision-rerouted': (n) =>
    `${n} object(s) shared a slot with another object on the same channel; their keysounds were written on the BGM channel (01) instead`,
  'slot-collision-dropped': (n) =>
    `${n} object(s) shared a slot with another object on the same channel and could not be kept`,
  'ln-end-shortened': (n) =>
    `${n} long-note end(s) coincided with another note in the same lane and were shortened by 1/192 measure`,
  'out-of-range': (n) => `${n} object(s) outside measures 000-${MAX_MEASURE} were skipped`,
  'definition-keys-exhausted': (n) =>
    `${n} BPM/STOP value(s) could not get a #BPMxx/#STOPxx definition key (all keys in use)`,
  'invalid-value': (n) => `${n} BPM/STOP event(s) with a non-numeric value were skipped`,
  'unmapped-lane': (n) => `${n} note(s) in a lane with no channel in this layout were skipped`,
};

/** Collects writer warnings, aggregated per code. */
export class WriterWarnings {
  private readonly counts = new Map<BMSWriterWarningCode, number>();

  add(code: BMSWriterWarningCode, count = 1): void {
    if (count <= 0) return;
    this.counts.set(code, (this.counts.get(code) ?? 0) + count);
  }

  toList(): BMSWriterWarning[] {
    return [...this.counts].map(([code, count]) => ({
      code,
      count,
      message: WARNING_MESSAGES[code](count),
    }));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Measure table (cumulative measure starts, computed once per write)
// ──────────────────────────────────────────────────────────────────────────────

interface TickPosition {
  measure: number;
  fraction: number;
  tickOffset: number;
  ticksInMeasure: number;
}

/**
 * Cumulative measure-start positions for measures 000-999, in ticks and in beats.
 * Lookups are binary searches, so locating N notes costs O(N log M) instead of
 * O(N x M).
 */
class MeasureTable {
  /** starts[m] = first tick of measure m; starts[MAX_MEASURE + 1] = end of measure 999 */
  private readonly starts: number[];
  private readonly beatStarts: number[];

  constructor(timeSignatures: Map<number, number>) {
    this.starts = new Array(MAX_MEASURE + 2);
    this.beatStarts = new Array(MAX_MEASURE + 2);
    this.starts[0] = 0;
    this.beatStarts[0] = 0;
    for (let m = 0; m <= MAX_MEASURE; m++) {
      const size = timeSignatures.get(m) ?? 1.0;
      const beats = 4 * size;
      const ticks = Math.round(beats * TICKS_PER_BEAT);
      this.starts[m + 1] = this.starts[m] + (Number.isFinite(ticks) && ticks > 0 ? ticks : 0);
      this.beatStarts[m + 1] = this.beatStarts[m] + (Number.isFinite(beats) && beats > 0 ? beats : 0);
    }
  }

  measureStart(measure: number): number {
    return this.starts[measure];
  }

  ticksIn(measure: number): number {
    return this.starts[measure + 1] - this.starts[measure];
  }

  /** Largest m (0..MAX_MEASURE) with arr[m] <= x */
  private static search(arr: number[], x: number): number {
    let lo = 0;
    let hi = MAX_MEASURE;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Tick-based position (no floating point error); null when outside measures 000-999 */
  locateTick(tick: number): TickPosition | null {
    if (!Number.isFinite(tick) || tick < 0 || tick >= this.starts[MAX_MEASURE + 1]) return null;
    const measure = MeasureTable.search(this.starts, tick);
    const ticksInMeasure = this.ticksIn(measure);
    const tickOffset = tick - this.starts[measure];
    return { measure, fraction: tickOffset / ticksInMeasure, tickOffset, ticksInMeasure };
  }

  /** Beat-based position (legacy notes without ticks); null when outside measures 000-999 */
  locateBeat(beat: number): { measure: number; fraction: number } | null {
    if (!Number.isFinite(beat) || beat < 0) return null;
    const x = beat + 1e-9;
    if (x >= this.beatStarts[MAX_MEASURE + 1]) return null;
    const measure = MeasureTable.search(this.beatStarts, x);
    const beatsInMeasure = this.beatStarts[measure + 1] - this.beatStarts[measure];
    const fraction = (beat - this.beatStarts[measure]) / beatsInMeasure;
    return { measure, fraction: Math.max(0, Math.min(fraction, 1 - 1e-9)) };
  }
}

function isMeasureInRange(measure: number): boolean {
  return Number.isInteger(measure) && measure >= 0 && measure <= MAX_MEASURE;
}

/** A note is a long note only when it is playable and carries end data. */
export function isLongNote(note: EditableBMSNote): boolean {
  return (
    (note.noteType === undefined || note.noteType === 'playable') &&
    (note.endBeat !== undefined || note.endTick !== undefined)
  );
}


/**
 * IIDX SP reverse mapping (column -> channel)
 */
export const IIDX_SP_REVERSE: ReverseChannelMapping = {
  playable: new Map([
    ['1', '11'],
    ['2', '12'],
    ['3', '13'],
    ['4', '14'],
    ['5', '15'],
    ['SC', '16'],
    ['FZ', '17'],
    ['6', '18'],
    ['7', '19'],
  ]),
  invisible: new Map([
    ['1', '31'],
    ['2', '32'],
    ['3', '33'],
    ['4', '34'],
    ['5', '35'],
    ['SC', '36'],
    ['FZ', '37'],
    ['6', '38'],
    ['7', '39'],
  ]),
  landmine: new Map([
    ['1', 'D1'],
    ['2', 'D2'],
    ['3', 'D3'],
    ['4', 'D4'],
    ['5', 'D5'],
    ['SC', 'D6'],
    ['FZ', 'D7'],
    ['6', 'D8'],
    ['7', 'D9'],
  ]),
  longNote: new Map([
    ['1', '51'],
    ['2', '52'],
    ['3', '53'],
    ['4', '54'],
    ['5', '55'],
    ['SC', '56'],
    ['FZ', '57'],
    ['6', '58'],
    ['7', '59'],
  ]),
};

/**
 * IIDX DP reverse mapping
 */
export const IIDX_DP_REVERSE: ReverseChannelMapping = {
  playable: new Map([
    ...IIDX_SP_REVERSE.playable,
    ['8', '21'],
    ['9', '22'],
    ['10', '23'],
    ['11', '24'],
    ['12', '25'],
    ['SC2', '26'],
    ['FZ2', '27'],
    ['13', '28'],
    ['14', '29'],
  ]),
  invisible: new Map([
    ...IIDX_SP_REVERSE.invisible,
    ['8', '41'],
    ['9', '42'],
    ['10', '43'],
    ['11', '44'],
    ['12', '45'],
    ['SC2', '46'],
    ['FZ2', '47'],
    ['13', '48'],
    ['14', '49'],
  ]),
  landmine: new Map([
    ...IIDX_SP_REVERSE.landmine,
    ['8', 'E1'],
    ['9', 'E2'],
    ['10', 'E3'],
    ['11', 'E4'],
    ['12', 'E5'],
    ['SC2', 'E6'],
    ['FZ2', 'E7'],
    ['13', 'E8'],
    ['14', 'E9'],
  ]),
  longNote: new Map([
    ...IIDX_SP_REVERSE.longNote,
    ['8', '61'],
    ['9', '62'],
    ['10', '63'],
    ['11', '64'],
    ['12', '65'],
    ['SC2', '66'],
    ['FZ2', '67'],
    ['13', '68'],
    ['14', '69'],
  ]),
};


/**
 * Computes the greatest common divisor
 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Rounds a fraction to the given resolution
 */
function quantizeFraction(fraction: number, resolution: number): number {
  return Math.round(fraction * resolution) / resolution;
}

/**
 * Computes the minimum resolution of the fractions (legacy — for notes without ticks)
 */
function findMinResolution(fractions: number[], maxResolution: number = 192): number {
  if (fractions.length === 0) return 1;

  // Convert all fractions to integers based on maxResolution
  const integers = fractions.map((f) => Math.round(f * maxResolution));

  // Compute the GCD
  let divisor = maxResolution;
  for (const n of integers) {
    if (n > 0) {
      divisor = gcd(divisor, n);
    }
  }

  return maxResolution / divisor;
}

/** Memo for smallestDenominator (fractions repeat a lot within a chart). */
const denominatorCache = new Map<number, number | null>();

/** Smallest denominator (<= 9999) that represents `f` exactly, or null. */
function smallestDenominator(f: number): number | null {
  const cached = denominatorCache.get(f);
  if (cached !== undefined) return cached;
  let result: number | null = null;
  for (let d = 1; d <= 9999; d++) {
    const n = f * d;
    if (Math.abs(n - Math.round(n)) < 1e-7) {
      result = d;
      break;
    }
  }
  if (denominatorCache.size > 50000) denominatorCache.clear();
  denominatorCache.set(f, result);
  return result;
}

/**
 * Line resolution that reproduces every source fraction exactly (lcm of the
 * per-fraction denominators), or null when it would exceed `max` slots.
 */
function findExactResolution(fractions: number[], max = 9999): number | null {
  let res = 1;
  for (const f of fractions) {
    const d = smallestDenominator(f);
    if (d === null) return null;
    res = (res * d) / gcd(res, d);
    if (res > max) return null;
  }
  return res;
}

/**
 * Minimum line resolution that places every tick offset exactly, computed from the
 * real length of the measure: resolution = ticksInMeasure / gcd(ticksInMeasure, ...offsets).
 * e.g. 4/4 (3840 ticks), 64th-note triplet (10 ticks) -> 3840 / 10 = 384 slots;
 *      3/4 (2880 ticks), triplets every 320 ticks -> 2880 / 320 = 9 slots.
 */
function findMinResolutionFromTicks(ticks: number[], ticksInMeasure: number): number {
  if (ticks.length === 0) return 1;
  const total = Math.max(1, Math.round(ticksInMeasure));
  let divisor = total;
  for (const t of ticks) {
    const s = Math.round(t);
    if (s > 0) divisor = gcd(divisor, s);
  }
  return total / divisor;
}

/**
 * Event type — when a tick is present, it is used for tick-based resolution calculation
 */
type ChannelEvent = {
  fraction: number;
  value: string;
  /** Tick offset within the measure (only for notes with tick data) */
  tickOffset?: number;
  /** Total tick count of this measure (only for notes with tick data) */
  ticksInMeasure?: number;
  /**
   * Exact fraction from the source file for notes that were not moved in the
   * editor. Lets a measure be written back on its original line resolution
   * (e.g. 1000 slots) instead of the nearest 960-ticks-per-beat position.
   */
  sourceFraction?: number;
};

/**
 * Line resolution of a measure/channel and the slot of every event in it.
 * Shared by collision detection and line generation so both agree exactly.
 */
function layoutEvents(
  events: ChannelEvent[],
  resolution: number
): { resolution: number; slots: number[] } {
  // Untouched measures: write back on the source file's own line resolution so
  // positions round-trip bit-exactly even when they are not on the tick grid.
  const sourceFractions = events.every((e) => e.sourceFraction !== undefined)
    ? events.map((e) => e.sourceFraction!)
    : null;
  const exactRes = sourceFractions ? findExactResolution(sourceFractions) : null;
  if (exactRes !== null) {
    return {
      resolution: exactRes,
      slots: events.map((e) => Math.round(e.sourceFraction! * exactRes)),
    };
  }

  // If all events have tick data, compute the tick-based minimum resolution (lossless)
  const allTicks =
    events.length > 0 &&
    events.every((e) => e.tickOffset !== undefined && e.ticksInMeasure !== undefined) &&
    events[0].ticksInMeasure! > 0;
  const minRes = allTicks
    ? findMinResolutionFromTicks(events.map((e) => e.tickOffset!), events[0].ticksInMeasure!)
    : findMinResolution(events.map((e) => e.fraction), resolution); // legacy: fraction-based (max 192)

  const slots = events.map((event) =>
    event.tickOffset !== undefined && event.ticksInMeasure !== undefined && event.ticksInMeasure > 0
      ? Math.round((event.tickOffset / event.ticksInMeasure) * minRes) // tick-based (exact)
      : Math.round(event.fraction * minRes)
  );
  return { resolution: minRes, slots };
}

/**
 * Creates channel data for a measure
 */
function createChannelDataForMeasure(
  measure: number,
  channel: string,
  events: ChannelEvent[],
  resolution: number,
  onCollision?: () => void
): ChannelData | null {
  if (events.length === 0) return null;

  const layout = layoutEvents(events, resolution);

  // Create the data array (each slot is 2 characters)
  const dataArray: string[] = new Array(layout.resolution).fill('00');
  events.forEach((event, i) => {
    const slot = layout.slots[i];
    if (slot < layout.resolution) {
      if (onCollision && dataArray[slot] !== '00' && event.value !== '00') onCollision();
      dataArray[slot] = event.value;
    }
  });

  // Return null if every value is 00
  if (dataArray.every((v) => v === '00')) {
    return null;
  }

  return {
    channel,
    measure,
    data: dataArray.join(''),
  };
}

/**
 * Splits events that overlap in the same slot into multiple layers
 * Used so that keysounds playing simultaneously on the BGM channel (01)
 * are each written on a separate #xxx01: line
 */
function splitOverlappingEvents(
  events: ChannelEvent[],
  resolution: number
): Array<ChannelEvent[]> {
  if (events.length === 0) return [];

  // Group events by slot
  const slotMap = new Map<number, ChannelEvent[]>();
  for (const event of events) {
    let slot: number;
    if (event.tickOffset !== undefined && event.ticksInMeasure !== undefined && event.ticksInMeasure > 0) {
      // Tick-based temporary slot (for collision detection, based on max 3840)
      slot = Math.round((event.tickOffset / event.ticksInMeasure) * 3840);
    } else {
      slot = Math.round(quantizeFraction(event.fraction, resolution) * resolution);
    }
    if (!slotMap.has(slot)) {
      slotMap.set(slot, []);
    }
    slotMap.get(slot)!.push(event);
  }

  // Return a single layer if there is no overlap
  let maxOverlap = 0;
  for (const group of slotMap.values()) {
    if (group.length > maxOverlap) maxOverlap = group.length;
  }
  if (maxOverlap <= 1) return [events];

  // Distribute across layers: place the nth event of each slot in the nth layer
  const layers: Array<ChannelEvent[]> = [];
  for (const group of slotMap.values()) {
    for (let i = 0; i < group.length; i++) {
      if (!layers[i]) layers[i] = [];
      layers[i].push(group[i]);
    }
  }

  return layers;
}

/**
 * Gets the channel mapping for a note type
 */
function getChannelMap(
  noteType: NoteType | undefined,
  hasEndBeat: boolean,
  mapping: ReverseChannelMapping
): Map<string, string> {
  if (noteType === 'invisible') {
    return mapping.invisible;
  }
  if (noteType === 'landmine') {
    return mapping.landmine;
  }
  if (hasEndBeat) {
    return mapping.longNote;
  }
  return mapping.playable;
}

/**
 * Determines the channel number of a note
 */
function getNoteChannel(
  note: EditableBMSNote,
  mapping: ReverseChannelMapping,
  lnMode: 'channel' | 'lnobj' = 'channel'
): string | null {
  // BGM notes
  if (note.noteType === 'bgm' || !note.column) {
    return '01';
  }

  // Only playable notes can be long notes; end data on invisible/landmine notes is ignored.
  const isLN = isLongNote(note);
  // In LNOBJ mode, LNs also use playable channels (1x/2x instead of 5x/6x)
  const channelMap = lnMode === 'lnobj' && isLN
    ? mapping.playable
    : getChannelMap(note.noteType, isLN, mapping);

  return channelMap.get(note.column) || null;
}

/** Two-character object value; #BASE 62 IDs are case-sensitive and keep their case. */
function toValue(key: string, base62 = false): string {
  return canonicalObjectId(key, base62).padStart(2, '0').slice(0, 2);
}

/**
 * Note-channel event with the bookkeeping needed to resolve slot collisions.
 */
interface NoteEvent extends ChannelEvent {
  measure: number;
  channel: string;
  /** note: a single object; layer: an additional keysound; lnStart/lnEnd: the two halves of a long note */
  kind: 'note' | 'layer' | 'lnStart' | 'lnEnd';
  /** Keysound to emit on the BGM channel if this object has to be rerouted */
  keysound: string;
  landmine: boolean;
  /** Absolute tick (used to shorten long-note ends) */
  absTick?: number;
  /** The other half of a long note */
  partner?: NoteEvent;
  removed: boolean;
}

/** Position of a note start (or LN end) on the output grid; null = outside measures 000-999 */
function locateNote(
  tick: number | undefined,
  measure: number | undefined,
  fraction: number | undefined,
  beat: number | undefined,
  table: MeasureTable,
  resolution: number
): Omit<ChannelEvent, 'value'> & { measure: number; absTick: number } | null {
  if (tick !== undefined) {
    const pos = table.locateTick(tick);
    if (!pos) return null;
    // A note still sitting where the parser put it keeps its exact fraction.
    const unmoved = measure === pos.measure
      && typeof fraction === 'number'
      && Math.abs(fraction - pos.fraction) < 1 / 3840;
    return {
      measure: pos.measure,
      fraction: pos.fraction,
      tickOffset: pos.tickOffset,
      ticksInMeasure: pos.ticksInMeasure,
      sourceFraction: unmoved ? fraction : undefined,
      absTick: tick,
    };
  }
  // Legacy path (no tick data)
  let m: number;
  let f: number;
  if (measure !== undefined && fraction !== undefined) {
    m = measure;
    f = fraction;
  } else if (beat !== undefined) {
    const pos = table.locateBeat(beat);
    if (!pos) return null;
    m = pos.measure;
    f = pos.fraction;
  } else {
    return null;
  }
  if (!isMeasureInRange(m)) return null;
  return {
    measure: m,
    fraction: quantizeFraction(f, resolution),
    absTick: table.measureStart(m) + Math.round(f * table.ticksIn(m)),
  };
}

/**
 * Moves a long-note end back by 1/192 of its measure so it no longer shares a slot
 * with the next note in the lane. Returns false when the LN is too short for that.
 */
function shortenLnEnd(end: NoteEvent, table: MeasureTable): boolean {
  const start = end.partner;
  if (!start || end.absTick === undefined || start.absTick === undefined) return false;
  const step = Math.max(1, Math.round(table.ticksIn(end.measure) / 192));
  const newTick = end.absTick - step;
  if (newTick <= start.absTick) return false;
  const pos = table.locateTick(newTick);
  if (!pos) return false;
  end.absTick = newTick;
  end.measure = pos.measure;
  end.fraction = pos.fraction;
  end.tickOffset = pos.tickOffset;
  end.ticksInMeasure = pos.ticksInMeasure;
  end.sourceFraction = undefined;
  return true;
}

/**
 * Takes an object out of its (occupied) slot. Its keysound is kept on the BGM
 * channel 01; a long note is rerouted as a whole (start keysound to BGM, end
 * dropped) so the remaining long notes in the lane keep their start/end pairing.
 */
function evictEvent(event: NoteEvent, warnings: WriterWarnings): void {
  const start = event.kind === 'lnEnd' && event.partner ? event.partner : event;
  const end = start.kind === 'lnStart' ? start.partner : undefined;
  if (end) end.removed = true;
  if (start.landmine) {
    start.removed = true;
    warnings.add('slot-collision-dropped');
    return;
  }
  start.channel = '01';
  start.kind = 'note';
  start.partner = undefined;
  // start.value already holds the keysound value (written by writeNoteChannels)
  warnings.add('slot-collision-rerouted');
}

/**
 * Resolves objects sharing a slot on a non-BGM channel (a BMS slot holds one
 * object, so the extra one used to be silently overwritten):
 * - an LN end colliding with another note's start in the lane is shortened by 1/192 measure;
 * - any other extra object is rerouted to the BGM channel (keysound kept).
 * Nothing changes when there are no collisions.
 */
function resolveSlotCollisions(
  events: NoteEvent[],
  table: MeasureTable,
  resolution: number,
  warnings: WriterWarnings
): void {
  for (let iteration = 0; iteration < 64; iteration++) {
    let changed = false;
    const groups = new Map<string, NoteEvent[]>();
    for (const e of events) {
      if (e.removed || e.channel === '01') continue;
      const key = `${e.measure}:${e.channel}`;
      const group = groups.get(key);
      if (group) group.push(e);
      else groups.set(key, [e]);
    }

    for (const [key, group] of groups) {
      const channel = key.slice(key.indexOf(':') + 1);
      const layout = layoutEvents(group, resolution);
      const holders = new Map<number, NoteEvent>();
      const occupies = (e: NoteEvent) => !e.removed && e.channel === channel;
      group.forEach((e, i) => {
        if (!occupies(e) || e.value === '00') return;
        const slot = layout.slots[i];
        const holder = holders.get(slot);
        if (!holder || !occupies(holder)) {
          holders.set(slot, e);
          return;
        }
        changed = true;
        // LN end vs. another note's start in the same lane: shorten the end.
        const lnEnd = e.kind === 'lnEnd' && holder.kind !== 'lnEnd'
          ? e
          : holder.kind === 'lnEnd' && e.kind !== 'lnEnd' && holder.partner !== e
            ? holder
            : null;
        if (lnEnd && shortenLnEnd(lnEnd, table)) {
          warnings.add('ln-end-shortened');
          if (lnEnd === holder) holders.set(slot, e);
          return;
        }
        evictEvent(e, warnings);
      });
    }
    if (!changed) return;
  }
}

/**
 * Converts notes into channel data
 */
export function writeNoteChannels(
  notes: EditableBMSNote[],
  mapping: ReverseChannelMapping = IIDX_SP_REVERSE,
  options: BMSWriterOptions = {},
  timeSignatures: Map<number, number> = new Map(),
  warnings: WriterWarnings = new WriterWarnings()
): ChannelData[] {
  const resolution = options.resolution || 192;
  const lnMode = options.lnMode || 'channel';
  const lnObjValue = options.lnObjValue || '';
  const base62 = options.base62 ?? false;
  const channelDataList: ChannelData[] = [];
  const table = new MeasureTable(timeSignatures);

  // 1. Build every event (in note order — the order decides layering on channel 01)
  const events: NoteEvent[] = [];

  for (const note of notes) {
    const channel = getNoteChannel(note, mapping, lnMode);
    if (!channel) {
      warnings.add('unmapped-lane');
      continue;
    }

    // Prefer tick-based position (no floating point error) when tick is available
    const pos = locateNote(note.tick, note.measure, note.fraction, note.beat, table, resolution);
    if (!pos) {
      warnings.add('out-of-range');
      continue;
    }

    // Long-note end (playable notes only)
    let endEvent: NoteEvent | undefined;
    if (isLongNote(note) && note.column) {
      // endMeasure/endFraction only feed the "unmoved" check of tick data; without
      // an end tick the end is derived from endBeat (as before).
      const end = note.endTick !== undefined
        ? locateNote(note.endTick, note.endMeasure, note.endFraction, undefined, table, resolution)
        : locateNote(undefined, undefined, undefined, note.endBeat, table, resolution);
      if (!end) {
        // Skip the whole long note: a lone start would flip every later LN in the lane.
        warnings.add('out-of-range');
        continue;
      }
      let endChannel: string | undefined;
      let endValue: string;
      if (lnMode === 'lnobj' && lnObjValue) {
        // LNOBJ mode: write the LNOBJ marker at the end position on the playable channel
        endChannel = mapping.playable.get(note.column);
        endValue = toValue(lnObjValue, base62);
      } else {
        // Channel mode: add the end event on the 5x/6x channel
        endChannel = mapping.longNote.get(note.column);
        endValue = toValue(note.keysound, base62);
      }
      if (endChannel) {
        endEvent = {
          ...end,
          channel: endChannel,
          value: endValue,
          kind: 'lnEnd',
          keysound: note.keysound,
          landmine: false,
          removed: false,
        };
      }
    }

    const startEvent: NoteEvent = {
      ...pos,
      channel,
      value: toValue(note.keysound, base62),
      kind: endEvent ? 'lnStart' : 'note',
      keysound: note.keysound,
      landmine: note.noteType === 'landmine' && channel !== '01',
      removed: false,
    };
    events.push(startEvent);

    // Emit multi-keysound layers (additionalKeysounds)
    if (note.additionalKeysounds && note.additionalKeysounds.length > 0) {
      for (const layer of note.additionalKeysounds) {
        let layerChannel: string | null = null;
        if (layer.type === 'bgm') {
          layerChannel = '01';
        } else if (layer.type === 'invisible' && note.column) {
          layerChannel = mapping.invisible.get(note.column) || null;
        }
        if (!layerChannel) continue;
        events.push({
          measure: pos.measure,
          fraction: pos.fraction,
          tickOffset: pos.tickOffset,
          ticksInMeasure: pos.ticksInMeasure,
          absTick: pos.absTick,
          channel: layerChannel,
          value: toValue(layer.keysound, base62),
          kind: 'layer',
          keysound: layer.keysound,
          landmine: false,
          removed: false,
        });
      }
    }

    if (endEvent) {
      startEvent.partner = endEvent;
      endEvent.partner = startEvent;
      events.push(endEvent);
    }
  }

  // 2. One object per slot on non-BGM channels
  resolveSlotCollisions(events, table, resolution, warnings);

  // 3. Group by measure and channel
  const measureChannelMap = new Map<number, Map<string, ChannelEvent[]>>();
  for (const e of events) {
    if (e.removed) continue;
    let channelMap = measureChannelMap.get(e.measure);
    if (!channelMap) {
      channelMap = new Map();
      measureChannelMap.set(e.measure, channelMap);
    }
    let list = channelMap.get(e.channel);
    if (!list) {
      list = [];
      channelMap.set(e.channel, list);
    }
    list.push(e);
  }

  // 4. Generate channel data
  const onCollision = () => warnings.add('slot-collision-dropped');
  for (const [measure, channelMap] of measureChannelMap) {
    for (const [channel, channelEvents] of channelMap) {
      // On the BGM channel (01), multiple events can overlap in the same slot,
      // so they must be split into layers to produce multiple #xxx01: lines
      if (channel === '01') {
        const layers = splitOverlappingEvents(channelEvents, resolution);
        for (const layerEvents of layers) {
          const channelData = createChannelDataForMeasure(measure, channel, layerEvents, resolution);
          if (channelData) channelDataList.push(channelData);
        }
      } else {
        const channelData = createChannelDataForMeasure(measure, channel, channelEvents, resolution, onCollision);
        if (channelData) channelDataList.push(channelData);
      }
    }
  }

  // Sort: measure number -> channel number
  channelDataList.sort((a, b) => {
    if (a.measure !== b.measure) return a.measure - b.measure;
    return a.channel.localeCompare(b.channel);
  });

  return channelDataList;
}

// ──────────────────────────────────────────────────────────────────────────────
// BPM / STOP definition keys
// ──────────────────────────────────────────────────────────────────────────────

/** NaN-safe equality for definition values */
function sameDefValue(a: number | undefined, b: number): boolean {
  return a !== undefined && (a === b || Object.is(a, b));
}

/**
 * Hands out `#BPMxx` / `#STOPxx` keys for a definition table. Works on a copy of
 * the caller's map, which is only made when a new key actually has to be added.
 */
class DefinitionKeys {
  private defs: Map<string, number>;
  private copied = false;
  /** upper-case key -> key as stored in defs */
  private readonly keyIndex = new Map<string, string>();
  /** value -> first key (in definition order) with that value */
  private readonly valueIndex = new Map<number, string>();
  private nextCandidate = 1;

  constructor(defs: Map<string, number> | undefined, private readonly base62 = false) {
    this.defs = defs ?? new Map();
    for (const [key, value] of this.defs) this.index(key, value);
  }

  private index(key: string, value: number): void {
    const upper = canonicalObjectId(key, this.base62);
    if (!this.keyIndex.has(upper)) this.keyIndex.set(upper, key);
    if (!this.valueIndex.has(value)) this.valueIndex.set(value, upper);
  }

  /** True when the event's own key still defines exactly `value` */
  ownKeyMatches(ownKey: string | undefined, value: number): boolean {
    if (!ownKey) return false;
    const stored = this.keyIndex.get(canonicalObjectId(ownKey, this.base62));
    return stored !== undefined && sameDefValue(this.defs.get(stored), value);
  }

  get map(): Map<string, number> {
    return this.defs;
  }

  /**
   * Key whose definition equals `value`: the event's own key if it still matches,
   * otherwise any existing key with that exact value, otherwise a newly allocated
   * one ('01'..'ZZ'). Null when every key is taken.
   */
  resolve(ownKey: string | undefined, value: number): string | null {
    if (ownKey && this.ownKeyMatches(ownKey, value)) return ownKey;
    const byValue = this.valueIndex.get(value);
    if (byValue !== undefined) return byValue;

    for (; this.nextCandidate <= 1295; this.nextCandidate++) {
      const key = this.nextCandidate.toString(36).toUpperCase().padStart(2, '0');
      if (this.keyIndex.has(key)) continue;
      if (!this.copied) {
        this.defs = new Map(this.defs);
        this.copied = true;
      }
      this.defs.set(key, value);
      this.index(key, value);
      this.nextCandidate++;
      return key;
    }
    return null;
  }
}

/**
 * BPM / STOP events resolved against the definition tables, plus the tables to
 * write in the header (copies when keys had to be added; the chart is not mutated).
 */
export interface ResolvedTimingDefinitions {
  bpmChanges: BMSBpmChange[];
  stopEvents: BMSStopEvent[];
  bpmDef: Map<string, number>;
  stopDef: Map<string, number>;
}

/**
 * Makes every BPM / STOP event writable without loss:
 * - an integer BPM in 1..255 that is not extended goes to channel 03 (as before);
 * - every other BPM goes to channel 08 with a `#BPMxx` key whose value equals the
 *   event's BPM (an edited extended BPM no longer keeps a stale key);
 * - every STOP goes through a `#STOPxx` key whose value equals its duration
 *   (channel 09 references keys, it cannot carry a raw duration).
 * Untouched events keep their own keys, so unedited charts are written unchanged.
 */
export function resolveTimingDefinitions(
  chart: Pick<EditableBMSChart, 'headers' | 'bpmChanges' | 'stopEvents'>,
  warnings: WriterWarnings = new WriterWarnings()
): ResolvedTimingDefinitions {
  const base62 = isBase62Headers(chart.headers);
  const bpmKeys = new DefinitionKeys(chart.headers.bpmDef, base62);
  const stopKeys = new DefinitionKeys(chart.headers.stopDef, base62);

  const bpmChanges: BMSBpmChange[] = [];
  for (const change of chart.bpmChanges) {
    const direct = !change.extended
      && Number.isInteger(change.bpm) && change.bpm >= 1 && change.bpm <= 255;
    if (direct) {
      bpmChanges.push({ ...change });
      continue;
    }
    // A non-numeric value is only kept when it still comes from its own (unedited) definition.
    if (!Number.isFinite(change.bpm) && !bpmKeys.ownKeyMatches(change.bpmDefKey, change.bpm)) {
      warnings.add('invalid-value');
      continue;
    }
    const key = bpmKeys.resolve(change.bpmDefKey, change.bpm);
    if (key === null) {
      warnings.add('definition-keys-exhausted');
      bpmChanges.push({ ...change, extended: false, bpmDefKey: undefined });
      continue;
    }
    bpmChanges.push({ ...change, extended: true, bpmDefKey: key });
  }

  const stopEvents: BMSStopEvent[] = [];
  for (const stop of chart.stopEvents) {
    if (!Number.isFinite(stop.duration) && !stopKeys.ownKeyMatches(stop.stopDefKey, stop.duration)) {
      warnings.add('invalid-value');
      continue;
    }
    const key = stopKeys.resolve(stop.stopDefKey, stop.duration);
    if (key === null) {
      warnings.add('definition-keys-exhausted');
      continue;
    }
    stopEvents.push({ ...stop, stopDefKey: key });
  }

  return { bpmChanges, stopEvents, bpmDef: bpmKeys.map, stopDef: stopKeys.map };
}

/**
 * Converts BPM change events into channel data
 */
export function writeBpmChannels(
  bpmChanges: BMSBpmChange[],
  options: BMSWriterOptions = {},
  warnings: WriterWarnings = new WriterWarnings()
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // Group by measure (channel 03: direct BPM, channel 08: extended BPM)
  const measureMap03 = new Map<number, Array<{ fraction: number; value: string }>>();
  const measureMap08 = new Map<number, Array<{ fraction: number; value: string }>>();

  for (const bpmChange of bpmChanges) {
    if (!isMeasureInRange(bpmChange.measure)) {
      warnings.add('out-of-range');
      continue;
    }
    const quantizedFraction = quantizeFraction(bpmChange.fraction, resolution);

    if (bpmChange.extended && bpmChange.bpmDefKey) {
      // Extended BPM (channel 08)
      if (!measureMap08.has(bpmChange.measure)) {
        measureMap08.set(bpmChange.measure, []);
      }
      measureMap08.get(bpmChange.measure)!.push({
        fraction: quantizedFraction,
        value: toValue(bpmChange.bpmDefKey, options.base62),
      });
    } else {
      // Direct BPM (channel 03) - integers only, range 1-255.
      // (BMSWriter.write routes every other value to channel 08 beforehand.)
      const bpmInt = Math.min(255, Math.max(1, Math.round(bpmChange.bpm)));
      if (!measureMap03.has(bpmChange.measure)) {
        measureMap03.set(bpmChange.measure, []);
      }
      measureMap03.get(bpmChange.measure)!.push({
        fraction: quantizedFraction,
        value: bpmInt.toString(16).toUpperCase().padStart(2, '0'),
      });
    }
  }

  // Generate channel 03 data
  for (const [measure, events] of measureMap03) {
    const channelData = createChannelDataForMeasure(measure, '03', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  // Generate channel 08 data
  for (const [measure, events] of measureMap08) {
    const channelData = createChannelDataForMeasure(measure, '08', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  return channelDataList;
}

/**
 * Converts STOP events into channel data
 */
export function writeStopChannels(
  stopEvents: BMSStopEvent[],
  options: BMSWriterOptions = {},
  warnings: WriterWarnings = new WriterWarnings()
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // Group by measure
  const measureMap = new Map<number, Array<{ fraction: number; value: string }>>();

  for (const stopEvent of stopEvents) {
    if (!isMeasureInRange(stopEvent.measure)) {
      warnings.add('out-of-range');
      continue;
    }
    const quantizedFraction = quantizeFraction(stopEvent.fraction, resolution);

    if (!measureMap.has(stopEvent.measure)) {
      measureMap.set(stopEvent.measure, []);
    }

    // Channel 09 references #STOPxx keys (BMSWriter.write assigns one to every STOP);
    // the raw-value fallback is only reached when this function is called directly.
    const value = stopEvent.stopDefKey
      ? toValue(stopEvent.stopDefKey, options.base62)
      : Math.min(255, Math.max(1, Math.round(stopEvent.duration))).toString(16).toUpperCase().padStart(2, '0');

    measureMap.get(stopEvent.measure)!.push({
      fraction: quantizedFraction,
      value,
    });
  }

  // Generate channel 09 data
  for (const [measure, events] of measureMap) {
    const channelData = createChannelDataForMeasure(measure, '09', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  return channelDataList;
}

/**
 * Converts BGA events into channel data
 */
export function writeBgaChannels(
  bgaEvents: BMSBgaEvent[],
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // Group by measure and layer
  const measureLayerMap = new Map<number, Map<string, Array<{ fraction: number; value: string }>>>();

  for (const bgaEvent of bgaEvents) {
    const quantizedFraction = quantizeFraction(bgaEvent.fraction, resolution);

    if (!measureLayerMap.has(bgaEvent.measure)) {
      measureLayerMap.set(bgaEvent.measure, new Map());
    }
    const layerMap = measureLayerMap.get(bgaEvent.measure)!;

    if (!layerMap.has(bgaEvent.layer)) {
      layerMap.set(bgaEvent.layer, []);
    }
    layerMap.get(bgaEvent.layer)!.push({
      fraction: quantizedFraction,
      value: toValue(bgaEvent.bmpKey, options.base62),
    });
  }

  // Generate channel data
  for (const [measure, layerMap] of measureLayerMap) {
    for (const [layer, events] of layerMap) {
      const channelData = createChannelDataForMeasure(measure, layer, events, resolution);
      if (channelData) channelDataList.push(channelData);
    }
  }

  return channelDataList;
}

/**
 * Writes objects on channels the editor does not model back verbatim. Each
 * measure/channel keeps the exact line resolution of its source positions;
 * objects that share a slot (e.g. several `#xxx99` lines) go on separate lines.
 */
export function writeExtraChannels(
  extraObjects: BMSExtraObject[],
  options: BMSWriterOptions = {},
  warnings: WriterWarnings = new WriterWarnings()
): ChannelData[] {
  const resolution = options.resolution || 192;
  const groups = new Map<string, BMSExtraObject[]>();
  for (const obj of extraObjects) {
    if (!isMeasureInRange(obj.measure)) {
      warnings.add('out-of-range');
      continue;
    }
    const key = `${obj.measure}:${obj.channel}`;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(obj);
  }

  const channelDataList: ChannelData[] = [];
  for (const list of groups.values()) {
    const { measure, channel } = list[0];
    const fractions = list.map((o) => o.fraction);
    const res = findExactResolution(fractions) ?? resolution;
    // One line per "layer": the nth object of each slot goes on the nth line.
    const layers: ChannelEvent[][] = [];
    const used = new Map<number, number>();
    for (const obj of list) {
      const slot = Math.round(obj.fraction * res);
      const layer = used.get(slot) ?? 0;
      used.set(slot, layer + 1);
      (layers[layer] ??= []).push({ fraction: obj.fraction, value: obj.value, sourceFraction: obj.fraction });
    }
    for (const events of layers) {
      const data = createChannelDataForMeasure(measure, channel, events, res);
      if (data) channelDataList.push(data);
    }
  }
  return channelDataList;
}

/**
 * Converts time signatures into channel data (channel 02)
 */
export function writeTimeSignatureChannels(
  timeSignatures: Map<number, number>,
  _options: BMSWriterOptions = {}
): ChannelData[] {
  const channelDataList: ChannelData[] = [];

  for (const [measure, size] of timeSignatures) {
    // Only write time signatures other than 1.0
    if (size !== 1.0) {
      channelDataList.push({
        channel: '02',
        measure,
        data: size.toString(),
      });
    }
  }

  return channelDataList;
}

/**
 * Converts channel data into a BMS string
 */
export function channelDataToString(channelData: ChannelData): string {
  const measureStr = channelData.measure.toString().padStart(3, '0');
  return `#${measureStr}${channelData.channel}:${channelData.data}`;
}

/**
 * Converts an array of channel data into an array of BMS strings.
 *
 * BPM / STOP events are written as given: `BMSWriter.write` first runs
 * `resolveTimingDefinitions` so every event has a valid channel and key, and
 * writes the resulting definition tables in the header.
 */
export function writeChannels(
  chart: EditableBMSChart,
  mapping: ReverseChannelMapping = IIDX_SP_REVERSE,
  options: BMSWriterOptions = {},
  warnings: WriterWarnings = new WriterWarnings()
): string[] {
  const lines: string[] = [];

  // Add comments
  if (options.includeComments) {
    lines.push('');
    lines.push('*---------------------- MAIN DATA FIELD');
    lines.push('');
  }

  // Collect all channel data
  const allChannelData: ChannelData[] = [];

  // Time signatures
  allChannelData.push(...writeTimeSignatureChannels(chart.timeSignatures, options));

  // BPM changes
  allChannelData.push(...writeBpmChannels(chart.bpmChanges, options, warnings));

  // STOP events
  allChannelData.push(...writeStopChannels(chart.stopEvents, options, warnings));

  // BGA events
  const bgaEvents = chart.bgaEvents.filter((e) => isMeasureInRange(e.measure));
  warnings.add('out-of-range', chart.bgaEvents.length - bgaEvents.length);
  allChannelData.push(...writeBgaChannels(bgaEvents, options));

  // Notes
  allChannelData.push(...writeNoteChannels(chart.notes, mapping, options, chart.timeSignatures, warnings));

  // Channels the editor does not model (TEXT, JUDGE, extension lanes, ...)
  if (chart.extraObjects && chart.extraObjects.length > 0) {
    allChannelData.push(...writeExtraChannels(chart.extraObjects, options, warnings));
  }

  // Sort: measure number -> channel number
  allChannelData.sort((a, b) => {
    if (a.measure !== b.measure) return a.measure - b.measure;
    return a.channel.localeCompare(b.channel);
  });

  // Handle empty measures (depending on options)
  let lastMeasure = -1;
  for (const data of allChannelData) {
    // Add a blank line when the measure changes
    if (data.measure !== lastMeasure && lastMeasure !== -1 && options.includeComments) {
      lines.push('');
    }
    lastMeasure = data.measure;

    lines.push(channelDataToString(data));
  }

  return lines;
}
