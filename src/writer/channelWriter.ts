/**
 * BMS Channel Writer
 * 노트 데이터를 BMS 채널 문자열로 변환
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
 * beat를 measure와 fraction으로 변환 (박자표 고려)
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
 * IIDX SP 역매핑 (컬럼 -> 채널)
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
 * IIDX DP 역매핑
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
 * 최대공약수 계산
 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 분수를 주어진 resolution 기준으로 반올림
 */
function quantizeFraction(fraction: number, resolution: number): number {
  return Math.round(fraction * resolution) / resolution;
}

/** 1 beat = 960 ticks (MIDI 표준) */
const TICKS_PER_BEAT = 960;

/**
 * 0마디부터 targetMeasure 직전까지의 누적 tick 수
 * (tickToFractionInMeasure의 역계산에 필요)
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
 * Tick 기반 fraction 계산 (부동소수점 오차 없음)
 * tick이 있는 노트에서는 이 함수로 fraction을 직접 계산
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
 * 분수들의 최소 분해능 계산 (레거시 — tick 없는 노트용)
 */
function findMinResolution(fractions: number[], maxResolution: number = 192): number {
  if (fractions.length === 0) return 1;

  // 모든 분수를 maxResolution 기준으로 정수로 변환
  const integers = fractions.map((f) => Math.round(f * maxResolution));

  // GCD 계산
  let divisor = maxResolution;
  for (const n of integers) {
    if (n > 0) {
      divisor = gcd(divisor, n);
    }
  }

  return maxResolution / divisor;
}

/**
 * Tick 배열에서 BMS 출력에 필요한 최소 해상도 계산
 * 예: 64분 셋잇단(10ticks) → 3840/gcd(3840,10) = 3840/10 = 384
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
 * 노트 타입에서 채널 매핑 가져오기
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
 * 노트의 채널 번호 결정
 */
function getNoteChannel(
  note: EditableBMSNote,
  mapping: ReverseChannelMapping,
  lnMode: 'channel' | 'lnobj' = 'channel'
): string | null {
  // BGM 노트
  if (note.noteType === 'bgm' || !note.column) {
    return '01';
  }

  // LNOBJ 모드에서는 LN도 playable 채널 사용 (5x/6x 대신 1x/2x)
  const usePlayableForLN = lnMode === 'lnobj' && !!note.endBeat;
  const channelMap = usePlayableForLN
    ? mapping.playable
    : getChannelMap(note.noteType, !!note.endBeat, mapping);

  return channelMap.get(note.column) || null;
}

/**
 * 이벤트 타입 — tick이 있으면 tick 기반 해상도 계산에 사용
 */
type ChannelEvent = {
  fraction: number;
  value: string;
  /** measure 내 tick 오프셋 (tick 데이터 있는 노트만) */
  tickOffset?: number;
  /** 이 마디의 총 tick 수 (tick 데이터 있는 노트만) */
  ticksInMeasure?: number;
};

/**
 * 마디의 채널 데이터 생성
 */
function createChannelDataForMeasure(
  measure: number,
  channel: string,
  events: ChannelEvent[],
  resolution: number
): ChannelData | null {
  if (events.length === 0) return null;

  // tick 데이터가 모든 이벤트에 있으면 tick 기반 최소 해상도 계산 (손실 없음)
  const tickEvents = events.filter(
    (e) => e.tickOffset !== undefined && e.ticksInMeasure !== undefined
  );
  let minRes: number;
  if (tickEvents.length === events.length && tickEvents[0].ticksInMeasure! > 0) {
    const ticks = tickEvents.map((e) => e.tickOffset!);
    const ticksInMeasure = tickEvents[0].ticksInMeasure!;
    minRes = findMinResolutionFromTicks(ticks, ticksInMeasure);
  } else {
    // 레거시 경로: fraction 기반 (최대 192)
    const fractions = events.map((e) => e.fraction);
    minRes = findMinResolution(fractions, resolution);
  }

  // 데이터 배열 생성 (각 슬롯은 2문자)
  const dataArray: string[] = new Array(minRes).fill('00');

  for (const event of events) {
    let slot: number;
    if (event.tickOffset !== undefined && event.ticksInMeasure !== undefined && event.ticksInMeasure > 0) {
      // tick 기반 슬롯 계산 (정확)
      slot = Math.round((event.tickOffset / event.ticksInMeasure) * minRes);
    } else {
      slot = Math.round(event.fraction * minRes);
    }
    if (slot < minRes) {
      dataArray[slot] = event.value;
    }
  }

  // 모든 값이 00이면 null 반환
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
 * 같은 슬롯에 겹치는 이벤트를 여러 레이어로 분리
 * BGM 채널(01)에서 동시에 재생되는 키음을 각각 별도의 #xxx01: 라인으로 출력하기 위함
 */
function splitOverlappingEvents(
  events: ChannelEvent[],
  resolution: number
): Array<ChannelEvent[]> {
  if (events.length === 0) return [];

  // 슬롯별로 이벤트 그룹화
  const slotMap = new Map<number, ChannelEvent[]>();
  for (const event of events) {
    let slot: number;
    if (event.tickOffset !== undefined && event.ticksInMeasure !== undefined && event.ticksInMeasure > 0) {
      // tick 기반 임시 슬롯 (충돌 감지용, 최대 3840 기준)
      slot = Math.round((event.tickOffset / event.ticksInMeasure) * 3840);
    } else {
      slot = Math.round(quantizeFraction(event.fraction, resolution) * resolution);
    }
    if (!slotMap.has(slot)) {
      slotMap.set(slot, []);
    }
    slotMap.get(slot)!.push(event);
  }

  // 겹침이 없으면 단일 레이어 반환
  let maxOverlap = 0;
  for (const group of slotMap.values()) {
    if (group.length > maxOverlap) maxOverlap = group.length;
  }
  if (maxOverlap <= 1) return [events];

  // 레이어별로 분배: 각 슬롯의 n번째 이벤트를 n번째 레이어에 배치
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
 * 노트를 채널 데이터로 변환
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

  // 마디별, 채널별로 노트 그룹화
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
    // tick 데이터 없으면 레거시 양자화 (192 기준)
    const quantizedFraction = tickPos ? noteFraction : quantizeFraction(noteFraction, resolution);

    // tick 기반 이벤트 추가 정보
    const tickOffset = tickPos
      ? (note.tick! - getTotalTicksUpToMeasure(noteMeasure, timeSignatures))
      : undefined;
    const ticksInMeasureForNote = tickPos?.ticksInMeasure;

    // 마디 맵 가져오기/생성
    if (!measureChannelMap.has(noteMeasure)) {
      measureChannelMap.set(noteMeasure, new Map());
    }
    const channelMap = measureChannelMap.get(noteMeasure)!;

    // 채널 이벤트 배열 가져오기/생성
    if (!channelMap.has(channel)) {
      channelMap.set(channel, []);
    }
    const events = channelMap.get(channel)!;

    // 노트 추가
    events.push({
      fraction: quantizedFraction,
      value: note.keysound.toUpperCase().padStart(2, '0').slice(0, 2),
      tickOffset,
      ticksInMeasure: ticksInMeasureForNote,
    });

    // 멀티 키음 레이어 출력 (additionalKeysounds)
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

    // 롱노트 끝 처리
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

      if (lnMode === 'lnobj' && lnObjValue && note.column) {
        // LNOBJ 모드: playable 채널에 LNOBJ 마커를 끝 위치에 기록
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
          });
        }
      } else {
        // 채널 모드: 5x/6x 채널에 끝 이벤트 추가
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
          });
        }
      }
    }
  }

  // 채널 데이터 생성
  for (const [measure, channelMap] of measureChannelMap) {
    for (const [channel, events] of channelMap) {
      // BGM 채널(01)은 같은 슬롯에 여러 이벤트가 겹칠 수 있으므로
      // 레이어별로 분리하여 여러 #xxx01: 라인을 생성해야 함
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

  // 정렬: 마디 번호 -> 채널 번호
  channelDataList.sort((a, b) => {
    if (a.measure !== b.measure) return a.measure - b.measure;
    return a.channel.localeCompare(b.channel);
  });

  return channelDataList;
}

/**
 * BPM 변경 이벤트를 채널 데이터로 변환
 */
export function writeBpmChannels(
  bpmChanges: BMSBpmChange[],
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // 마디별로 그룹화 (채널 03: 직접 BPM, 채널 08: 확장 BPM)
  const measureMap03 = new Map<number, Array<{ fraction: number; value: string }>>();
  const measureMap08 = new Map<number, Array<{ fraction: number; value: string }>>();

  for (const bpmChange of bpmChanges) {
    const quantizedFraction = quantizeFraction(bpmChange.fraction, resolution);

    if (bpmChange.extended && bpmChange.bpmDefKey) {
      // 확장 BPM (채널 08)
      if (!measureMap08.has(bpmChange.measure)) {
        measureMap08.set(bpmChange.measure, []);
      }
      measureMap08.get(bpmChange.measure)!.push({
        fraction: quantizedFraction,
        value: bpmChange.bpmDefKey.toUpperCase().padStart(2, '0'),
      });
    } else {
      // 직접 BPM (채널 03) - 정수만 지원, 1-255 범위
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

  // 채널 03 데이터 생성
  for (const [measure, events] of measureMap03) {
    const channelData = createChannelDataForMeasure(measure, '03', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  // 채널 08 데이터 생성
  for (const [measure, events] of measureMap08) {
    const channelData = createChannelDataForMeasure(measure, '08', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  return channelDataList;
}

/**
 * STOP 이벤트를 채널 데이터로 변환
 */
export function writeStopChannels(
  stopEvents: BMSStopEvent[],
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // 마디별로 그룹화
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

  // 채널 09 데이터 생성
  for (const [measure, events] of measureMap) {
    const channelData = createChannelDataForMeasure(measure, '09', events, resolution);
    if (channelData) channelDataList.push(channelData);
  }

  return channelDataList;
}

/**
 * BGA 이벤트를 채널 데이터로 변환
 */
export function writeBgaChannels(
  bgaEvents: BMSBgaEvent[],
  options: BMSWriterOptions = {}
): ChannelData[] {
  const resolution = options.resolution || 192;
  const channelDataList: ChannelData[] = [];

  // 마디별, 레이어별로 그룹화
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

  // 채널 데이터 생성
  for (const [measure, layerMap] of measureLayerMap) {
    for (const [layer, events] of layerMap) {
      const channelData = createChannelDataForMeasure(measure, layer, events, resolution);
      if (channelData) channelDataList.push(channelData);
    }
  }

  return channelDataList;
}

/**
 * 박자표를 채널 데이터로 변환 (채널 02)
 */
export function writeTimeSignatureChannels(
  timeSignatures: Map<number, number>,
  _options: BMSWriterOptions = {}
): ChannelData[] {
  const channelDataList: ChannelData[] = [];

  for (const [measure, size] of timeSignatures) {
    // 1.0이 아닌 박자표만 출력
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
 * 채널 데이터를 BMS 문자열로 변환
 */
export function channelDataToString(channelData: ChannelData): string {
  const measureStr = channelData.measure.toString().padStart(3, '0');
  return `#${measureStr}${channelData.channel}:${channelData.data}`;
}

/**
 * 채널 데이터 배열을 BMS 문자열 배열로 변환
 */
export function writeChannels(
  chart: EditableBMSChart,
  mapping: ReverseChannelMapping = IIDX_SP_REVERSE,
  options: BMSWriterOptions = {}
): string[] {
  const lines: string[] = [];

  // 주석 추가
  if (options.includeComments) {
    lines.push('');
    lines.push('*---------------------- MAIN DATA FIELD');
    lines.push('');
  }

  // 모든 채널 데이터 수집
  const allChannelData: ChannelData[] = [];

  // 박자표
  allChannelData.push(...writeTimeSignatureChannels(chart.timeSignatures, options));

  // BPM 변경
  allChannelData.push(...writeBpmChannels(chart.bpmChanges, options));

  // STOP 이벤트
  allChannelData.push(...writeStopChannels(chart.stopEvents, options));

  // BGA 이벤트
  allChannelData.push(...writeBgaChannels(chart.bgaEvents, options));

  // 노트
  allChannelData.push(...writeNoteChannels(chart.notes, mapping, options, chart.timeSignatures));

  // 정렬: 마디 번호 -> 채널 번호
  allChannelData.sort((a, b) => {
    if (a.measure !== b.measure) return a.measure - b.measure;
    return a.channel.localeCompare(b.channel);
  });

  // 빈 마디 처리 (옵션에 따라)
  let lastMeasure = -1;
  for (const data of allChannelData) {
    // 마디가 바뀌면 빈 줄 추가
    if (data.measure !== lastMeasure && lastMeasure !== -1 && options.includeComments) {
      lines.push('');
    }
    lastMeasure = data.measure;

    lines.push(channelDataToString(data));
  }

  return lines;
}
