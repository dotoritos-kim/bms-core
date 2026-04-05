/**
 * BMS Writer Types
 * BMS 파일 쓰기를 위한 타입 정의
 */

import type { BMSNote } from '../parser';

/**
 * BMS Writer 옵션
 */
export interface BMSWriterOptions {
  /** 출력 포맷 (기본: bms) */
  format?: 'bms' | 'bme' | 'bml';
  /** 마디당 기본 분해능 (기본: 192) */
  resolution?: number;
  /** 헤더 순서 커스터마이징 */
  headerOrder?: string[];
  /** 주석 포함 여부 */
  includeComments?: boolean;
  /** 빈 마디 생략 여부 */
  skipEmptyMeasures?: boolean;
  /** 롱노트 출력 형식 (기본: 'channel' = 5x/6x 채널, 'lnobj' = LNOBJ 마커) */
  lnMode?: 'channel' | 'lnobj';
  /** LNOBJ 마커 값 (lnMode='lnobj'일 때 사용, 기본: 헤더의 lnobj 값 또는 미사용 최대 WAV ID) */
  lnObjValue?: string;
}

/**
 * 편집 가능한 BMS 차트 데이터
 */
export interface EditableBMSChart {
  /** 헤더 정보 */
  headers: BMSHeaderData;
  /** 노트 데이터 */
  notes: EditableBMSNote[];
  /** 박자표 (마디별 크기) */
  timeSignatures: Map<number, number>;
  /** BPM 변경 이벤트 */
  bpmChanges: BMSBpmChange[];
  /** STOP 이벤트 */
  stopEvents: BMSStopEvent[];
  /** BGA 이벤트 */
  bgaEvents: BMSBgaEvent[];
}

/**
 * BMS 헤더 데이터
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
  /** WAV 정의 */
  wav: Map<string, string>;
  /** BMP 정의 */
  bmp: Map<string, string>;
  /** BPM 정의 (확장 BPM용) */
  bpmDef: Map<string, number>;
  /** STOP 정의 */
  stopDef: Map<string, number>;
  /** 기타 커스텀 헤더 */
  custom: Map<string, string>;
}

/**
 * 편집 가능한 BMS 노트
 * 파서의 BMSNote를 확장하여 편집에 필요한 정보 추가
 */
export interface EditableBMSNote extends BMSNote {
  /** 고유 ID (편집용) */
  id: string;
  /** Tick position (960 ticks/beat). Primary source of truth in editor. */
  tick: number;
  /** End tick for long notes. */
  endTick?: number;
  /** 노트가 위치한 마디 */
  measure: number;
  /** 마디 내 분수 위치 (0-1) */
  fraction: number;
  /** 원본 채널 */
  channel: string;
  /** 추가 키음 레이어 (멀티 키음 지원) */
  additionalKeysounds?: Array<{
    keysound: string;
    /** 출력 채널 타입 ('invisible' → 3x/4x 채널, 'bgm' → 01 채널) */
    type: 'invisible' | 'bgm';
  }>;
}

/**
 * BPM 변경 이벤트
 */
export interface BMSBpmChange {
  /** 마디 번호 */
  measure: number;
  /** 마디 내 분수 위치 */
  fraction: number;
  /** BPM 값 */
  bpm: number;
  /** 확장 BPM 사용 여부 (채널 08 vs 03) */
  extended?: boolean;
  /** 확장 BPM 정의 키 */
  bpmDefKey?: string;
}

/**
 * STOP 이벤트
 */
export interface BMSStopEvent {
  /** 마디 번호 */
  measure: number;
  /** 마디 내 분수 위치 */
  fraction: number;
  /** STOP 값 (192 = 1 비트) */
  duration: number;
  /** STOP 정의 키 */
  stopDefKey?: string;
}

/**
 * BGA 이벤트
 */
export interface BMSBgaEvent {
  /** 마디 번호 */
  measure: number;
  /** 마디 내 분수 위치 */
  fraction: number;
  /** BMP 정의 키 */
  bmpKey: string;
  /** BGA 레이어 (04: BGA, 06: Poor BGA, 07: Layer) */
  layer: '04' | '06' | '07';
}

/**
 * 채널 데이터 (출력용)
 */
export interface ChannelData {
  /** 채널 번호 (2자리) */
  channel: string;
  /** 마디 번호 */
  measure: number;
  /** 데이터 문자열 */
  data: string;
}

/**
 * 노트 -> 채널 역매핑
 */
export interface ReverseChannelMapping {
  /** 컬럼 ID -> 채널 번호 */
  playable: Map<string, string>;
  /** 컬럼 ID -> 인비저블 채널 번호 */
  invisible: Map<string, string>;
  /** 컬럼 ID -> 지뢰 채널 번호 */
  landmine: Map<string, string>;
  /** 컬럼 ID -> 롱노트 채널 번호 */
  longNote: Map<string, string>;
}
