/**
 * BMS Writer Types
 * Type definitions for writing BMS files
 */

import type { BMSNote } from '../parser';

/**
 * BMS Writer options
 */
export interface BMSWriterOptions {
  /** Output format (default: bms) */
  format?: 'bms' | 'bme' | 'bml';
  /** Default resolution per measure (default: 192) */
  resolution?: number;
  /** Customizes the header order */
  headerOrder?: string[];
  /** Whether to include comments */
  includeComments?: boolean;
  /** Whether to skip empty measures */
  skipEmptyMeasures?: boolean;
  /** Long note output format (default: 'channel' = 5x/6x channels, 'lnobj' = LNOBJ marker) */
  lnMode?: 'channel' | 'lnobj';
  /** LNOBJ marker value (used when lnMode='lnobj'; default: the lnobj header value or the largest unused WAV ID) */
  lnObjValue?: string;
  /**
   * Automatic resolution calculation using tick data (default: true)
   * true: dynamically computes the minimum BMS resolution from the actual note tick positions of each measure
   *       -> notes at resolutions above 192, such as 64th-note triplets, are written without loss
   * false: uses only the fixed value of the resolution option (legacy behavior)
   */
  autoResolution?: boolean;
  /**
   * `#BASE 62` object IDs (case-sensitive, '01'..'zz'). Derived from the
   * chart's `#BASE` header when omitted.
   */
  base62?: boolean;
}

/**
 * Editable BMS chart data
 */
/**
 * Channel-layout style of a chart (which BMS channels map to which columns).
 * Recorded by `BMSWriter.fromBMSChart` so `write()` can reproduce the same
 * channel layout — an IIDX-only reverse map silently drops 2P (DP) columns
 * and rewrites PMS 9-key channels.
 */
export interface EditableChartStyle {
  id: 'iidx' | 'keyboard' | 'pms';
  isDP: boolean;
}

export interface EditableBMSChart {
  /** Channel layout to use when writing (optional; auto-detected from columns when absent) */
  style?: EditableChartStyle;
  /** Header information */
  headers: BMSHeaderData;
  /** Note data */
  notes: EditableBMSNote[];
  /** Time signatures (size per measure) */
  timeSignatures: Map<number, number>;
  /** BPM change events */
  bpmChanges: BMSBpmChange[];
  /** STOP events */
  stopEvents: BMSStopEvent[];
  /** BGA events */
  bgaEvents: BMSBgaEvent[];
  /**
   * Objects on channels the editor does not model (e.g. 05, 0A, 0B-0E, 97/98,
   * 99 TEXT, A0 JUDGE, A1-A6, extension lanes 1A-2Z). Kept verbatim so a
   * load → save round trip does not drop them. Optional for compatibility.
   */
  extraObjects?: BMSExtraObject[];
}

/**
 * An object on a channel the editor does not model, kept as-is.
 */
export interface BMSExtraObject {
  /** Measure number */
  measure: number;
  /** Fractional position within the measure (exact source value) */
  fraction: number;
  /** Two-character channel as written in the source file */
  channel: string;
  /** Two-character object value as written in the source file */
  value: string;
}

/**
 * BMS header data
 */
export interface BMSHeaderData {
  player?: number;
  genre?: string;
  title?: string;
  subtitle?: string;
  artist?: string;
  subartist?: string;
  bpm?: number;
  playlevel?: number;
  rank?: number;
  total?: number;
  difficulty?: number;
  stagefile?: string;
  banner?: string;
  backbmp?: string;
  lntype?: number;
  lnobj?: string;
  /** WAV definitions */
  wav: Map<string, string>;
  /** BMP definitions */
  bmp: Map<string, string>;
  /** BPM definitions (for extended BPM) */
  bpmDef: Map<string, number>;
  /** STOP definitions */
  stopDef: Map<string, number>;
  /** Other custom headers */
  custom: Map<string, string>;
}

/**
 * Editable BMS note
 * Extends the parser's BMSNote with information needed for editing
 */
export interface EditableBMSNote extends BMSNote {
  /** Unique ID (for editing) */
  id: string;
  /** Tick position (960 ticks/beat). Primary source of truth in editor. */
  tick: number;
  /** End tick for long notes. */
  endTick?: number;
  /** Measure / fraction of the long-note end as parsed from the source (unmoved ends round-trip exactly). */
  endMeasure?: number;
  endFraction?: number;
  /** The measure the note is in */
  measure: number;
  /** Fractional position within the measure (0-1) */
  fraction: number;
  /** Original channel */
  channel: string;
  /** Additional keysound layers (multi-keysound support) */
  additionalKeysounds?: Array<{
    keysound: string;
    /** Output channel type ('invisible' → 3x/4x channels, 'bgm' → channel 01) */
    type: 'invisible' | 'bgm';
  }>;
  /** BGM channel group number (editor only — for visual lane separation, no effect on BMS output) */
  bgmChannel?: number;
}

/**
 * BPM change event
 */
export interface BMSBpmChange {
  /** Measure number */
  measure: number;
  /** Fractional position within the measure */
  fraction: number;
  /** BPM value */
  bpm: number;
  /** Whether extended BPM is used (channel 08 vs 03) */
  extended?: boolean;
  /** Extended BPM definition key */
  bpmDefKey?: string;
}

/**
 * STOP event
 */
export interface BMSStopEvent {
  /** Measure number */
  measure: number;
  /** Fractional position within the measure */
  fraction: number;
  /** STOP value (192 = 1 beat) */
  duration: number;
  /** STOP definition key */
  stopDefKey?: string;
}

/**
 * BGA event
 */
export interface BMSBgaEvent {
  /** Measure number */
  measure: number;
  /** Fractional position within the measure */
  fraction: number;
  /** BMP definition key */
  bmpKey: string;
  /** BGA layer (04: BGA, 06: Poor BGA, 07: Layer) */
  layer: '04' | '06' | '07';
}

/**
 * Kinds of data adjustments the writer had to make to produce a valid file.
 * - `slot-collision-rerouted`: an object shared a slot with another object on the
 *   same (non-BGM) channel; its keysound was written on the BGM channel 01 instead.
 * - `slot-collision-dropped`: an object shared a slot and could not be kept
 *   (landmines carry damage, not a keysound, so they are not moved to BGM).
 * - `ln-end-shortened`: a long-note end coincided with another note's start in the
 *   same lane; the end was moved back by 1/192 of a measure.
 * - `out-of-range`: an object lies outside measures 000-999 and was skipped.
 * - `definition-keys-exhausted`: no free `#BPMxx` / `#STOPxx` key was left.
 * - `invalid-value`: a BPM / STOP value that is not a finite number was skipped.
 */
export type BMSWriterWarningCode =
  | 'slot-collision-rerouted'
  | 'slot-collision-dropped'
  | 'ln-end-shortened'
  | 'out-of-range'
  | 'definition-keys-exhausted'
  | 'invalid-value';

/** Aggregated writer warning (one entry per code, with the number of affected objects). */
export interface BMSWriterWarning {
  code: BMSWriterWarningCode;
  count: number;
  message: string;
}

/**
 * Channel data (for output)
 */
export interface ChannelData {
  /** Channel number (2 characters) */
  channel: string;
  /** Measure number */
  measure: number;
  /** Data string */
  data: string;
}

/**
 * Note -> channel reverse mapping
 */
export interface ReverseChannelMapping {
  /** Column ID -> channel number */
  playable: Map<string, string>;
  /** Column ID -> invisible channel number */
  invisible: Map<string, string>;
  /** Column ID -> landmine channel number */
  landmine: Map<string, string>;
  /** Column ID -> long note channel number */
  longNote: Map<string, string>;
}
