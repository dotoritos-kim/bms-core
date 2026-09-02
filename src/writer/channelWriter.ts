/**
 * BMS Channel Writer
 * Converts note data into BMS channel strings
 */

import type {
  EditableBMSChart,
  EditableBMSNote,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  ChannelData,
  ReverseChannelMapping,
  BMSWriterOptions,
} from './types';
import type { NoteType } from '../parser';

/**
 * Converts a beat into a measure and fraction (taking time signatures into account)
 */
function beatToMeasureFraction(
  beat: number,
  timeSignatures: Map<number, number>
): { measure: number; fraction: number } {
  let currentBeat = 0;
  let measure = 0;

  for (;;) {
    const size = timeSignatures.get(measure) ?? 1.0;
    const beatsInMeasure = 4 * size;

    if (currentBeat + beatsInMeasure > beat + 1e-9) {
      const fraction = (beat - currentBeat) / beatsInMeasure;
      return { measure, fraction: Math.max(0, Math.min(fraction, 1 - 1e-9)) };
    }

    currentBeat += beatsInMeasure;
    measure++;
    if (measure > 10000) break;
  }

  return { measure, fraction: 0 };
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

/** 1 beat = 960 ticks (MIDI standard) */
const TICKS_PER_BEAT = 960;

/**
 * Total tick count from measure 0 up to (but not including) targetMeasure
 * (needed for the inverse calculation of tickToFractionInMeasure)
 */
function getTotalTicksUpToMeasure(
  targetMeasure: number,
  timeSignatures: Map<number, number>,
): number {
  let total = 0;
  for (let m = 0; m < targetMeasure; m++) {
    const size = timeSignatures.get(m) ?? 1.0;
    total += Math.round(4 * size * TICKS_PER_BEAT);
  }
  return total;
}

/**
 * Tick-based fraction calculation (no floating point error)
 * For notes that have a tick, this function computes the fraction directly
 */
function tickToFractionInMeasure(
  tick: number,
  timeSignatures: Map<number, number>
): { measure: number; fraction: number; ticksInMeasure: number } {
  let currentTick = 0;
  let measure = 0;
  for (;;) {
    const size = timeSignatures.get(measure) ?? 1.0;
    const ticksInMeasure = Math.round(4 * size * TICKS_PER_BEAT);
    if (ticksInMeasure <= 0) return { measure, fraction: 0, ticksInMeasure: 1 }; // guard against zero-size measures
    if (currentTick + ticksInMeasure > tick) {
      const fraction = (tick - currentTick) / ticksInMeasure;
      return { measure, fraction, ticksInMeasure };
    }
    currentTick += ticksInMeasure;
    measure++;
    if (measure > 9999) return { measure: 0, fraction: 0, ticksInMeasure: TICKS_PER_BEAT * 4 }; // safety
  }
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

/** Smallest denominator (<= max) that represents `f` exactly, or null. */
function smallestDenominator(f: number, max = 9999): number | null {
  for (let d = 1; d <= max; d++) {
    const n = f * d;
    if (Math.abs(n - Math.round(n)) < 1e-7) return d;
  }
  return null;
}

/**
 * Line resolution that reproduces every source fraction exactly (lcm of the
 * per-fraction denominators), or null when it would exceed `max` slots.
 */
function findExactResolution(fractions: number[], max = 9999): number | null {
  let res = 1;
  for (const f of fractions) {
    const d = smallestDenominator(f, max);
    if (d === null) return null;
    res = (res * d) / gcd(res, d);
    if (res > max) return null;
  }
  return res;
}

/**
 * Computes the minimum resolution needed for BMS output from an array of ticks
 * e.g. 64th-note triplet (10 ticks) -> 3840/gcd(3840,10) = 3840/10 = 384
 */
function findMinResolutionFromTicks(
  ticks: number[],
  ticksInMeasure: number,
  maxResolution: number = 3840,
): number {
  if (ticks.length === 0) return 1;
  const slots = ticks.map((t) => Math.round((t / ticksInMeasure) * maxResolution));
  let divisor = maxResolution;
  for (const s of slots) {
    if (s > 0) divisor = gcd(divisor, s);
  }
  return maxResolution / divisor;
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

  // In LNOBJ mode, LNs also use playable channels (1x/2x instead of 5x/6x)
  const usePlayableForLN = lnMode === 'lnobj' && !!note.endBeat;
  const channelMap = usePlayableForLN
    ? mapping.playable
    : getChannelMap(note.noteType, !!note.endBeat, mapping);

  return channelMap.get(note.column) || null;
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
 * Creates channel data for a measure
 */
function createChannelDataForMeasure(
  measure: number,
  channel: string,
  events: ChannelEvent[],
  resolution: number
): ChannelData | null {
  if (events.length === 0) return null;

  // Untouched measures: write back on the source file's own line resolution so
  // positions round-trip bit-exactly even when they are not on the tick grid.
  const sourceFractions = events.every((e) => e.sourceFraction !== undefined)
    ? events.map((e) => e.sourceFraction!)
    : null;
  const exactRes = sourceFractions ? findExactResolution(sourceFractions) : null;
  if (exactRes !== null) {
    const dataArray: string[] = new Array(exactRes).fill('00');
    for (const event of events) {
      const slot = Math.round(event.sourceFraction! * exactRes);
      if (slot < exactRes) dataArray[slot] = event.value;
    }
    if (dataArray.every((v) => v === '00')) return null;
    return { channel, measure, data: dataArray.join('') };
  }

  // If all events have tick data, compute the tick-based minimum resolution (lossless)
  const tickEvents = events.filter(
    (e) => e.tickOffset !== undefined && e.ticksInMeasure !== undefined
  );
  let minRes: number;
  if (tickEvents.length === events.length && tickEvents[0].ticksInMeasure! > 0) {
    const ticks = tickEvents.map((e) => e.tickOffset!);
    const ticksInMeasure = tickEvents[0].ticksInMeasure!;
    minRes = findMinResolutionFromTicks(ticks, ticksInMeasure);
  } else {
    // Legacy path: fraction-based (max 192)
    const fractions = events.map((e) => e.fraction);
    minRes = findMinResolution(fractions, resolution);
  }

  // Create the data array (each slot is 2 characters)
  const dataArray: string[] = new Array(minRes).fill('00');

  for (const event of events) {
    let slot: number;
    if (event.tickOffset !== undefined && event.ticksInMeasure !== undefined && event.ticksInMeasure > 0) {
      // Tick-based slot calculation (exact)
      slot = Math.round((event.tickOffset / event.ticksInMeasure) * minRes);
    } else {
      slot = Math.round(event.fraction * minRes);
    }
    if (slot < minRes) {
      dataArray[slot] = event.value;
    }
  }

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
 * Converts notes into channel data
 */
export function writeNoteChannels(
  notes: EditableBMSNote[],
  mapping: ReverseChannelMapping = IIDX_SP_REVERSE,
  options: BMSWriterOptions = {},
  timeSignatures: Map<number, number> = new Map()
): ChannelData[] {
  const resolution = options.resolution || 192;
  const lnMode = options.lnMode || 'channel';
  const lnObjValue = options.lnObjValue || '';
  const channelDataList: ChannelData[] = [];

  // Group notes by measure and channel
  const measureChannelMap = new Map<number, Map<string, ChannelEvent[]>>();

  for (const note of notes) {
    const channel = getNoteChannel(note, mapping, lnMode);
    if (!channel) continue;

    // Prefer tick-based position (no floating point error) when tick is available
    const tickPos = note.tick !== undefined
      ? tickToFractionInMeasure(note.tick, timeSignatures)
      : null;
    const noteMeasure = tickPos?.measure ?? note.measure;
    const noteFraction = tickPos?.fraction ?? note.fraction;
    // Legacy quantization (based on 192) when there is no tick data
    const quantizedFraction = tickPos ? noteFraction : quantizeFraction(noteFraction, resolution);

    // Additional tick-based event information
    const tickOffset = tickPos
      ? (note.tick! - getTotalTicksUpToMeasure(noteMeasure, timeSignatures))
      : undefined;
    const ticksInMeasureForNote = tickPos?.ticksInMeasure;

    // Get/create the measure map
    if (!measureChannelMap.has(noteMeasure)) {
      measureChannelMap.set(noteMeasure, new Map());
    }
    const channelMap = measureChannelMap.get(noteMeasure)!;

    // Get/create the channel event array
    if (!channelMap.has(channel)) {
      channelMap.set(channel, []);
    }
    const events = channelMap.get(channel)!;

    // A note still sitting where the parser put it keeps its exact fraction.
    const unmoved = tickPos !== null
      && note.measure === noteMeasure
      && typeof note.fraction === 'number'
      && Math.abs(note.fraction - tickPos.fraction) < 1 / 3840;

    // Add the note
    events.push({
      fraction: quantizedFraction,
      value: note.keysound.toUpperCase().padStart(2, '0').slice(0, 2),
      tickOffset,
      ticksInMeasure: ticksInMeasureForNote,
      sourceFraction: unmoved ? note.fraction : undefined,
    });

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

        if (!measureChannelMap.has(noteMeasure)) {
          measureChannelMap.set(noteMeasure, new Map());
        }
        const layerChannelMap = measureChannelMap.get(noteMeasure)!;
        if (!layerChannelMap.has(layerChannel)) {
          layerChannelMap.set(layerChannel, []);
        }
        layerChannelMap.get(layerChannel)!.push({
          fraction: quantizedFraction,
          value: layer.keysound.toUpperCase().padStart(2, '0').slice(0, 2),
          tickOffset,
          ticksInMeasure: ticksInMeasureForNote,
        });
      }
    }

    // Handle long note ends
    if (note.endBeat !== undefined && note.noteType !== 'landmine') {
      const endPos = note.endTick !== undefined
        ? tickToFractionInMeasure(note.endTick, timeSignatures)
        : beatToMeasureFraction(note.endBeat, timeSignatures);
      const endMeasure = endPos.measure;
      const endFraction = note.endTick !== undefined ? endPos.fraction : quantizeFraction(endPos.fraction, resolution);
      const endTickOffset = note.endTick !== undefined
        ? (note.endTick - getTotalTicksUpToMeasure(endMeasure, timeSignatures))
        : undefined;
      const endTicksInMeasure = note.endTick !== undefined ? (endPos as ReturnType<typeof tickToFractionInMeasure>).ticksInMeasure : undefined;
      const endUnmoved = note.endTick !== undefined
        && note.endMeasure === endMeasure
        && typeof note.endFraction === 'number'
        && Math.abs(note.endFraction - endPos.fraction) < 1 / 3840;
      const endSourceFraction = endUnmoved ? note.endFraction : undefined;

      if (lnMode === 'lnobj' && lnObjValue && note.column) {
        // LNOBJ mode: write the LNOBJ marker at the end position on the playable channel
        const playableChannel = mapping.playable.get(note.column);
        if (playableChannel) {
          if (!measureChannelMap.has(endMeasure)) {
            measureChannelMap.set(endMeasure, new Map());
          }
          const endChMap = measureChannelMap.get(endMeasure)!;
          if (!endChMap.has(playableChannel)) {
            endChMap.set(playableChannel, []);
          }
          endChMap.get(playableChannel)!.push({
            fraction: endFraction,
            value: lnObjValue.toUpperCase().padStart(2, '0').slice(0, 2),
            tickOffset: endTickOffset,
            ticksInMeasure: endTicksInMeasure,
            sourceFraction: endSourceFraction,
          });
        }
      } else {
        // Channel mode: add the end event on the 5x/6x channel
        const lnChannelMap = getChannelMap(note.noteType, true, mapping);
        const lnChannel = note.column ? lnChannelMap.get(note.column) : null;
        if (lnChannel) {
          if (!measureChannelMap.has(endMeasure)) {
            measureChannelMap.set(endMeasure, new Map());
          }
          const endChMap = measureChannelMap.get(endMeasure)!;
          if (!endChMap.has(lnChannel)) {
            endChMap.set(lnChannel, []);
          }
          endChMap.get(lnChannel)!.push({
            fraction: endFraction,
            value: note.keysound.toUpperCase().padStart(2, '0').slice(0, 2),
            tickOffset: endTickOffset,
            ticksInMeasure: endTicksInMeasure,
            sourceFraction: endSourceFraction,
          });
        }
      }
    }
  }

  // Generate channel data
  for (const [measure, channelMap] of measureChannelMap) {
    for (const [channel, events] of channelMap) {
      // On the BGM channel (01), multiple events can overlap in the same slot,
      // so they must be split into layers to produce multiple #xxx01: lines
      if (channel === '01') {
        const layers = splitOverlappingEvents(events, resolution);
        for (const layerEvents of layers) {
          const channelData = createChannelDataForMeasure(
            measure,
            channel,
            layerEvents,
            resolution
          );
          if (channelData) {
            channelDataList.push(channelData);
          }
        }
      } else {
        const channelData = createChannelDataForMeasure(
          measure,
          channel,
          events,
          resolution
        );
        if (channelData) {
          channelDataList.push(channelData);
        }
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

/**
 * Converts BPM change events into channel data
 */
export function writeBpmChannels(
  bpmChanges: BMSBpmChange[],
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // Group by measure (channel 03: direct BPM, channel 08: extended BPM)
  const measureMap03 = new Map<number, Array<{ fraction: number; value: string }>>();
  const measureMap08 = new Map<number, Array<{ fraction: number; value: string }>>();

  for (const bpmChange of bpmChanges) {
    const quantizedFraction = quantizeFraction(bpmChange.fraction, resolution);

    if (bpmChange.extended && bpmChange.bpmDefKey) {
      // Extended BPM (channel 08)
      if (!measureMap08.has(bpmChange.measure)) {
        measureMap08.set(bpmChange.measure, []);
      }
      measureMap08.get(bpmChange.measure)!.push({
        fraction: quantizedFraction,
        value: bpmChange.bpmDefKey.toUpperCase().padStart(2, '0'),
      });
    } else {
      // Direct BPM (channel 03) - integers only, range 1-255
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
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // Group by measure
  const measureMap = new Map<number, Array<{ fraction: number; value: string }>>();

  for (const stopEvent of stopEvents) {
    const quantizedFraction = quantizeFraction(stopEvent.fraction, resolution);

    if (!measureMap.has(stopEvent.measure)) {
      measureMap.set(stopEvent.measure, []);
    }

    const value = stopEvent.stopDefKey
      ? stopEvent.stopDefKey.toUpperCase().padStart(2, '0')
      : Math.min(255, Math.max(1, stopEvent.duration)).toString(16).toUpperCase().padStart(2, '0');

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
      value: bgaEvent.bmpKey.toUpperCase().padStart(2, '0'),
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
 * Converts an array of channel data into an array of BMS strings
 */
export function writeChannels(
  chart: EditableBMSChart,
  mapping: ReverseChannelMapping = IIDX_SP_REVERSE,
  options: BMSWriterOptions = {}
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
  allChannelData.push(...writeBpmChannels(chart.bpmChanges, options));

  // STOP events
  allChannelData.push(...writeStopChannels(chart.stopEvents, options));

  // BGA events
  allChannelData.push(...writeBgaChannels(chart.bgaEvents, options));

  // Notes
  allChannelData.push(...writeNoteChannels(chart.notes, mapping, options, chart.timeSignatures));

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
