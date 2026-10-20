/**
 * BMS Writer Module
 *
 * Module that serializes BMS chart data into the BMS file format.
 * Provides the inverse functionality of the existing parser.
 *
 * Main features:
 * - Converts a BMSChart object into a BMS file string
 * - Converts edited note data into channel data
 * - Generates header information
 * - Supports various BMS formats (bms, bme, bml)
 *
 * Usage example:
 * ```ts
 * import { BMSWriter, BMSParser } from '@/lib/bms';
 *
 * // Parse
 * const parser = new BMSParser();
 * const content = await parser.fetchFromUrl(url);
 * parser.compileString(content);
 *
 * // Convert into editable data
 * const editableChart = BMSWriter.fromBMSChart(parser.chart);
 *
 * // Modify notes
 * editableChart.notes.push({
 *   id: 'new-note-1',
 *   beat: 4,
 *   measure: 1,
 *   fraction: 0,
 *   column: '1',
 *   keysound: '01',
 *   noteType: 'playable',
 *   channel: '11',
 * });
 *
 * // Convert into a BMS file
 * const bmsContent = BMSWriter.write(editableChart);
 * ```
 */

import { STRATEGIES } from '../parser/strategies/styleStrategy';
import type {
  BMSWriterOptions,
  EditableBMSChart,
  EditableBMSNote,
  BMSHeaderData,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  ReverseChannelMapping,
  EditableChartStyle,
  BMSWriterWarning,
  BMSWriterWarningCode,
} from './types';
import { writeHeaders, createEmptyHeaders, parseHeadersToData } from './headerWriter';
import {
  writeChannels,
  resolveTimingDefinitions,
  isLongNote,
  WriterWarnings,
  IIDX_SP_REVERSE,
  IIDX_DP_REVERSE,
} from './channelWriter';
import type { BMSChart } from '../parser/bms/chart';
import { EditableChartBuilder, buildEmptyChart } from './editableChartBuilder';
import { canonicalObjectId, isBase62Headers, maxObjectIds, objectIdAt } from '../utils/objectId';

// Type re-exports
export type {
  BMSWriterOptions,
  EditableChartStyle,
  EditableBMSChart,
  EditableBMSNote,
  BMSHeaderData,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  ReverseChannelMapping,
  BMSWriterWarning,
  BMSWriterWarningCode,
};

// Function re-exports
export { writeHeaders, createEmptyHeaders, parseHeadersToData };
export { writeChannels, resolveTimingDefinitions, IIDX_SP_REVERSE, IIDX_DP_REVERSE };

/**
 * BMS Writer class
 */
/** Style implied by an editor key mode (used when a chart was created in the editor). */
export function styleForKeyMode(keyMode: string): EditableChartStyle {
  switch (keyMode) {
    case '9K': return { id: 'pms', isDP: false };
    case '10K': case '14K': return { id: 'iidx', isDP: true };
    case '12K': case '18K': case '24K': case '48K': return { id: 'keyboard', isDP: true };
    default: return { id: 'iidx', isDP: false };
  }
}

/**
 * Resolve the column → channel mapping for a chart: the recorded style wins,
 * otherwise infer it from the columns actually used by the notes.
 */
export function resolveReverseMapping(chart: EditableBMSChart): ReverseChannelMapping {
  let style = chart.style;
  if (!style) {
    const columns = new Set<string>();
    for (const n of chart.notes) if (n.column) columns.add(n.column);
    const numeric = [...columns].map((c) => parseInt(c, 10)).filter((n) => Number.isFinite(n));
    const maxCol = numeric.length ? Math.max(...numeric) : 0;
    const hasScratch = columns.has('SC') || columns.has('SC2') || columns.has('FZ') || columns.has('FZ2');
    if (maxCol > 14) style = { id: 'keyboard', isDP: true };
    else if (columns.has('SC2') || columns.has('FZ2') || (hasScratch && maxCol > 7) || chart.headers.player === 3) style = { id: 'iidx', isDP: true };
    else if (!hasScratch && maxCol >= 8 && maxCol <= 9) style = { id: 'pms', isDP: false };
    else style = { id: 'iidx', isDP: false };
  }
  const strategy = STRATEGIES.find((st) => st.id === style!.id);
  if (!strategy) return style.isDP ? IIDX_DP_REVERSE : IIDX_SP_REVERSE;
  return strategy.buildReverseMapping(style.isDP ? 'dp' : 'sp');
}

export class BMSWriter {
  private options: BMSWriterOptions;
  /**
   * Adjustments made by the last write() (e.g. objects rerouted to the BGM channel
   * because they shared a slot, long-note ends shortened, out-of-range objects skipped).
   * Empty when the chart could be written exactly as given.
   */
  lastWarnings: BMSWriterWarning[] = [];

  constructor(options: BMSWriterOptions = {}) {
    this.options = {
      format: 'bms',
      resolution: 192,
      includeComments: true,
      skipEmptyMeasures: true,
      ...options,
    };
  }

  /**
   * Converts an EditableBMSChart into a BMS file string
   */
  write(
    chart: EditableBMSChart,
    mapping?: ReverseChannelMapping
  ): string {
    const lines: string[] = [];
    // Pick the channel layout that matches the chart. The old default
    // (IIDX SP) silently dropped every 2P column of a DP chart and rewrote
    // PMS 9-key channels 22-25 as 18/19.
    mapping = mapping ?? resolveReverseMapping(chart);

    const warnings = new WriterWarnings();
    // #BASE 62 charts keep case-sensitive object IDs end to end.
    const base62 = this.options.base62 ?? isBase62Headers(chart.headers);
    const options: BMSWriterOptions = { ...this.options, base62 };

    // Give every BPM / STOP event a valid channel and definition key (works on
    // copies; new #BPMxx / #STOPxx definitions are added to the written header only).
    const timing = resolveTimingDefinitions(chart, warnings);

    // LNOBJ mode: set the lnobj value in the headers, remove lntype
    const headers = { ...chart.headers, bpmDef: timing.bpmDef, stopDef: timing.stopDef };
    const lnMode = this.options.lnMode || 'channel';
    if (lnMode === 'lnobj') {
      let lnObjValue = this.options.lnObjValue || headers.lnobj || '';
      if (!lnObjValue) {
        // Auto-assign the largest unused WAV ID as the LNOBJ marker
        const usedIds = new Set<string>();
        for (const key of headers.wav.keys()) usedIds.add(canonicalObjectId(key, base62));
        for (const n of chart.notes) {
          if (n.keysound) usedIds.add(canonicalObjectId(n.keysound, base62));
        }
        for (let i = maxObjectIds(base62); i >= 1; i--) {
          const candidate = objectIdAt(i, base62);
          if (!usedIds.has(candidate)) {
            lnObjValue = candidate;
            break;
          }
        }
      }
      if (lnObjValue) {
        headers.lnobj = lnObjValue;
        // Keep an existing #LNTYPE: it governs 5x/6x channels and coexists with
        // #LNOBJ; dropping it changed the file for no gain.
        // Add a silent WAV definition entry for LNOBJ (if missing)
        if (!headers.wav.has(lnObjValue) && !headers.wav.has(lnObjValue.toLowerCase())) {
          headers.wav = new Map(headers.wav);
          // The LNOBJ marker works without a WAV definition, but it is added for compatibility with some players
        }
        this.options.lnObjValue = lnObjValue;
        options.lnObjValue = lnObjValue;
      }
    } else {
      // Channel mode: remove lnobj, keep lntype (if present)
      if (!headers.lntype && chart.notes.some(isLongNote)) {
        headers.lntype = 1;
      }
    }

    // Write headers
    lines.push(...writeHeaders(headers, options));

    // Write channel data
    const chartToWrite: EditableBMSChart = {
      ...chart,
      headers,
      bpmChanges: timing.bpmChanges,
      stopEvents: timing.stopEvents,
    };
    lines.push(...writeChannels(chartToWrite, mapping, options, warnings));
    this.lastWarnings = warnings.toList();

    // Join with line breaks
    return lines.join('\r\n');
  }

  /** Warnings of the last write() (see lastWarnings) */
  getWarnings(): BMSWriterWarning[] {
    return this.lastWarnings;
  }

  /**
   * Creates an EditableBMSChart from a BMSChart object.
   * The internal logic is delegated to EditableChartBuilder.
   */
  static fromBMSChart(chart: BMSChart): EditableBMSChart {
    return new EditableChartBuilder(chart).build();
  }

  /**
   * Creates an empty EditableBMSChart
   */
  static createEmptyChart(): EditableBMSChart {
    return buildEmptyChart();
  }

  /**
   * Clones an EditableBMSChart (deep copy)
   */
  static cloneChart(chart: EditableBMSChart): EditableBMSChart {
    return {
      headers: {
        ...chart.headers,
        wav: new Map(chart.headers.wav),
        bmp: new Map(chart.headers.bmp),
        bpmDef: new Map(chart.headers.bpmDef),
        stopDef: new Map(chart.headers.stopDef),
        custom: new Map(chart.headers.custom),
      },
      notes: chart.notes.map((n) => ({
        ...n,
        additionalKeysounds: n.additionalKeysounds
          ? n.additionalKeysounds.map((l) => ({ ...l }))
          : undefined,
      })),
      timeSignatures: new Map(chart.timeSignatures),
      bpmChanges: chart.bpmChanges.map((b) => ({ ...b })),
      stopEvents: chart.stopEvents.map((s) => ({ ...s })),
      bgaEvents: chart.bgaEvents.map((b) => ({ ...b })),
    };
  }

  /**
   * Compares two charts and detects changes
   */
  static diffCharts(
    original: EditableBMSChart,
    modified: EditableBMSChart
  ): ChartDiff {
    const diff: ChartDiff = {
      headerChanges: [],
      addedNotes: [],
      removedNotes: [],
      modifiedNotes: [],
      bpmChanges: [],
      stopChanges: [],
      bgaChanges: [],
      timeSignatureChanges: [],
    };

    // Detect header changes
    const headerKeys: (keyof BMSHeaderData)[] = [
      'player', 'genre', 'title', 'subtitle', 'artist', 'subartist',
      'bpm', 'playlevel', 'rank', 'total', 'difficulty',
      'stagefile', 'banner', 'backbmp', 'lntype', 'lnobj',
    ];

    for (const key of headerKeys) {
      const origVal = original.headers[key];
      const modVal = modified.headers[key];
      if (origVal !== modVal) {
        diff.headerChanges.push({ field: key, oldValue: origVal, newValue: modVal });
      }
    }

    // Detect note changes
    const originalNoteIds = new Set(original.notes.map((n) => n.id));
    const modifiedNoteIds = new Set(modified.notes.map((n) => n.id));
    const originalNoteMap = new Map(original.notes.map((n) => [n.id, n]));

    for (const note of modified.notes) {
      if (!originalNoteIds.has(note.id)) diff.addedNotes.push(note);
    }

    for (const note of original.notes) {
      if (!modifiedNoteIds.has(note.id)) diff.removedNotes.push(note);
    }

    for (const note of modified.notes) {
      if (originalNoteIds.has(note.id)) {
        const origNote = originalNoteMap.get(note.id)!;
        const origLayerCount = origNote.additionalKeysounds?.length ?? 0;
        const modLayerCount = note.additionalKeysounds?.length ?? 0;
        if (
          origNote.beat !== note.beat ||
          origNote.column !== note.column ||
          origNote.keysound !== note.keysound ||
          origNote.noteType !== note.noteType ||
          origLayerCount !== modLayerCount
        ) {
          diff.modifiedNotes.push({ original: origNote, modified: note });
        }
      }
    }

    return diff;
  }
}

/**
 * Chart changes
 */
export interface ChartDiff {
  headerChanges: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  addedNotes: EditableBMSNote[];
  removedNotes: EditableBMSNote[];
  modifiedNotes: Array<{
    original: EditableBMSNote;
    modified: EditableBMSNote;
  }>;
  bpmChanges: BMSBpmChange[];
  stopChanges: BMSStopEvent[];
  bgaChanges: BMSBgaEvent[];
  timeSignatureChanges: Array<{
    measure: number;
    oldSize: number;
    newSize: number;
  }>;
}

// Default export
export default BMSWriter;
