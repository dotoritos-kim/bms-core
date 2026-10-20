// Channels the editor does not model must survive load -> save, and 10K (IIDX
// DP 5 keys) 2P notes keep their channels.
import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter } from '../src';

function load(text: string) {
  const parser = new BMSParser();
  parser.compileString(text);
  return BMSWriter.fromBMSChart(parser.chart!);
}

/** Sorted `#MMMCC:data` channel lines of a BMS text. */
function channelLines(text: string, filter?: (ch: string) => boolean): string[] {
  return text
    .split(/\r?\n/)
    .filter((l) => /^#\d{3}[0-9A-Za-z]{2}:/.test(l))
    .filter((l) => !filter || filter(l.slice(4, 6).toUpperCase()))
    .sort();
}

const HEADER = ['#PLAYER 1', '#BPM 120', '#WAV01 a.wav', '#WAV02 b.wav', '#TEXT01 hello', '#EXRANK01 50'];

describe('writer: channels the editor does not model are kept', () => {
  const extra = [
    '#00199:01',            // TEXT
    '#001A0:0001',          // JUDGE (#EXRANK)
    '#00105:00010000',      // seek / extended object
    '#00197:0102',          // BGM volume
    '#0011A:0102',          // extension lane (no column in any style)
    '#00199:00000001',      // second TEXT line in the same measure (shares nothing)
  ];

  it('round-trips 99, A0, 05, 97 and extension lanes verbatim', () => {
    const chart = load([...HEADER, '#00111:01', ...extra].join('\n'));
    expect(chart.extraObjects?.map((o) => o.channel).sort()).toEqual(['05', '1A', '1A', '97', '97', '99', '99', 'A0']);

    const written = new BMSWriter().write(chart);
    const keep = (ch: string) => ['05', '1A', '97', '99', 'A0'].includes(ch);
    const reloaded = channelLines(new BMSWriter().write(load(written)), keep);
    expect(channelLines(written, keep)).toEqual(reloaded);
    // Same objects at the same positions as the source
    const objects = (t: string) => load(t).extraObjects!.map((o) => `${o.measure}:${o.channel}:${o.fraction}:${o.value}`).sort();
    expect(objects(written)).toEqual(objects([...HEADER, ...extra].join('\n')));
  });

  it('an extension-lane object is not turned into a BGM note', () => {
    const chart = load([...HEADER, '#0011A:01'].join('\n'));
    expect(chart.notes.filter((n) => n.noteType === 'bgm')).toHaveLength(0);
    expect(channelLines(new BMSWriter().write(chart))).toEqual(['#0011A:01']);
  });

  it('objects that share a slot (e.g. supplied directly) are written on separate lines', () => {
    // The parser keeps the last object per channel+position (BMS override rule),
    // but an editable chart can carry several; none of them may be lost.
    const chart = load([...HEADER, '#TEXT02 world', '#00111:01'].join('\n'));
    chart.extraObjects = [
      { measure: 2, fraction: 0, channel: '99', value: '01' },
      { measure: 2, fraction: 0, channel: '99', value: '02' },
    ];
    const written = new BMSWriter().write(chart);
    expect(channelLines(written, (ch) => ch === '99')).toEqual(['#00299:01', '#00299:02']);
  });

  it('keeps the parser override rule: the later of two same-slot objects wins', () => {
    const text = [...HEADER, '#TEXT02 world', '#00299:01', '#00299:02'].join('\n');
    expect(channelLines(new BMSWriter().write(load(text)), (ch) => ch === '99')).toEqual(['#00299:02']);
  });

  it('cloneChart copies extraObjects', () => {
    const chart = load([...HEADER, '#00199:01'].join('\n'));
    const clone = BMSWriter.cloneChart(chart);
    expect(clone.extraObjects).toEqual(chart.extraObjects);
    expect(clone.extraObjects).not.toBe(chart.extraObjects);
  });
});

describe('10K (IIDX DP 5 keys + scratch)', () => {
  const TEN_K = [
    '#PLAYER 3', '#BPM 150', '#WAV01 a.wav',
    '#00111:01', '#00115:01', '#00116:01',   // 1P keys 1, 5, scratch
    '#00121:01', '#00125:01', '#00126:01',   // 2P keys 1, 5, scratch
  ].join('\n');

  it('maps 2P keys 21-25 to columns 8-12 and 26 to SC2', () => {
    const cols = load(TEN_K).notes.map((n) => n.column).sort();
    expect(cols).toEqual(['1', '12', '5', '8', 'SC', 'SC2'].sort());
  });

  it('writes the 2P notes back to channels 21-26 (not 18/19)', () => {
    const written = new BMSWriter().write(load(TEN_K));
    expect(channelLines(written)).toEqual(
      ['#00111:01', '#00115:01', '#00116:01', '#00121:01', '#00125:01', '#00126:01'].sort(),
    );
  });
});
