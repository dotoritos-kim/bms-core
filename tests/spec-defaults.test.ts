import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, Timing, Notes } from '../src';
import { calculateLandmineDamage, LANDMINE_INSTANT_GAMEOVER } from '../src/parser/modules/notes/channels';

function parse(text: string) {
  const parser = new BMSParser();
  parser.compileString(text);
  return parser.chart!;
}

describe('#BPM default (spec: 130 when omitted)', () => {
  it('timing uses 130 BPM when #BPM is missing', () => {
    const timing = Timing.fromBMSChart(parse('#WAV01 a.wav\n#00111:01'));
    expect(timing.bpmAtBeat(0)).toBe(130);
  });

  it('writer writes #BPM 130 for a chart without #BPM, so timing survives a save', () => {
    const chart = parse('#WAV01 a.wav\n#00111:01');
    const written = new BMSWriter().write(BMSWriter.fromBMSChart(chart));
    expect(written).toContain('#BPM 130');
    const reloaded = Timing.fromBMSChart(parse(written));
    expect(reloaded.bpmAtBeat(0)).toBe(Timing.fromBMSChart(chart).bpmAtBeat(0));
  });

  it('writer keeps an explicit #BPM', () => {
    const chart = parse('#BPM 150\n#WAV01 a.wav\n#00111:01');
    expect(new BMSWriter().write(BMSWriter.fromBMSChart(chart))).toContain('#BPM 150');
  });
});

describe('calculateLandmineDamage (spec: base-36 value / 2 %, ZZ = game over)', () => {
  it('1E (base-36 50) deals 25%', () => {
    expect(calculateLandmineDamage('1E')).toBe(25);
  });

  it('decodes base-36 for small and lowercase values', () => {
    expect(calculateLandmineDamage('01')).toBe(0.5);
    expect(calculateLandmineDamage('0A')).toBe(5);
    expect(calculateLandmineDamage('1e')).toBe(25);
  });

  it('00 and invalid values deal no damage', () => {
    expect(calculateLandmineDamage('00')).toBe(0);
    expect(calculateLandmineDamage('')).toBe(0);
    expect(calculateLandmineDamage('!!')).toBe(0);
  });

  it('caps non-ZZ damage at 100%', () => {
    expect(calculateLandmineDamage('2S')).toBe(50); // 100 / 2
    expect(calculateLandmineDamage('ZY')).toBe(100); // 1294 / 2 -> capped
  });

  it('ZZ (either case) is an instant game over', () => {
    expect(calculateLandmineDamage('ZZ')).toBe(LANDMINE_INSTANT_GAMEOVER);
    expect(calculateLandmineDamage('zz')).toBe(LANDMINE_INSTANT_GAMEOVER);
    expect(Number.isFinite(LANDMINE_INSTANT_GAMEOVER)).toBe(false);
  });

  it('parsed D-channel landmines carry the spec damage', () => {
    const chart = parse('#BPM 120\n#WAV00 boom.wav\n#001D1:1E00ZZ00');
    const mines = Notes.fromBMSChart(chart).all().filter(n => n.noteType === 'landmine');
    expect(mines.map(m => m.damage)).toEqual([25, LANDMINE_INSTANT_GAMEOVER]);
  });
});
