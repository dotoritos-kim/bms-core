/**
 * BMS Header Writer
 * BMSHeaderData를 BMS 헤더 문자열로 변환
 */

import type { BMSHeaderData, BMSWriterOptions } from './types';

/** 기본 헤더 순서 */
const DEFAULT_HEADER_ORDER = [
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

/**
 * 헤더 값을 BMS 형식으로 포맷팅
 */
function formatHeaderValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const upperKey = key.toUpperCase();

  // 숫자 값 처리
  if (typeof value === 'number') {
    // BPM은 소수점 유지
    if (upperKey === 'BPM') {
      return `#${upperKey} ${value}`;
    }
    // 정수 값
    return `#${upperKey} ${Math.floor(value)}`;
  }

  // 문자열 값
  return `#${upperKey} ${value}`;
}

/**
 * WAV/BMP/BPM/STOP 정의 생성
 */
function formatDefinitions(
  prefix: string,
  definitions: Map<string, string | number>
): string[] {
  const lines: string[] = [];

  // 키 정렬 (00-ZZ 순서)
  const sortedKeys = Array.from(definitions.keys()).sort((a, b) => {
    const aNum = parseInt(a, 36);
    const bNum = parseInt(b, 36);
    return aNum - bNum;
  });

  for (const key of sortedKeys) {
    const value = definitions.get(key);
    if (value !== undefined && value !== null && value !== '') {
      lines.push(`#${prefix}${key.toUpperCase()} ${value}`);
    }
  }

  return lines;
}

/**
 * BMSHeaderData를 BMS 헤더 문자열 배열로 변환
 */
export function writeHeaders(
  headers: BMSHeaderData,
  options: BMSWriterOptions = {}
): string[] {
  const lines: string[] = [];
  const headerOrder = options.headerOrder || DEFAULT_HEADER_ORDER;

  // 주석 추가
  if (options.includeComments) {
    lines.push('');
    lines.push('*---------------------- HEADER FIELD');
    lines.push('');
  }

  // 기본 헤더 순서대로 출력
  for (const key of headerOrder) {
    const value = headers[key as keyof BMSHeaderData];

    // Map 타입은 별도 처리
    if (value instanceof Map) continue;

    const formatted = formatHeaderValue(key, value);
    if (formatted) {
      lines.push(formatted);
    }
  }

  // 커스텀 헤더 추가
  if (headers.custom && headers.custom.size > 0) {
    if (options.includeComments) {
      lines.push('');
      lines.push('*---------------------- CUSTOM HEADERS');
    }

    for (const [key, value] of headers.custom) {
      if (value) {
        lines.push(`#${key.toUpperCase()} ${value}`);
      }
    }
  }

  // 빈 줄 추가
  lines.push('');

  // BPM 정의 (확장 BPM용)
  if (headers.bpmDef && headers.bpmDef.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- BPM DEFINITIONS');
    }
    lines.push(...formatDefinitions('BPM', headers.bpmDef as Map<string, string | number>));
    lines.push('');
  }

  // STOP 정의
  if (headers.stopDef && headers.stopDef.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- STOP DEFINITIONS');
    }
    lines.push(...formatDefinitions('STOP', headers.stopDef as Map<string, string | number>));
    lines.push('');
  }

  // WAV 정의
  if (headers.wav && headers.wav.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- WAV DEFINITIONS');
    }
    lines.push(...formatDefinitions('WAV', headers.wav as Map<string, string | number>));
    lines.push('');
  }

  // BMP 정의
  if (headers.bmp && headers.bmp.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- BMP DEFINITIONS');
    }
    lines.push(...formatDefinitions('BMP', headers.bmp as Map<string, string | number>));
    lines.push('');
  }

  return lines;
}

/**
 * 빈 BMSHeaderData 생성
 */
export function createEmptyHeaders(): BMSHeaderData {
  return {
    player: 1,
    genre: '',
    title: '',
    subtitle: '',
    artist: '',
    subartist: '',
    bpm: 120,
    playlevel: 1,
    rank: 3,
    total: undefined,
    difficulty: undefined,
    stagefile: '',
    banner: '',
    backbmp: '',
    lntype: undefined,
    lnobj: '',
    wav: new Map(),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(),
  };
}

/**
 * BMSHeaders 객체에서 BMSHeaderData로 변환
 */
export function parseHeadersToData(
  headers: { get: (name: string) => string | undefined; each: (callback: (key: string, value: string) => void) => void }
): BMSHeaderData {
  const data = createEmptyHeaders();

  headers.each((key, value) => {
    const lowerKey = key.toLowerCase();

    // WAV 정의
    if (lowerKey.startsWith('wav')) {
      const wavKey = key.slice(3).toUpperCase();
      if (wavKey) {
        data.wav.set(wavKey, value);
      }
      return;
    }

    // BMP 정의
    if (lowerKey.startsWith('bmp')) {
      const bmpKey = key.slice(3).toUpperCase();
      if (bmpKey) {
        data.bmp.set(bmpKey, value);
      }
      return;
    }

    // BPM 정의 (확장 BPM)
    if (lowerKey.startsWith('bpm') && lowerKey.length > 3) {
      const bpmKey = key.slice(3).toUpperCase();
      if (bpmKey) {
        data.bpmDef.set(bpmKey, parseFloat(value));
      }
      return;
    }

    // STOP 정의
    if (lowerKey.startsWith('stop')) {
      const stopKey = key.slice(4).toUpperCase();
      if (stopKey) {
        data.stopDef.set(stopKey, parseInt(value, 10));
      }
      return;
    }

    // 기본 헤더
    switch (lowerKey) {
      case 'player':
        data.player = parseInt(value, 10);
        break;
      case 'genre':
        data.genre = value;
        break;
      case 'title':
        data.title = value;
        break;
      case 'subtitle':
        data.subtitle = value;
        break;
      case 'artist':
        data.artist = value;
        break;
      case 'subartist':
        data.subartist = value;
        break;
      case 'bpm':
        data.bpm = parseFloat(value);
        break;
      case 'playlevel':
        data.playlevel = parseInt(value, 10);
        break;
      case 'rank':
        data.rank = parseInt(value, 10);
        break;
      case 'total':
        data.total = parseFloat(value);
        break;
      case 'difficulty':
        data.difficulty = parseInt(value, 10);
        break;
      case 'stagefile':
        data.stagefile = value;
        break;
      case 'banner':
        data.banner = value;
        break;
      case 'backbmp':
        data.backbmp = value;
        break;
      case 'lntype':
        data.lntype = parseInt(value, 10);
        break;
      case 'lnobj':
        data.lnobj = value;
        break;
      default:
        // 알려지지 않은 헤더는 커스텀으로 저장
        if (!lowerKey.startsWith('wav') && !lowerKey.startsWith('bmp')) {
          data.custom.set(key.toUpperCase(), value);
        }
        break;
    }
  });

  return data;
}
