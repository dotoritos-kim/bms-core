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
import type { BMSObject } from '../parser/bms/objects';
import { detectBMSStyle, createCombinedMapping } from '../parser/modules/notes/channels';

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
 * 채널 정규화 (파서의 _normalizeChannel과 동일)
 * 5x→1x, 6x→2x, 3x→1x, 4x→2x, Dx→1x, Ex→2x
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
   * BMSChart 객체에서 EditableBMSChart 생성
   */
  static fromBMSChart(chart: BMSChart): EditableBMSChart {
    // 헤더 변환
    const headers = parseHeadersToData(chart.headers);

    // 노트 변환
    const notes: EditableBMSNote[] = [];
    const bpmChanges: BMSBpmChange[] = [];
    const stopEvents: BMSStopEvent[] = [];
    const bgaEvents: BMSBgaEvent[] = [];
    const timeSignatures = new Map<number, number>();

    // BPM 정의 맵
    const bpmMap = new Map<string, number>();
    headers.bpmDef.forEach((value, key) => {
      bpmMap.set(key.toLowerCase(), value);
    });

    // STOP 정의 맵
    const stopMap = new Map<string, number>();
    headers.stopDef.forEach((value, key) => {
      stopMap.set(key.toLowerCase(), value);
    });

    // 오브젝트 순회 + 채널→컬럼 매핑 자동 감지
    const objects = chart.objects.allSorted();
    const playerHeader = chart.headers.get('player');
    const { style, isDP } = detectBMSStyle(objects, playerHeader);
    const channelMapping = createCombinedMapping(style, isDP);
    let noteIdCounter = 0;

    // 롱노트 페어링 상태 (파서의 _activeLN / _lastNote 패턴)
    const activeLN: Record<string, EditableBMSNote> = {};
    const lastNote: Record<string, EditableBMSNote> = {};
    const lnObj = (chart.headers.get('lnobj') || '').toLowerCase();

    for (const obj of objects) {
      const channel = obj.channel.toUpperCase();
      const firstChar = channel.charAt(0);

      // 채널 02: 박자표
      if (channel === '02') {
        const size = parseFloat(obj.value);
        if (!isNaN(size)) {
          timeSignatures.set(obj.measure, size);
        }
        continue;
      }

      // 채널 03: 직접 BPM
      if (channel === '03') {
        const bpm = parseInt(obj.value, 16);
        if (!isNaN(bpm) && bpm > 0) {
          bpmChanges.push({
            measure: obj.measure,
            fraction: obj.fraction,
            bpm,
            extended: false,
          });
        }
        continue;
      }

      // 채널 08: 확장 BPM
      if (channel === '08') {
        const bpmKey = obj.value.toLowerCase();
        const bpm = bpmMap.get(bpmKey);
        if (bpm !== undefined) {
          bpmChanges.push({
            measure: obj.measure,
            fraction: obj.fraction,
            bpm,
            extended: true,
            bpmDefKey: bpmKey.toUpperCase(),
          });
        }
        continue;
      }

      // 채널 09: STOP
      if (channel === '09') {
        const stopKey = obj.value.toLowerCase();
        const duration = stopMap.get(stopKey);
        if (duration !== undefined) {
          stopEvents.push({
            measure: obj.measure,
            fraction: obj.fraction,
            duration,
            stopDefKey: stopKey.toUpperCase(),
          });
        }
        continue;
      }

      // 채널 04, 06, 07: BGA
      if (channel === '04' || channel === '06' || channel === '07') {
        bgaEvents.push({
          measure: obj.measure,
          fraction: obj.fraction,
          bmpKey: obj.value.toUpperCase(),
          layer: channel as '04' | '06' | '07',
        });
        continue;
      }

      // 5x/6x: 롱노트 채널 (시작/끝 페어링)
      if (firstChar === '5' || firstChar === '6') {
        const normalized = normalizeChannel(channel);
        const beat = chart.measureToBeat(obj.measure, obj.fraction);
        if (activeLN[normalized]) {
          // 끝 이벤트 → endBeat 설정 후 push
          activeLN[normalized].endBeat = beat;
          notes.push(activeLN[normalized]);
          delete activeLN[normalized];
        } else {
          // 시작 이벤트 → 대기 (아직 push 안 함)
          const note = BMSWriter.objectToNote(obj, noteIdCounter++, chart, channelMapping);
          if (note) {
            note.noteType = 'playable';
            activeLN[normalized] = note;
          }
        }
        continue;
      }

      // 1x/2x, 3x/4x, Dx/Ex: 일반/인비저블/지뢰 노트
      if (['1', '2', '3', '4', 'D', 'E'].includes(firstChar)) {
        const normalized = normalizeChannel(channel);
        // LNOBJ 처리: 해당 value가 lnobj이면 이전 노트에 endBeat 설정
        if (lnObj && obj.value.toLowerCase() === lnObj && lastNote[normalized]) {
          const beat = chart.measureToBeat(obj.measure, obj.fraction);
          lastNote[normalized].endBeat = beat;
        } else {
          const note = BMSWriter.objectToNote(obj, noteIdCounter++, chart, channelMapping);
          if (note) {
            notes.push(note);
            if (note.column) lastNote[normalized] = note;
          }
        }
        continue;
      }

      // 01: BGM
      if (channel === '01') {
        const note = BMSWriter.objectToNote(obj, noteIdCounter++, chart, channelMapping);
        if (note) {
          notes.push(note);
        }
      }
    }

    // BGM 노트에 자동 채널 그룹 할당 (같은 beat의 BGM 노트를 서로 다른 채널로 분리)
    BMSWriter.assignBgmChannels(notes);

    // 멀티 키음 그룹화: 같은 beat+column에 있는 invisible/BGM 노트를 playable 노트의 additionalKeysounds로 병합
    const groupedNotes = BMSWriter.groupMultiKeysounds(notes);

    return {
      headers,
      notes: groupedNotes,
      timeSignatures,
      bpmChanges,
      stopEvents,
      bgaEvents,
    };
  }

  /**
   * BMSObject를 EditableBMSNote로 변환
   */
  private static objectToNote(
    obj: BMSObject,
    id: number,
    chart: BMSChart,
    channelMapping: Record<string, string>
  ): EditableBMSNote | null {
    const channel = obj.channel.toUpperCase();
    const firstChar = channel.charAt(0);

    // 노트 타입 결정
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

    // 컬럼 결정 (채널 매핑 기반)
    let column: string | undefined;
    if (noteType !== 'bgm') {
      column = channelMapping[channel];
    }

    // 비트 계산
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
   * BGM 노트에 자동 채널 그룹 번호 할당
   * 같은 tick의 BGM 노트를 서로 다른 채널로 분리하여 에디터에서 멀티 레인 표시 가능
   */
  private static assignBgmChannels(notes: EditableBMSNote[]): void {
    // tick별로 BGM 노트를 그룹핑
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

    // 각 그룹 내에서 순차 채널 번호 할당
    for (const group of tickGroups.values()) {
      for (let i = 0; i < group.length; i++) {
        group[i].bgmChannel = i;
      }
    }
  }

  /**
   * 같은 beat+column에 있는 invisible/BGM 노트를 playable 노트의 additionalKeysounds로 병합
   */
  private static groupMultiKeysounds(notes: EditableBMSNote[]): EditableBMSNote[] {
    // beat+column 키로 playable 노트 인덱싱
    const playableMap = new Map<string, EditableBMSNote>();
    const result: EditableBMSNote[] = [];
    const consumed = new Set<string>(); // 병합된 invisible/bgm 노트 ID

    // 먼저 playable 노트를 등록
    for (const note of notes) {
      if (note.noteType === 'playable' && note.column) {
        const key = `${note.beat.toFixed(6)}:${note.column}`;
        if (!playableMap.has(key)) {
          playableMap.set(key, note);
        }
      }
    }

    // invisible/bgm 노트 중 같은 위치의 playable이 있으면 병합
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

    // consumed되지 않은 노트만 결과에 포함
    for (const note of notes) {
      if (!consumed.has(note.id)) {
        result.push(note);
      }
    }

    return result;
  }

  /**
   * 빈 EditableBMSChart 생성
   */
  static createEmptyChart(): EditableBMSChart {
    return {
      headers: createEmptyHeaders(),
      notes: [],
      timeSignatures: new Map(),
      bpmChanges: [],
      stopEvents: [],
      bgaEvents: [],
    };
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
      'player',
      'genre',
      'title',
      'subtitle',
      'artist',
      'subartist',
      'bpm',
      'playlevel',
      'rank',
      'total',
      'difficulty',
      'stagefile',
      'banner',
      'backbmp',
      'lntype',
      'lnobj',
    ];

    for (const key of headerKeys) {
      const origVal = original.headers[key];
      const modVal = modified.headers[key];
      if (origVal !== modVal) {
        diff.headerChanges.push({
          field: key,
          oldValue: origVal,
          newValue: modVal,
        });
      }
    }

    // 노트 변경 감지
    const originalNoteIds = new Set(original.notes.map((n) => n.id));
    const modifiedNoteIds = new Set(modified.notes.map((n) => n.id));
    const originalNoteMap = new Map(original.notes.map((n) => [n.id, n]));

    // 추가된 노트
    for (const note of modified.notes) {
      if (!originalNoteIds.has(note.id)) {
        diff.addedNotes.push(note);
      }
    }

    // 삭제된 노트
    for (const note of original.notes) {
      if (!modifiedNoteIds.has(note.id)) {
        diff.removedNotes.push(note);
      }
    }

    // 수정된 노트
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
          diff.modifiedNotes.push({
            original: origNote,
            modified: note,
          });
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
