import { describe, it, expect } from 'vitest';
import { BMSWriter } from '../src/writer';
import type { EditableBMSChart, EditableBMSNote, BMSHeaderData } from '../src/writer/types';
import { IIDX_SP_REVERSE } from '../src/writer/channelWriter';

function makeHeaders(overrides: Partial<BMSHeaderData> = {}): BMSHeaderData {
  return {
    player: 1,
    genre: 'Test',
    title: 'LN Test',
    artist: 'Tester',
    bpm: 120,
    playlevel: 5,
    rank: 3,
    total: 300,
    wav: new Map([['01', 'kick.wav'], ['02', 'snare.wav']]),
    bmp: new Map(),
    bpmDef: new Map(),
    stopDef: new Map(),
    custom: new Map(),
    ...overrides,
  };
}

function makeNote(overrides: Partial<EditableBMSNote> = {}): EditableBMSNote {
  return {
    id: 'note-1',
    tick: 0,
    beat: 0,
    measure: 0,
    fraction: 0,
    column: '1',
    noteType: 'playable',
    keysound: '01',
    channel: '11',
    ...overrides,
  } as EditableBMSNote;
}

function makeChart(notes: EditableBMSNote[], headers?: Partial<BMSHeaderData>): EditableBMSChart {
  return {
    headers: makeHeaders(headers),
    notes,
    timeSignatures: new Map(),
    bpmChanges: [{ measure: 0, fraction: 0, bpm: 120 }],
    stopEvents: [],
    bgaEvents: [],
  };
}

describe('BMSWriter LNOBJ mode', () => {
  it('should output LN using 5x/6x channels in default (channel) mode', () => {
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 2,
      column: '1',
      keysound: '01',
    });
    const chart = makeChart([ln]);
    const writer = new BMSWriter({ lnMode: 'channel' });
    const output = writer.write(chart);

    // Should have channel 51 (LN channel for column 1)
    expect(output).toContain('#00051:');
    // Should NOT have LNOBJ header
    expect(output).not.toMatch(/#LNOBJ/);
  });

  it('should output LN using playable channel + LNOBJ marker in lnobj mode', () => {
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 2,
      column: '1',
      keysound: '01',
    });
    const chart = makeChart([ln], { lnobj: 'ZZ' });
    const writer = new BMSWriter({ lnMode: 'lnobj', lnObjValue: 'ZZ' });
    const output = writer.write(chart);

    // Should have channel 11 (playable for column 1), NOT 51
    expect(output).toContain('#00011:');
    expect(output).not.toContain('#00051:');
    // Should have #LNOBJ header
    expect(output).toMatch(/#LNOBJ ZZ/);
    // The end position should have ZZ marker in channel 11
    expect(output).toMatch(/ZZ/);
  });

  it('should auto-assign LNOBJ marker when lnobj value not provided', () => {
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 2,
      column: '1',
      keysound: '01',
    });
    // No lnobj in headers, no lnObjValue in options
    const chart = makeChart([ln]);
    const writer = new BMSWriter({ lnMode: 'lnobj' });
    const output = writer.write(chart);

    // Should have auto-assigned LNOBJ header
    expect(output).toMatch(/#LNOBJ/);
    // Should NOT use 5x/6x channels
    expect(output).not.toContain('#00051:');
  });

  it('should preserve LNOBJ format when original chart has lnobj header', () => {
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 4,
      column: '1',
      keysound: '01',
    });
    const chart = makeChart([ln], { lnobj: 'F1' });
    const writer = new BMSWriter({ lnMode: 'lnobj', lnObjValue: 'F1' });
    const output = writer.write(chart);

    // Original LNOBJ value preserved
    expect(output).toMatch(/#LNOBJ F1/);
    expect(output).toContain('#00011:');
    expect(output).not.toContain('#00051:');
  });

  it('should set #LNTYPE 1 in channel mode when LN notes exist', () => {
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 2,
      column: '1',
      keysound: '01',
    });
    const chart = makeChart([ln]);
    const writer = new BMSWriter({ lnMode: 'channel' });
    const output = writer.write(chart);

    expect(output).toMatch(/#LNTYPE 1/);
  });

  it('should handle mixed normal + LN notes in lnobj mode', () => {
    const normal = makeNote({
      id: 'n-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      column: '2',
      keysound: '02',
    });
    const ln = makeNote({
      id: 'ln-1',
      beat: 0,
      measure: 0,
      fraction: 0,
      endBeat: 2,
      column: '1',
      keysound: '01',
    });
    const chart = makeChart([normal, ln], { lnobj: 'ZZ' });
    const writer = new BMSWriter({ lnMode: 'lnobj', lnObjValue: 'ZZ' });
    const output = writer.write(chart);

    // Normal note on channel 12, LN on channel 11
    expect(output).toContain('#00012:');
    expect(output).toContain('#00011:');
    // No 5x channels
    expect(output).not.toContain('#00051:');
    expect(output).not.toContain('#00052:');
  });
});
