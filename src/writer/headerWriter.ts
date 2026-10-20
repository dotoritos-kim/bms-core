/**
 * BMS Header Writer
 * Converts BMSHeaderData into BMS header strings
 */

import type { BMSHeaderData, BMSWriterOptions } from './types';

/** Default header order */
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
 * Formats a header value in BMS format
 */
function formatHeaderValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const upperKey = key.toUpperCase();

  // Handle numeric values
  if (typeof value === 'number') {
    // BPM keeps its decimal places
    if (upperKey === 'BPM') {
      return `#${upperKey} ${value}`;
    }
    // Integer values
    return `#${upperKey} ${Math.floor(value)}`;
  }

  // String values
  return `#${upperKey} ${value}`;
}

/**
 * Generates WAV/BMP/BPM/STOP definitions
 */
function formatDefinitions(
  prefix: string,
  definitions: Map<string, string | number>
): string[] {
  const lines: string[] = [];

  // Sort keys (00-ZZ order)
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
 * Converts BMSHeaderData into an array of BMS header strings
 */
export function writeHeaders(
  headers: BMSHeaderData,
  options: BMSWriterOptions = {}
): string[] {
  const lines: string[] = [];
  const headerOrder = options.headerOrder || DEFAULT_HEADER_ORDER;

  // Add comments
  if (options.includeComments) {
    lines.push('');
    lines.push('*---------------------- HEADER FIELD');
    lines.push('');
  }

  // Write in default header order
  for (const key of headerOrder) {
    const value = headers[key as keyof BMSHeaderData];

    // Map types are handled separately
    if (value instanceof Map) continue;

    const formatted = formatHeaderValue(key, value);
    if (formatted) {
      lines.push(formatted);
    }
  }

  // Add custom headers
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

  // Add a blank line
  lines.push('');

  // BPM definitions (for extended BPM)
  if (headers.bpmDef && headers.bpmDef.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- BPM DEFINITIONS');
    }
    lines.push(...formatDefinitions('BPM', headers.bpmDef as Map<string, string | number>));
    lines.push('');
  }

  // STOP definitions
  if (headers.stopDef && headers.stopDef.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- STOP DEFINITIONS');
    }
    lines.push(...formatDefinitions('STOP', headers.stopDef as Map<string, string | number>));
    lines.push('');
  }

  // WAV definitions
  if (headers.wav && headers.wav.size > 0) {
    if (options.includeComments) {
      lines.push('*---------------------- WAV DEFINITIONS');
    }
    lines.push(...formatDefinitions('WAV', headers.wav as Map<string, string | number>));
    lines.push('');
  }

  // BMP definitions
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
 * Creates an empty BMSHeaderData
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
 * Converts a BMSHeaders object into BMSHeaderData
 */
export function parseHeadersToData(
  headers: { get: (name: string) => string | undefined; each: (callback: (key: string, value: string) => void) => void }
): BMSHeaderData {
  const data = createEmptyHeaders();

  headers.each((key, value) => {
    const lowerKey = key.toLowerCase();

    // WAV definitions
    if (lowerKey.startsWith('wav')) {
      const wavKey = key.slice(3).toUpperCase();
      if (wavKey) {
        data.wav.set(wavKey, value);
      }
      return;
    }

    // BMP definitions
    if (lowerKey.startsWith('bmp')) {
      const bmpKey = key.slice(3).toUpperCase();
      if (bmpKey) {
        data.bmp.set(bmpKey, value);
      }
      return;
    }

    // BPM definitions (extended BPM)
    if (lowerKey.startsWith('bpm') && lowerKey.length > 3) {
      const bpmKey = key.slice(3).toUpperCase();
      if (bpmKey) {
        data.bpmDef.set(bpmKey, parseFloat(value));
      }
      return;
    }

    // STOP definitions
    if (lowerKey.startsWith('stop')) {
      const stopKey = key.slice(4).toUpperCase();
      if (stopKey) {
        // parseFloat: fractional STOP values (e.g. 30.8) are valid and must survive a reload
        data.stopDef.set(stopKey, parseFloat(value));
      }
      return;
    }

    // Standard headers
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
        // Unknown headers are stored as custom
        if (!lowerKey.startsWith('wav') && !lowerKey.startsWith('bmp')) {
          data.custom.set(key.toUpperCase(), value);
        }
        break;
    }
  });

  return data;
}
