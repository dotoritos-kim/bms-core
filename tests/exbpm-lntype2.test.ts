// #EXBPMxx (alias of #BPMxx) and #LNTYPE 2 (MGQ-notation long notes), checked
// against the examples of the BMS command memo.
import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, Timing, Notes } from '../src';

function parse(text: string) {
  const parser = new BMSParser();
  parser.compileString(text);
  return parser.chart!;
}

const lines = (...l: string[]) => l.join('\n');
const longNotes = (text: string) =>
  Notes.fromBMSChart(parse(text)).all()
    .filter((n) => n.endBeat !== undefined)
    .map((n) => ({ beat: n.beat, endBeat: n.endBeat, keysound: n.keysound, column: n.column }));

describe('#EXBPMxx', () => {
  it('channel 08 resolves #EXBPMxx like #BPMxx', () => {
    const timing = Timing.fromBMSChart(parse(lines('#BPM 120', '#EXBPM01 180.5', '#00108:01')));
    expect(timing.bpmAtBeat(0)).toBe(120);
    expect(timing.bpmAtBeat(4)).toBe(180.5);
  });

  it('#BPMxx wins over #EXBPMxx with the same id', () => {
    const timing = Timing.fromBMSChart(parse(lines('#BPM 120', '#EXBPM01 180', '#BPM01 150', '#00108:01')));
    expect(timing.bpmAtBeat(4)).toBe(150);
  });

  it('an #EXBPMxx BPM change survives an editor save (written as #BPMxx)', () => {
    const text = lines('#BPM 120', '#WAV01 a.wav', '#EXBPM0A 175', '#00108:0A', '#00111:01');
    const editable = BMSWriter.fromBMSChart(parse(text));
    expect(editable.bpmChanges).toEqual([
      expect.objectContaining({ measure: 1, fraction: 0, bpm: 175, extended: true }),
    ]);
    const written = new BMSWriter().write(editable);
    expect(Timing.fromBMSChart(parse(written)).bpmAtBeat(4)).toBe(175);
  });
});

describe('#LNTYPE 2 (MGQ notation)', () => {
  // Memo example (RDM): "#00151:00aa00bb" -> one LN from 1/4 to 3/4 of measure 1.
  it('a run of non-00 objects is one long note that closes at the next 00', () => {
    const mgq = longNotes(lines('#LNTYPE 2', '#WAV22 a.wav', '#00151:00222200'));
    expect(mgq).toEqual([{ beat: 5, endBeat: 7, keysound: '22', column: '1' }]);
  });

  it('continues across bar lines while both sides are non-00', () => {
    // Memo example: LN starts at 1/4 of measure 1 and runs to the 00 in measure 3.
    const mgq = longNotes(lines(
      '#LNTYPE 2', '#WAV22 a.wav',
      '#00151:00222222',
      '#00251:22',
      '#00351:22222200',
    ));
    // start = beat 4 + 1, end = measure 3 + 3/4 (first 00 slot) -> beat 12 + 3
    expect(mgq).toEqual([{ beat: 5, endBeat: 15, keysound: '22', column: '1' }]);
  });

  it('produces the same long notes as the equivalent #LNTYPE 1 chart', () => {
    const mgq = longNotes(lines('#LNTYPE 2', '#WAV22 a.wav', '#WAV33 b.wav', '#00151:0022223300', '#00152:22'));
    const rdm = longNotes(lines('#LNTYPE 1', '#WAV22 a.wav', '#WAV33 b.wav', '#00151:0022000000', '#00151:00000000', '#00152:22'));
    // MGQ: lane 2 LN 22 covers the whole measure; lane 1 LN 22 runs from 1/5 to
    // 4/5 (the 33 slot still extends it — the keysound is the opening one).
    expect(mgq.sort((a, b) => a.beat - b.beat)).toEqual([
      { beat: 4, endBeat: 8, keysound: '22', column: '2' },
      { beat: 4 + 4 / 5, endBeat: 4 + 16 / 5, keysound: '22', column: '1' },
    ]);
    // RDM pairs objects instead (sanity check that the two notations differ).
    expect(rdm).not.toEqual(mgq);
  });

  it('two runs on one lane separated by 00 are two long notes', () => {
    const mgq = longNotes(lines('#LNTYPE 2', '#WAV01 a.wav', '#WAV02 b.wav', '#00151:01010000020200'));
    expect(mgq.map((n) => [n.beat, n.endBeat, n.keysound])).toEqual([
      [4, 4 + 8 / 7, '01'],
      [4 + 16 / 7, 4 + 24 / 7, '02'],
    ]);
  });

  it('#LNTYPE 1 (default) still pairs start/end objects', () => {
    expect(longNotes(lines('#WAV01 a.wav', '#00151:00010001'))).toEqual([
      { beat: 5, endBeat: 7, keysound: '01', column: '1' },
    ]);
  });

  it('an editor save writes the MGQ long notes in RDM notation with #LNTYPE 1', () => {
    const text = lines('#LNTYPE 2', '#BPM 120', '#WAV22 a.wav', '#00151:00222200');
    const written = new BMSWriter().write(BMSWriter.fromBMSChart(parse(text)));
    expect(written).toContain('#LNTYPE 1');
    expect(written).not.toContain('#LNTYPE 2');
    expect(longNotes(written)).toEqual([{ beat: 5, endBeat: 7, keysound: '22', column: '1' }]);
  });
});
