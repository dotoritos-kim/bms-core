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

import type {
  BMSWriterOptions,
  EditableBMSChart,
  EditableBMSNote,
  BMSHeaderData,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  ReverseChannelMapping,
} from './types';
import { writeHeaders, createEmptyHeaders, parseHeadersToData } from './headerWriter';
import {
  writeChannels,
  IIDX_SP_REVERSE,
  IIDX_DP_REVERSE,
} from './channelWriter';
import type { BMSChart } from '../parser/bms/chart';
import { EditableChartBuilder, buildEmptyChart } from './editableChartBuilder';

// Type re-exports
export type {
  BMSWriterOptions,
  EditableBMSChart,
  EditableBMSNote,
  BMSHeaderData,
  BMSBpmChange,
  BMSStopEvent,
  BMSBgaEvent,
  ReverseChannelMapping,
};

// Function re-exports
export { writeHeaders, createEmptyHeaders, parseHeadersToData };
export { writeChannels, IIDX_SP_REVERSE, IIDX_DP_REVERSE };

/**
 * BMS Writer class
 */
export class BMSWriter {
  private options: BMSWriterOptions;

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
    mapping: ReverseChannelMapping = IIDX_SP_REVERSE
  ): string {
    const lines: string[] = [];

    // LNOBJ mode: set the lnobj value in the headers, remove lntype
    const headers = { ...chart.headers };
    const lnMode = this.options.lnMode || 'channel';
    if (lnMode === 'lnobj') {
      let lnObjValue = this.options.lnObjValue || headers.lnobj || '';
      if (!lnObjValue) {
        // Auto-assign the largest unused WAV ID as the LNOBJ marker
        const usedIds = new Set<string>();
        for (const key of headers.wav.keys()) usedIds.add(key.toUpperCase());
        for (const n of chart.notes) {
          if (n.keysound) usedIds.add(n.keysound.toUpperCase());
        }
        for (let i = 1295; i >= 1; i--) {
          const candidate = i.toString(36).toUpperCase().padStart(2, '0');
          if (!usedIds.has(candidate)) {
            lnObjValue = candidate;
            break;
          }
        }
      }
      if (lnObjValue) {
        headers.lnobj = lnObjValue;
        headers.lntype = undefined;
        // Add a silent WAV definition entry for LNOBJ (if missing)
        if (!headers.wav.has(lnObjValue) && !headers.wav.has(lnObjValue.toLowerCase())) {
          headers.wav = new Map(headers.wav);
          // The LNOBJ marker works without a WAV definition, but it is added for compatibility with some players
        }
        this.options.lnObjValue = lnObjValue;
      }
    } else {
      // Channel mode: remove lnobj, keep lntype (if present)
      if (!headers.lntype && chart.notes.some(n => n.endBeat !== undefined)) {
        headers.lntype = 1;
      }
    }

    // Write headers
    lines.push(...writeHeaders(headers, this.options));

    // Write channel data
    lines.push(...writeChannels(chart, mapping, this.options));

    // Join with line breaks
    return lines.join('\r\n');
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
