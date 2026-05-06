/**
 * EditableChartBuilder — BMSChart → EditableBMSChart 변환
 *
 * REFACTOR-PLAN PR-5 / P2: BMSWriter.fromBMSChart 의 내부 로직을 이 빌더로 추출.
 * BMSWriter.fromBMSChart 는 이 빌더에 위임하는 얇은 facade 로 유지됩니다.
 *
 * Visitor 인터페이스를 사용하지 않는 채널 디스패치 방식으로 동일한 분리 효과를 얻습니다.
 */

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
// 내부 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 채널 정규화 (5x→1x, 6x→2x, 3x→1x, 4x→2x, Dx→1x, Ex→2x)
 * — parser의 BMSNoteBuilder._normalizeChannel 과 동일
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
 * BMSObject 하나를 EditableBMSNote 로 변환합니다.
 * null 반환 시 해당 오브젝트를 건너뜁니다.
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
 * BGM 노트에 순차 채널 그룹 번호를 할당합니다 (에디터 전용).
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
 * 같은 beat+column 의 invisible/bgm 노트를 playable 노트의
 * additionalKeysounds 로 병합합니다.
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
 * BMSChart 를 EditableBMSChart 로 변환하는 빌더.
 *
 * 사용 예:
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

    // 헤더 변환
    const headers: BMSHeaderData = parseHeadersToData(chart.headers);

    const notes: EditableBMSNote[] = [];
    const bpmChanges: BMSBpmChange[] = [];
    const stopEvents: BMSStopEvent[] = [];
    const bgaEvents: BMSBgaEvent[] = [];
    const timeSignatures = new Map<number, number>();

    // BPM / STOP 정의 맵
    const bpmMap = new Map<string, number>();
    headers.bpmDef.forEach((value, key) => bpmMap.set(key.toLowerCase(), value));

    const stopMap = new Map<string, number>();
    headers.stopDef.forEach((value, key) => stopMap.set(key.toLowerCase(), value));

    // 채널 매핑 자동 감지 (Strategy 사용)
    const objects = chart.objects.allSorted();
    const playerHeader = chart.headers.get('player');
    const { strategy, isDP } = detectStyle(objects, playerHeader);
    const channelMapping = strategy.buildMapping(isDP ? 'dp' : 'sp');

    let noteIdCounter = 0;

    // 롱노트 페어링 상태
    const activeLN: Record<string, EditableBMSNote> = {};
    const lastNote: Record<string, EditableBMSNote> = {};
    const lnObj = (chart.headers.get('lnobj') || '').toLowerCase();

    for (const obj of objects) {
      const channel = obj.channel.toUpperCase();
      const firstChar = channel.charAt(0);

      // 채널 02: 박자표
      if (channel === '02') {
        const size = parseFloat(obj.value);
        if (!isNaN(size)) timeSignatures.set(obj.measure, size);
        continue;
      }

      // 채널 03: 직접 BPM
      if (channel === '03') {
        const bpm = parseInt(obj.value, 16);
        if (!isNaN(bpm) && bpm > 0) {
          bpmChanges.push({ measure: obj.measure, fraction: obj.fraction, bpm, extended: false });
        }
        continue;
      }

      // 채널 08: 확장 BPM
      if (channel === '08') {
        const bpmKey = obj.value.toLowerCase();
        const bpm = bpmMap.get(bpmKey);
        if (bpm !== undefined) {
          bpmChanges.push({
            measure: obj.measure, fraction: obj.fraction, bpm, extended: true,
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
            measure: obj.measure, fraction: obj.fraction, duration,
            stopDefKey: stopKey.toUpperCase(),
          });
        }
        continue;
      }

      // 채널 04, 06, 07: BGA
      if (channel === '04' || channel === '06' || channel === '07') {
        bgaEvents.push({
          measure: obj.measure, fraction: obj.fraction,
          bmpKey: obj.value.toUpperCase(),
          layer: channel as '04' | '06' | '07',
        });
        continue;
      }

      // 5x/6x: 롱노트 채널
      if (firstChar === '5' || firstChar === '6') {
        const normalized = normalizeChannel(channel);
        const beat = chart.measureToBeat(obj.measure, obj.fraction);
        if (activeLN[normalized]) {
          activeLN[normalized].endBeat = beat;
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

      // 1x/2x, 3x/4x, Dx/Ex: 일반/인비저블/지뢰 노트
      if (['1','2','3','4','D','E'].includes(firstChar)) {
        const normalized = normalizeChannel(channel);
        if (lnObj && obj.value.toLowerCase() === lnObj && lastNote[normalized]) {
          const beat = chart.measureToBeat(obj.measure, obj.fraction);
          lastNote[normalized].endBeat = beat;
        } else {
          const note = objectToNote(obj, noteIdCounter++, chart, channelMapping);
          if (note) {
            notes.push(note);
            if (note.column) lastNote[normalized] = note;
          }
        }
        continue;
      }

      // 채널 01: BGM
      if (channel === '01') {
        const note = objectToNote(obj, noteIdCounter++, chart, channelMapping);
        if (note) notes.push(note);
      }
    }

    // BGM 노트 채널 그룹 할당
    assignBgmChannels(notes);

    // 멀티 키음 그룹화
    const groupedNotes = groupMultiKeysounds(notes);

    return { headers, notes: groupedNotes, timeSignatures, bpmChanges, stopEvents, bgaEvents };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 빈 차트 생성 유틸 (BMSWriter.createEmptyChart 에서 사용)
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
