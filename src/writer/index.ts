/**
 * BMS Writer Module
 *
 * BMS 차트 데이터를 BMS 파일 포맷으로 직렬화하는 모듈입니다.
 * 기존 parser의 역방향 기능을 제공합니다.
 *
 * 주요 기능:
 * - BMSChart 객체를 BMS 파일 문자열로 변환
 * - 편집된 노트 데이터를 채널 데이터로 변환
 * - 헤더 정보 생성
 * - 다양한 BMS 포맷 지원 (bms, bme, bml)
 *
 * 사용 예시:
 * ```ts
 * import { BMSWriter, BMSParser } from '@/lib/bms';
 *
 * // 파싱
 * const parser = new BMSParser();
 * const content = await parser.fetchFromUrl(url);
 * parser.compileString(content);
 *
 * // 편집 가능한 데이터로 변환
 * const editableChart = BMSWriter.fromBMSChart(parser.chart);
 *
 * // 노트 수정
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
 * // BMS 파일로 변환
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

// 타입 재내보내기
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

// 함수 재내보내기
export { writeHeaders, createEmptyHeaders, parseHeadersToData };
export { writeChannels, IIDX_SP_REVERSE, IIDX_DP_REVERSE };

/**
 * BMS Writer 클래스
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
   * EditableBMSChart를 BMS 파일 문자열로 변환
   */
  write(
    chart: EditableBMSChart,
    mapping: ReverseChannelMapping = IIDX_SP_REVERSE
  ): string {
    const lines: string[] = [];

    // LNOBJ 모드: 헤더에 lnobj 값 설정, lntype 제거
    const headers = { ...chart.headers };
    const lnMode = this.options.lnMode || 'channel';
    if (lnMode === 'lnobj') {
      let lnObjValue = this.options.lnObjValue || headers.lnobj || '';
      if (!lnObjValue) {
        // 미사용 WAV ID 중 가장 큰 값을 LNOBJ 마커로 자동 할당
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
        // WAV 정의에 LNOBJ용 무음 항목 추가 (없으면)
        if (!headers.wav.has(lnObjValue) && !headers.wav.has(lnObjValue.toLowerCase())) {
          headers.wav = new Map(headers.wav);
          // LNOBJ 마커는 WAV 정의 없이도 동작하지만 일부 플레이어 호환을 위해 추가
        }
        this.options.lnObjValue = lnObjValue;
      }
    } else {
      // 채널 모드: lnobj 제거, lntype 유지 (있으면)
      if (!headers.lntype && chart.notes.some(n => n.endBeat !== undefined)) {
        headers.lntype = 1;
      }
    }

    // 헤더 작성
    lines.push(...writeHeaders(headers, this.options));

    // 채널 데이터 작성
    lines.push(...writeChannels(chart, mapping, this.options));

    // 줄바꿈으로 연결
    return lines.join('\r\n');
  }

  /**
   * BMSChart 객체에서 EditableBMSChart 생성.
   * 내부 로직은 EditableChartBuilder 에 위임합니다.
   */
  static fromBMSChart(chart: BMSChart): EditableBMSChart {
    return new EditableChartBuilder(chart).build();
  }

  /**
   * 빈 EditableBMSChart 생성
   */
  static createEmptyChart(): EditableBMSChart {
    return buildEmptyChart();
  }

  /**
   * EditableBMSChart 복제 (deep copy)
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
   * 두 차트 비교하여 변경사항 감지
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

    // 헤더 변경 감지
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

    // 노트 변경 감지
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
 * 차트 변경사항
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

// 기본 내보내기
export default BMSWriter;
