/**
 * Saving must not move anything in time: positions off the 960-ticks-per-beat
 * grid, measures whose length is not a whole number of ticks, and BPM / STOP /
 * BGA objects are written back exactly where they were.
 */
import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter } from '../src';

const HEAD = `#PLAYER 1
#BPM 150
#WAV01 a.wav
#WAV02 b.wav
#BMP01 a.png
#BPM01 175.5
#STOP01 96
`;

/** Line of `n` slots with `01` at the given slots. */
function line(n: number, ...slots: number[]): string {
  return Array.from({ length: n }, (_, i) => (slots.includes(i) ? '01' : '00')).join('');
}

function roundTrip(bms: string): string {
  const parser = new BMSParser();
  parser.compileString(bms);
  return new BMSWriter().write(BMSWriter.fromBMSChart(parser.chart!));
}

/** Every object as "seconds:channel:value" (time includes BPM changes and STOPs). */
function timeline(bms: string): string[] {
  const parser = new BMSParser();
  const chart = parser.compileString(bms);
  const timing = parser.getTiming()!;
  return chart.objects
    .all()
    .map((o) => `${timing.beatToSeconds(chart.measureToBeat(o.measure, o.fraction)).toFixed(9)}:${o.channel}:${o.value}`)
    .sort();
}

function channelLines(bms: string): string[] {
  return bms.split(/\r?\n/).filter((l) => /^#\d{5}:/.test(l));
}

describe('Writer keeps timing exact', () => {
  it('notes after measures of a non-tick length stay at their barline', () => {
    // 0.333 measures are 1278.72 ticks long: rounding each length drifted the
    // measure starts away from the notes and moved them into the measure before.
    const bms = HEAD + `
#00102:0.333
#00202:0.333
#00302:0.333
#00111:01
#00211:01
#00311:01
#00411:01
#00511:0101010101010101
`;
    const out = roundTrip(bms);
    expect(channelLines(out)).toEqual(expect.arrayContaining([
      '#00211:01', '#00311:01', '#00411:01', '#00511:0101010101010101',
    ]));
    expect(timeline(out)).toEqual(timeline(bms));
  });

  it('keeps a BPM change and a STOP between 1/192 lines', () => {
    const bms = HEAD + `
#00208:${line(384, 1)}
#00309:${line(7, 1)}
#00311:01
#00411:01
`;
    const out = roundTrip(bms);
    expect(timeline(out)).toEqual(timeline(bms));
    expect(out).toContain(`#00309:${line(7, 1)}`);
  });

  it('does not drop a BPM change in the last slot of a fine line', () => {
    // 383/384 used to round to 192/192: a slot past the end of the line.
    const bms = HEAD + `
#00208:${line(384, 383)}
#00311:01
`;
    const out = roundTrip(bms);
    expect(out).toMatch(/^#00208:/m);
    expect(timeline(out)).toEqual(timeline(bms));
  });

  it('keeps BGA changes on a septuplet line', () => {
    const bms = HEAD + `
#00204:${line(7, 3)}
`;
    expect(roundTrip(bms)).toContain(`#00204:${line(7, 3)}`);
  });

  it('a note added next to septuplets keeps them on their line', () => {
    const parser = new BMSParser();
    parser.compileString(HEAD + '\n#00211:01010101010101\n');
    const chart = BMSWriter.fromBMSChart(parser.chart!);
    // Placed in the editor: tick only, 3/4 into measure 2
    chart.notes.push({
      id: 'new', beat: 11, tick: 11 * 960, column: chart.notes[0].column, noteType: 'playable',
      keysound: '02', channel: '',
    } as (typeof chart.notes)[number]);
    const out = new BMSWriter().write(chart);
    // lcm(7, 4) = 28 slots: septuplets at every 4th slot, the new note at 21
    const expected = Array.from({ length: 28 }, (_, i) => (i === 21 ? '02' : i % 4 === 0 ? '01' : '00')).join('');
    expect(out).toContain(`#00211:${expected}`);
  });
});
