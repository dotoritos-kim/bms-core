/**
 * EditableChartBuilder — converts BMSChart → EditableBMSChart
 *
 * REFACTOR-PLAN PR-5 / P2: extracts the internal logic of BMSWriter.fromBMSChart
 * into this builder. BMSWriter.fromBMSChart remains as a thin facade that
 * delegates to this builder.
 *
 * A channel-dispatch approach without a Visitor interface achieves the same separation.
 */

import { canonicalObjectId, isBase62Value } from '../utils/objectId';
import type {
  EditableBMSChart,
  EditableBMSNote,
  BMSHeaderData,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
} from './types';
import { parseHeadersToData, createEmptyHeaders } from './headerWriter';
import type { BMSChart } from '../parser/bms/chart';
import type { BMSObject } from '../parser/bms/objects';
import { detectStyle } from '../parser/strategies/styleStrategy';

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Channel normalization (5x→1x, 6x→2x, 3x→1x, 4x→2x, Dx→1x, Ex→2x)
 * — same as the parser's BMSNoteBuilder._normalizeChannel
 */
function normalizeChannel(ch: string): string {
  const first = ch.charAt(0).toUpperCase();
  switch (first) {
    case '3': case '5': case 'D': return '1' + ch.slice(1);
    case '4': case '6': case 'E': return '2' + ch.slice(1);
    default: return ch;
  }
}

/**
 * Converts a single BMSObject into an EditableBMSNote.
 * Returning null skips the object.
 */
function objectToNote(
  obj: BMSObject,
  id: number,
  chart: BMSChart,
  channelMapping: Readonly<Record<string, string>>
): EditableBMSNote | null {
  const channel = obj.channel.toUpperCase();
  const firstChar = channel.charAt(0);

  let noteType: 'playable' | 'invisible' | 'landmine' | 'bgm';
  if (channel === '01') {
    noteType = 'bgm';
  } else if (firstChar === 'D' || firstChar === 'E') {
    noteType = 'landmine';
  } else if (firstChar === '3' || firstChar === '4') {
    noteType = 'invisible';
  } else {
    noteType = 'playable';
  }

  let column: string | undefined;
  if (noteType !== 'bgm') {
    column = channelMapping[channel];
  }

  const beat = chart.measureToBeat(obj.measure, obj.fraction);
  const tick = Math.round(beat * 960);

  return {
    id: `note-${id}`,
    beat,
    tick,
    measure: obj.measure,
    fraction: obj.fraction,
    column,
    keysound: obj.value,
    noteType,
    channel: obj.channel,
  };
}

/**
 * Assigns sequential channel group numbers to BGM notes (editor only).
 */
function assignBgmChannels(notes: EditableBMSNote[]): void {
  const tickGroups = new Map<number, EditableBMSNote[]>();
  for (const note of notes) {
    if (note.noteType !== 'bgm') continue;
    const group = tickGroups.get(note.tick);
    if (group) {
      group.push(note);
    } else {
      tickGroups.set(note.tick, [note]);
    }
  }
  for (const group of tickGroups.values()) {
    for (let i = 0; i < group.length; i++) {
      group[i].bgmChannel = i;
    }
  }
}

/**
 * Merges invisible/bgm notes at the same beat+column into the playable note's
 * additionalKeysounds.
 */
function groupMultiKeysounds(notes: EditableBMSNote[]): EditableBMSNote[] {
  const playableMap = new Map<string, EditableBMSNote>();
  const consumed = new Set<string>();

  for (const note of notes) {
    if (note.noteType === 'playable' && note.column) {
      const key = `${note.beat.toFixed(6)}:${note.column}`;
      if (!playableMap.has(key)) {
        playableMap.set(key, note);
      }
    }
  }

  for (const note of notes) {
    if ((note.noteType === 'invisible' || note.noteType === 'bgm') && note.column) {
      const key = `${note.beat.toFixed(6)}:${note.column}`;
      const playable = playableMap.get(key);
      if (playable) {
        if (!playable.additionalKeysounds) {
          playable.additionalKeysounds = [];
        }
        playable.additionalKeysounds.push({
          keysound: note.keysound,
          type: note.noteType === 'invisible' ? 'invisible' : 'bgm',
        });
        consumed.add(note.id);
      }
    }
  }

  return notes.filter(n => !consumed.has(n.id));
}

// ──────────────────────────────────────────────────────────────────────────────
// EditableChartBuilder
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builder that converts a BMSChart into an EditableBMSChart.
 *
 * Usage:
 * ```ts
 * const editable = new EditableChartBuilder(chart).build();
 * ```
 */
export class EditableChartBuilder {
  private readonly chart: BMSChart;

  constructor(chart: BMSChart) {
    this.chart = chart;
  }

  build(): EditableBMSChart {
    const chart = this.chart;

    // Convert headers
    const headers: BMSHeaderData = parseHeadersToData(chart.headers);

    const notes: EditableBMSNote[] = [];
    const bpmChanges: BMSBpmChange[] = [];
    const stopEvents: BMSStopEvent[] = [];
    const bgaEvents: BMSBgaEvent[] = [];
    const timeSignatures = new Map<number, number>();

    // BPM / STOP definition maps
    // #BASE 62: object IDs are case-sensitive; base36 IDs compare case-insensitively.
    const base62 = isBase62Value(chart.headers.get('base'));
    const canon = (id: string) => canonicalObjectId(id, base62);
    const bpmMap = new Map<string, number>();
    headers.bpmDef.forEach((value, key) => bpmMap.set(canon(key), value));

    const stopMap = new Map<string, number>();
    headers.stopDef.forEach((value, key) => stopMap.set(canon(key), value));

    // Auto-detect channel mapping (using a Strategy)
    const objects = chart.objects.allSorted();
    const playerHeader = chart.headers.get('player');
    const { strategy, isDP } = detectStyle(objects, playerHeader);
    const channelMapping = strategy.buildMapping(isDP ? 'dp' : 'sp');

    let noteIdCounter = 0;

    // Long note pairing state
    const activeLN: Record<string, EditableBMSNote> = {};
    const lastNote: Record<string, EditableBMSNote> = {};
    const lnObj = canon(chart.headers.get('lnobj') || '');

    for (const obj of objects) {
      const channel = obj.channel.toUpperCase();
      const firstChar = channel.charAt(0);

      // Channel 02: time signature
      if (channel === '02') {
        const size = parseFloat(obj.value);
        if (!isNaN(size)) timeSignatures.set(obj.measure, size);
        continue;
      }

      // Channel 03: direct BPM
      if (channel === '03') {
        const bpm = parseInt(obj.value, 16);
        if (!isNaN(bpm) && bpm > 0) {
          bpmChanges.push({ measure: obj.measure, fraction: obj.fraction, bpm, extended: false });
        }
        continue;
      }

      // Channel 08: extended BPM
      if (channel === '08') {
        const bpmKey = canon(obj.value);
        const bpm = bpmMap.get(bpmKey);
        if (bpm !== undefined) {
          bpmChanges.push({
            measure: obj.measure, fraction: obj.fraction, bpm, extended: true,
            bpmDefKey: bpmKey,
          });
        }
        continue;
      }

      // Channel 09: STOP
      if (channel === '09') {
        const stopKey = canon(obj.value);
        const duration = stopMap.get(stopKey);
        if (duration !== undefined) {
          stopEvents.push({
            measure: obj.measure, fraction: obj.fraction, duration,
            stopDefKey: stopKey,
          });
        }
        continue;
      }

      // Channels 04, 06, 07: BGA
      if (channel === '04' || channel === '06' || channel === '07') {
        bgaEvents.push({
          measure: obj.measure, fraction: obj.fraction,
          bmpKey: canon(obj.value),
          layer: channel as '04' | '06' | '07',
        });
        continue;
      }

      // 5x/6x: long note channels
      if (firstChar === '5' || firstChar === '6') {
        const normalized = normalizeChannel(channel);
        const beat = chart.measureToBeat(obj.measure, obj.fraction);
        if (activeLN[normalized]) {
          activeLN[normalized].endBeat = beat;
          activeLN[normalized].endTick = Math.round(beat * 960);
          activeLN[normalized].endMeasure = obj.measure;
          activeLN[normalized].endFraction = obj.fraction;
          notes.push(activeLN[normalized]);
          delete activeLN[normalized];
        } else {
          const note = objectToNote(obj, noteIdCounter++, chart, channelMapping);
          if (note) {
            note.noteType = 'playable';
            activeLN[normalized] = note;
          }
        }
        continue;
      }

      // 1x/2x, 3x/4x, Dx/Ex: normal/invisible/landmine notes
      if (['1','2','3','4','D','E'].includes(firstChar)) {
        // LNOBJ markers live on the playable channels only (1x/2x); an
        // invisible (3x/4x) note on the same lane must never be turned into
        // the long note's head (it would then be written back as playable).
        const isPlayableChannel = firstChar === '1' || firstChar === '2';
        if (lnObj && isPlayableChannel && canon(obj.value) === lnObj && lastNote[channel]) {
          const beat = chart.measureToBeat(obj.measure, obj.fraction);
          lastNote[channel].endBeat = beat;
          lastNote[channel].endTick = Math.round(beat * 960);
          lastNote[channel].endMeasure = obj.measure;
          lastNote[channel].endFraction = obj.fraction;
          delete lastNote[channel];
        } else {
          const note = objectToNote(obj, noteIdCounter++, chart, channelMapping);
          if (note) {
            notes.push(note);
            if (note.column && isPlayableChannel) lastNote[channel] = note;
          }
        }
        continue;
      }

      // Channel 01: BGM
      if (channel === '01') {
        const note = objectToNote(obj, noteIdCounter++, chart, channelMapping);
        if (note) notes.push(note);
      }
    }

    // Measure sizes (#xxx02) are consumed by the parser into chart.timeSignatures
    // and never appear as objects, so read them from there.
    for (const [measure, size] of chart.timeSignatures.entries()) {
      if (!timeSignatures.has(measure)) timeSignatures.set(measure, size);
    }

    // Assign BGM note channel groups
    assignBgmChannels(notes);

    // Group multi-keysounds
    const groupedNotes = groupMultiKeysounds(notes);

    return {
      style: { id: strategy.id, isDP },
      headers,
      notes: groupedNotes,
      timeSignatures,
      bpmChanges,
      stopEvents,
      bgaEvents,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Empty chart creation util (used by BMSWriter.createEmptyChart)
// ──────────────────────────────────────────────────────────────────────────────

export function buildEmptyChart(): EditableBMSChart {
  return {
    headers: createEmptyHeaders(),
    notes: [],
    timeSignatures: new Map(),
    bpmChanges: [],
    stopEvents: [],
    bgaEvents: [],
  };
}
