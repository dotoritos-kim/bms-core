import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, styleForKeyMode, columnMappingForStyle } from '../src';
import type { EditableBMSChart, EditableBMSNote, BMSHeaderData } from '../src/writer/types';

function parse(text: string) {
  const parser = new BMSParser();
  parser.compileString(text);
  return parser.chart!;
}

function load(text: string): EditableBMSChart {
  return BMSWriter.fromBMSChart(parse(text));
}

/** write -> parse -> editable */
function reload(chart: EditableBMSChart, writer = new BMSWriter()) {
  const written = writer.write(chart);
  return { written, chart: load(written), warnings: writer.getWarnings() };
}

function headers(overrides: Partial<BMSHeaderData> = {}): BMSHeaderData {
  return {
    player: 1,
    bpm: 120,
    wav: new Map([['01', 'a.wav'], ['02', 'b.wav'], ['03', 'c.wav']]),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(),
    ...overrides,
  };
}

let nextId = 0;
function note(o: Partial<EditableBMSNote> & { tick: number }): EditableBMSNote {
  return {
    id: `n${nextId++}`,
    beat: o.tick / 960,
    measure: -1, // deliberately stale: forces the tick path ("moved in the editor")
    fraction: -1,
    column: '1',
    keysound: '01',
    noteType: 'playable',
    channel: '11',
    ...o,
  } as EditableBMSNote;
}

function chartOf(notes: EditableBMSNote[], extra: Partial<EditableBMSChart> = {}): EditableBMSChart {
  return {
    headers: headers(),
    notes,
    timeSignatures: new Map(),
    bpmChanges: [],
    stopEvents: [],
    bgaEvents: [],
    ...extra,
  };
}

function lines(written: string, re: RegExp): string[] {
  return written.split(/\r?\n/).filter((l) => re.test(l));
}

describe('writer: BPM / STOP definitions (bug 1)', () => {
  const SRC = `#BPM 120
#BPM01 180
#STOP01 96
#WAV01 a.wav
#00108:01
#00109:01
#00211:01
`;

  it('an edited extended BPM gets a key whose header value is the new BPM', () => {
    const chart = load(SRC);
    chart.bpmChanges[0].bpm = 200; // store edit: bpmDefKey stays '01'
    const { chart: back, written } = reload(chart);
    expect(back.bpmChanges.map((b) => b.bpm)).toEqual([200]);
    expect(written).toContain('#BPM01 180'); // existing definition untouched
    expect(written).toContain('#BPM02 200');
    // the caller's chart is not mutated
    expect(chart.bpmChanges[0].bpmDefKey).toBe('01');
    expect([...chart.headers.bpmDef]).toEqual([['01', 180]]);
  });

  it('reuses an existing key that already holds the new value', () => {
    const chart = load(SRC.replace('#BPM01 180', '#BPM01 180\n#BPM05 222'));
    chart.bpmChanges[0].bpm = 222;
    const { written, chart: back } = reload(chart);
    expect(lines(written, /^#00108:/)).toEqual(['#00108:05']);
    expect(back.bpmChanges[0].bpm).toBe(222);
  });

  it('new non-integer / >255 BPMs go to channel 08 instead of being rounded or clamped', () => {
    const chart = chartOf([], {
      bpmChanges: [
        { measure: 0, fraction: 0, bpm: 150 },
        { measure: 1, fraction: 0, bpm: 150.5 },
        { measure: 2, fraction: 0, bpm: 300 },
        { measure: 3, fraction: 0, bpm: 150.5 },
      ],
    });
    const { written, chart: back } = reload(chart);
    expect(back.bpmChanges.map((b) => b.bpm)).toEqual([150, 150.5, 300, 150.5]);
    expect(lines(written, /^#00003:/)).toEqual(['#00003:96']);
    expect(lines(written, /^#BPM\w\w /)).toEqual(['#BPM01 150.5', '#BPM02 300']); // 150.5 shares one key
    expect(chart.headers.bpmDef.size).toBe(0);
  });

  it('new STOPs are written through #STOPxx keys (including fractional durations)', () => {
    const chart = load(SRC);
    chart.stopEvents.push({ measure: 2, fraction: 0.5, duration: 48 });
    chart.stopEvents.push({ measure: 3, fraction: 0, duration: 30.8 });
    chart.stopEvents.push({ measure: 4, fraction: 0, duration: 96 }); // same value as #STOP01
    const { written, chart: back } = reload(chart);
    expect(back.stopEvents.map((s) => s.duration)).toEqual([96, 48, 30.8, 96]);
    expect(lines(written, /^#STOP\w\w /)).toEqual(['#STOP01 96', '#STOP02 48', '#STOP03 30.8']);
    expect(lines(written, /^#00409:/)).toEqual(['#00409:01']);
  });

  it('untouched BPM / STOP events keep their keys and produce no warnings', () => {
    const chart = load(SRC);
    const writer = new BMSWriter();
    const first = writer.write(chart);
    expect(writer.getWarnings()).toEqual([]);
    expect(new BMSWriter().write(load(first))).toBe(first);
    expect(lines(first, /^#001(08|09):/)).toEqual(['#00108:01', '#00109:01']);
  });
});

describe('writer: slot collisions on non-BGM channels (bug 2)', () => {
  it('two notes at the same tick and column keep both keysounds (extra one on BGM)', () => {
    const chart = chartOf([
      note({ tick: 3840, keysound: '01' }),
      note({ tick: 3840, keysound: '02' }),
    ]);
    const { chart: back, warnings, written } = reload(chart);
    const playable = back.notes.filter((n) => n.noteType === 'playable');
    const bgm = back.notes.filter((n) => n.noteType === 'bgm');
    expect(playable.map((n) => n.keysound)).toEqual(['01']);
    expect(bgm.map((n) => [n.keysound, n.tick])).toEqual([['02', 3840]]);
    expect(lines(written, /^#00101:/)).toEqual(['#00101:02']);
    expect(warnings).toEqual([expect.objectContaining({ code: 'slot-collision-rerouted', count: 1 })]);
  });

  it('two invisible keysound layers on one note are both kept', () => {
    const chart = chartOf([
      note({
        tick: 0,
        keysound: '01',
        additionalKeysounds: [
          { keysound: '02', type: 'invisible' },
          { keysound: '03', type: 'invisible' },
        ],
      }),
    ]);
    const { written, warnings } = reload(chart);
    expect(lines(written, /^#00031:/)).toEqual(['#00031:02']);
    expect(lines(written, /^#00001:/)).toEqual(['#00001:03']);
    expect(warnings[0]).toMatchObject({ code: 'slot-collision-rerouted', count: 1 });
  });

  it('a stacked long note is rerouted as a whole, so later long notes keep their pairing', () => {
    const chart = chartOf([
      note({ tick: 0, endTick: 1920, endBeat: 2, keysound: '01' }),
      note({ tick: 0, endTick: 960, endBeat: 1, keysound: '02' }),
      note({ tick: 3840, endTick: 5760, endBeat: 6, keysound: '03' }),
    ]);
    const { chart: back } = reload(chart);
    const lns = back.notes.filter((n) => n.endTick !== undefined).map((n) => [n.tick, n.endTick, n.keysound]);
    expect(lns).toEqual([[0, 1920, '01'], [3840, 5760, '03']]);
    expect(back.notes.filter((n) => n.noteType === 'bgm').map((n) => n.keysound)).toEqual(['02']);
  });

  it('a colliding landmine is dropped (not turned into a BGM sound) with a warning', () => {
    const chart = chartOf([
      note({ tick: 0, noteType: 'landmine', keysound: '01' }),
      note({ tick: 0, noteType: 'landmine', keysound: '02' }),
    ]);
    const { written, warnings } = reload(chart);
    expect(lines(written, /^#000D1:/)).toEqual(['#000D1:01']);
    expect(lines(written, /^#00001:/)).toEqual([]);
    expect(warnings[0]).toMatchObject({ code: 'slot-collision-dropped', count: 1 });
  });
});

describe('writer: LN end meeting the next LN start in the same lane (bug 3)', () => {
  for (const lnMode of ['channel', 'lnobj'] as const) {
    it(`${lnMode} mode: shortens the end by 1/192 measure and keeps every LN paired`, () => {
      const chart = chartOf([
        note({ tick: 0, endTick: 1920, endBeat: 2, keysound: '01' }),
        note({ tick: 1920, endTick: 3840, endBeat: 4, keysound: '02' }),
        note({ tick: 3840, endTick: 5760, endBeat: 6, keysound: '03' }),
        note({ tick: 7680, endTick: 8640, endBeat: 9, keysound: '01' }),
      ]);
      const writer = new BMSWriter({ lnMode, lnObjValue: lnMode === 'lnobj' ? 'ZZ' : undefined });
      const { chart: back, warnings } = reload(chart, writer);
      const lns = back.notes
        .filter((n) => n.endTick !== undefined)
        .map((n) => [n.tick, n.endTick, n.keysound]);
      expect(lns).toEqual([
        [0, 1900, '01'],
        [1920, 3820, '02'],
        [3840, 5760, '03'],
        [7680, 8640, '01'],
      ]);
      expect(warnings).toEqual([expect.objectContaining({ code: 'ln-end-shortened', count: 2 })]);
    });
  }

  it('lnobj mode: an LN end meeting a normal note is shortened too', () => {
    const chart = chartOf([
      note({ tick: 0, endTick: 1920, endBeat: 2, keysound: '01' }),
      note({ tick: 1920, keysound: '02' }),
    ]);
    const { chart: back } = reload(chart, new BMSWriter({ lnMode: 'lnobj', lnObjValue: 'ZZ' }));
    expect(back.notes.map((n) => [n.tick, n.endTick, n.keysound])).toEqual([
      [0, 1900, '01'],
      [1920, undefined, '02'],
    ]);
  });

  it('uses the real measure length for the 1/192 step (3/4 measure: 15 ticks)', () => {
    const chart = chartOf(
      [
        note({ tick: 0, endTick: 1440, endBeat: 1.5, keysound: '01' }),
        note({ tick: 1440, endTick: 2400, endBeat: 2.5, keysound: '02' }),
      ],
      { timeSignatures: new Map([[0, 0.75]]) }
    );
    const { chart: back } = reload(chart);
    expect(back.notes.map((n) => [n.tick, n.endTick])).toEqual([[0, 1425], [1440, 2400]]);
  });
});

describe('writer: end data only makes playable notes long notes (bug 4)', () => {
  for (const lnMode of ['channel', 'lnobj'] as const) {
    it(`${lnMode} mode: invisible / landmine notes with endTick stay on their own channels`, () => {
      const chart = chartOf([
        note({ tick: 0, endTick: 1920, endBeat: 2, noteType: 'invisible', keysound: '02' }),
        note({ tick: 960, endTick: 1920, endBeat: 2, noteType: 'landmine', column: '2', keysound: '03' }),
      ]);
      const writer = new BMSWriter({ lnMode, lnObjValue: lnMode === 'lnobj' ? 'ZZ' : undefined });
      const { written } = reload(chart, writer);
      const data = lines(written, /^#\d{3}[0-9A-Z]{2}:/);
      expect(data).toEqual(['#00031:02', '#000D2:00030000']);
      expect(written).not.toMatch(/#LNTYPE/);
    });
  }
});

describe('writer: line resolution from the real measure length (bug 5)', () => {
  it('3/4 measure with triplets every 320 ticks is written on a 9-slot line', () => {
    const notes = [0, 320, 640, 960, 1280, 1600, 1920, 2240, 2560].map((t) => note({ tick: t }));
    const chart = chartOf(notes, { timeSignatures: new Map([[0, 0.75]]) });
    const { written, chart: back } = reload(chart);
    expect(lines(written, /^#00011:/)).toEqual(['#00011:010101010101010101']);
    expect(back.notes.map((n) => n.tick)).toEqual(notes.map((n) => n.tick));
  });

  it('4/4 measures are unchanged (64th triplets -> 384 slots)', () => {
    const chart = chartOf([note({ tick: 0 }), note({ tick: 10 })]);
    const { written } = reload(chart);
    expect(lines(written, /^#00011:/)[0].length).toBe('#00011:'.length + 384 * 2);
  });
});

describe('writer: measure range and large charts (bug 6)', () => {
  it('notes beyond measure 999 are skipped with a warning instead of landing in measure 0', () => {
    const lastMeasureTick = 999 * 3840;
    const chart = chartOf([
      note({ tick: 960, keysound: '01' }),
      note({ tick: lastMeasureTick, keysound: '02' }),
      note({ tick: 1000 * 3840, keysound: '03' }),
      note({ tick: 5000 * 3840, keysound: '03' }),
    ]);
    const { written, warnings } = reload(chart);
    expect(lines(written, /^#\d{5}:/)).toEqual(['#00011:00010000', '#99911:02']);
    expect(warnings).toEqual([expect.objectContaining({ code: 'out-of-range', count: 2 })]);
  });

  it('writes a long chart with many measures and notes quickly', () => {
    const notes: EditableBMSNote[] = [];
    for (let i = 0; i < 25000; i++) {
      notes.push(note({ tick: i * 120, column: String((i % 7) + 1), channel: '1' + ((i % 7) + 1) }));
    }
    const timeSignatures = new Map<number, number>();
    for (let m = 0; m < 1000; m += 3) timeSignatures.set(m, 0.75);
    const chart = chartOf(notes, { timeSignatures });
    const start = performance.now();
    const written = new BMSWriter().write(chart);
    const elapsed = performance.now() - start;
    const back = load(written);
    expect(back.notes.length).toBe(25000);
    expect(back.notes.map((n) => n.tick)).toEqual(notes.map((n) => n.tick));
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('8K key mode (Qwilight #8K)', () => {
  it('writes the 8 lanes on 16, 11-15, 18, 19 and reads them back', () => {
    const lanes = ['SC', '1', '2', '3', '4', '5', '6', '7'];
    const notes = lanes.map((column, i) => note({ tick: i * 240, column }));
    const { written, chart, warnings } = reload(chartOf(notes, { style: styleForKeyMode('8K') }));
    for (const ch of ['16', '11', '12', '13', '14', '15', '18', '19']) {
      expect(written).toMatch(new RegExp(`#000${ch}:`));
    }
    expect(written).not.toMatch(/#00017:/);
    expect(warnings).toEqual([]);
    expect(chart.notes.filter((n) => n.noteType === 'playable').map((n) => n.column).sort())
      .toEqual([...lanes].sort());
  });

  it('warns when a note lane has no channel instead of dropping it silently', () => {
    const writer = new BMSWriter();
    writer.write(chartOf([note({ tick: 0, column: '8' })], { style: { id: 'iidx', isDP: false } }));
    expect(writer.getWarnings().map((w) => w.code)).toEqual(['unmapped-lane']);
  });
});

describe('value-less extension commands', () => {
  it('keeps #4K / #6K / #8K through a save', () => {
    for (const cmd of ['4K', '6K', '8K']) {
      const { written, chart } = reload(load(`#PLAYER 1\n#${cmd}\n#WAV01 a.wav\n#00111:01\n`));
      expect(written.split(/\r?\n/)).toContain(`#${cmd}`);
      expect(chart.headers.custom.has(cmd)).toBe(true);
    }
  });

  it('BMSHeaders.has sees a value-less command that get() reports as undefined', () => {
    const headers = parse('#PLAYER 1\n#6K\n').headers;
    expect(headers.get('6K')).toBeUndefined();
    expect(headers.has('6K')).toBe(true);
    expect(headers.has('6k')).toBe(true);
    expect(headers.has('4K')).toBe(false);
  });
});

describe('columnMappingForStyle', () => {
  it('maps channels to the columns of the requested layout', () => {
    expect(columnMappingForStyle({ id: 'keyboard', isDP: false })['16']).toBe('6');
    expect(columnMappingForStyle({ id: 'iidx', isDP: false })['16']).toBe('SC');
    expect(columnMappingForStyle({ id: 'iidx', isDP: false })['21']).toBeUndefined();
    expect(columnMappingForStyle({ id: 'keyboard', isDP: true })['23']).toBe('12');
  });
});

describe('fromBMSChart with a requested layout', () => {
  // Keyboard 8K with lanes 6 and 7 empty: channel 18 alone reads as IIDX lane 6.
  const text = '#PLAYER 1\n#WAV01 a.wav\n#00111:01\n#00118:0001\n#00158:01000100\n';

  it('auto-detects IIDX when no layout is given', () => {
    const chart = BMSWriter.fromBMSChart(parse(text));
    expect(chart.style).toEqual({ id: 'iidx', isDP: false });
    expect(chart.notes.map((n) => n.column).sort()).toEqual(['1', '6', '6']);
  });

  it('reads every lane object with the requested layout, LNs included', () => {
    const chart = BMSWriter.fromBMSChart(parse(text), { id: 'keyboard', isDP: false });
    expect(chart.style).toEqual({ id: 'keyboard', isDP: false });
    expect(chart.notes.map((n) => n.column).sort()).toEqual(['1', '8', '8']);
    expect(chart.extraObjects ?? []).toEqual([]);
  });
});
