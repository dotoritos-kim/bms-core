import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { BMSParser, BMSWriter, Timing } from '../src';

/**
 * Round-trip verification against real chart files and BMS-spec edge cases.
 *
 * For every input: parse → BMSWriter.fromBMSChart → write → parse again, and
 * check that the second chart carries exactly the same objects (channel,
 * position, value), the same headers that matter for playback, and the same
 * timing (BPM/STOP resolved through Timing). The written text must also be a
 * fixed point: writing the re-parsed chart again yields identical text.
 */

const FILE_INPUTS = [
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-chart.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-4k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-5k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-7k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-9k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-10k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-14k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-24k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-48k.bms',
  'C:/SourceCode/bms-electron-app/tests/e2e/fixtures/test-stress.bms',
  'C:/SourceCode/10k-revive-backend/backend/example/me10k.bms',
  'C:/SourceCode/10k-revive-backend/backend/example/Collection - Piano Beatmap Set (CircusGalop) [10K HELL CIRCUS].bms',
].filter((p) => existsSync(p));

const SYNTHETIC: Record<string, string> = {
  'hex bpm + bpm table + stop + measure length + lnobj + landmine + invisible + bgm layers': `#PLAYER 1
#TITLE Edge
#ARTIST QA
#BPM 150
#BPM01 180.5
#STOP01 96
#WAV01 a.wav
#WAV02 b.wav
#WAVZZ ln.wav
#LNOBJ ZZ
#00102:0.75
#00103:96
#00108:0001
#00109:0100
#00111:0102
#00113:01ZZ
#00116:0100
#00131:0200
#001D1:0000000400
#00101:0102
#00101:0201
#00201:01
#00211:02
`,
  'channel long notes (5x) with lntype 1': `#BPM 120
#LNTYPE 1
#WAV01 a.wav
#00151:01000100
#00152:0100000000000001
#00211:01
`,
  'high resolution (triplets + 64ths) and bpm change mid-measure': `#BPM 120
#WAV01 a.wav
#00111:010101
#00112:01010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101
#00203:78A0
#00211:0100010001000100
`,
  'dp chart with scratch and second player channels': `#PLAYER 3
#BPM 130
#WAV01 a.wav
#00116:01
#00111:0101
#00121:0101
#00126:01
#00128:0001
`,
  'measure length change then restore': `#BPM 120
#WAV01 a.wav
#00102:0.5
#00111:0101
#00202:1.5
#00211:010101
#00311:01
`,
  'header values with unicode and spaces': `#TITLE 発光 テスト  (ANOTHER)
#ARTIST 作者 / obj:誰か
#GENRE ジャンル
#SUBTITLE  spaced  title
#BPM 175
#WAV01 kick 01.wav
#00111:01
`,
};

// Positions are compared at 1e-4 of a measure: the editor stores positions on
// a 960-ticks-per-beat grid (3840 per measure), so charts authored with an
// unusual line resolution (e.g. 1000 slots per measure) are re-quantised by
// up to ~2.6e-4 measure — under 0.1 ms at any playable BPM.
function objKey(o: { channel: string; measure: number; fraction: number; value: string }): string {
  return `${o.channel}:${o.measure}:${o.fraction.toFixed(4)}:${o.value}`;
}
function objPosKey(o: { channel: string; measure: number; fraction: number }): string {
  return `${o.channel}:${o.measure}:${o.fraction.toFixed(4)}`;
}
const TIMING_CHANNELS = new Set(['03', '08', '09']);

function analyse(chart: NonNullable<BMSParser['chart']>) {
  const objects = chart.objects.allSorted();
  const noteKeys = objects.filter((o) => !TIMING_CHANNELS.has(o.channel)).map(objKey).sort();
  const timingPos = objects.filter((o) => TIMING_CHANNELS.has(o.channel)).map(objPosKey).sort();
  const timing = Timing.fromBMSChart(chart);
  const beats = objects.map((o) => chart.measureToBeat(o.measure, o.fraction));
  const maxBeat = beats.length ? Math.max(...beats) : 0;
  const probes = [...new Set([...beats, maxBeat + 4, maxBeat + 8])].sort((a, b) => a - b);
  const seconds = probes.map((b) => timing.beatToSeconds(b));
  const headers: Record<string, string> = {};
  chart.headers.each((k, v) => { headers[k] = v; });
  return { noteKeys, timingPos, probes, seconds, headers, objectCount: objects.length };
}

function diffSets(a: string[], b: string[]) {
  const sa = new Set(a), sb = new Set(b);
  return { onlyA: a.filter((x) => !sb.has(x)).slice(0, 10), onlyB: b.filter((x) => !sa.has(x)).slice(0, 10) };
}

async function parse(text: string) {
  const parser = new BMSParser();
  parser.compileString(text);
  return parser.chart!;
}

async function roundTrip(source: string) {
  const chart1 = await parse(source);
  const editable = BMSWriter.fromBMSChart(chart1);
  const lnobj = editable.headers.lnobj;
  const writer = new BMSWriter({ lnMode: lnobj ? 'lnobj' : 'channel', lnObjValue: lnobj || undefined });
  const written1 = writer.write(editable);
  const chart2 = await parse(written1);
  const editable2 = BMSWriter.fromBMSChart(chart2);
  const written2 = new BMSWriter({ lnMode: lnobj ? 'lnobj' : 'channel', lnObjValue: lnobj || undefined }).write(editable2);
  return { chart1, chart2, written1, written2 };
}

const IMPORTANT_HEADERS = ['title', 'subtitle', 'artist', 'subartist', 'genre', 'bpm', 'playlevel', 'rank', 'total', 'difficulty', 'player', 'lnobj', 'lntype', 'stagefile', 'banner'];

function expectEquivalent(name: string, chart1: NonNullable<BMSParser['chart']>, chart2: NonNullable<BMSParser['chart']>) {
  const a = analyse(chart1);
  const b = analyse(chart2);
  const noteDiff = diffSets(a.noteKeys, b.noteKeys);
  expect(noteDiff, `${name}: note objects differ`).toEqual({ onlyA: [], onlyB: [] });
  expect(a.noteKeys.length, `${name}: note object count`).toBe(b.noteKeys.length);
  const timingDiff = diffSets(a.timingPos, b.timingPos);
  expect(timingDiff, `${name}: timing object positions differ`).toEqual({ onlyA: [], onlyB: [] });
  for (let i = 0; i < a.probes.length; i++) {
    expect(b.seconds[i], `${name}: beatToSeconds(${a.probes[i]})`).toBeCloseTo(a.seconds[i], 6);
  }
  for (const h of IMPORTANT_HEADERS) {
    if (a.headers[h] !== undefined) expect(b.headers[h], `${name}: header #${h.toUpperCase()}`).toBe(a.headers[h]);
  }
  for (const [k, v] of Object.entries(a.headers)) {
    if (/^wav[0-9a-z]{2}$/.test(k)) expect(b.headers[k], `${name}: ${k}`).toBe(v);
  }
}

describe('Writer round-trip — real chart files', () => {
  for (const file of FILE_INPUTS) {
    it(`round-trips ${file.split('/').pop()}`, async () => {
      const buffer = readFileSync(file);
      const parser = new BMSParser();
      const source = await parser.readBuffer(buffer);
      const { chart1, chart2, written1, written2 } = await roundTrip(source);
      expectEquivalent(file, chart1, chart2);
      expect(written2, `${file}: writer output is not a fixed point`).toBe(written1);
    });
  }
});

describe('Writer round-trip — BMS spec edge cases', () => {
  for (const [name, source] of Object.entries(SYNTHETIC)) {
    it(`round-trips: ${name}`, async () => {
      const { chart1, chart2, written1, written2 } = await roundTrip(source);
      expectEquivalent(name, chart1, chart2);
      expect(written2, `${name}: writer output is not a fixed point`).toBe(written1);
    });
  }
});
