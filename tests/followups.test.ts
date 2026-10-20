// Follow-ups of the spec-compliance pass: header order, #ENDSW recovery,
// public spec constants.
import { describe, it, expect } from 'vitest';
import {
    Compiler,
    BMSParser,
    DEFAULT_BPM,
    LANDMINE_INSTANT_GAMEOVER,
    calculateLandmineDamage,
} from '../src';

const lines = (...l: string[]) => l.join('\n');

function objects(text: string, rng: (max: number) => number): string[] {
    const { chart } = Compiler.compile(text, { rng });
    return chart.objects
        .all()
        .map((o) => `${String(o.measure).padStart(3, '0')}${o.channel}:${o.value}`)
        .sort();
}

describe('BMSHeaders.order — file order of the latest definition', () => {
    it('later definitions have a larger order; absent fields are -1', () => {
        const { chart } = Compiler.compile(lines('#RANK 2', '#DEFEXRANK 120', '#TOTAL 300'));
        expect(chart.headers.order('rank')).toBeLessThan(chart.headers.order('defexrank'));
        expect(chart.headers.order('DEFEXRANK')).toBe(chart.headers.order('defexrank'));
        expect(chart.headers.order('stagefile')).toBe(-1);
    });

    it('a redefinition moves the field to its latest position', () => {
        const { chart } = Compiler.compile(lines('#RANK 2', '#DEFEXRANK 120', '#RANK 3'));
        expect(chart.headers.get('rank')).toBe('3');
        expect(chart.headers.order('rank')).toBeGreaterThan(chart.headers.order('defexrank'));
    });

    it('headers in unselected branches do not affect the order', () => {
        const text = lines('#DEFEXRANK 120', '#RANDOM 2', '#IF 2', '#RANK 1', '#ENDIF', '#ENDRANDOM');
        const { chart } = Compiler.compile(text, { rng: () => 1 });
        expect(chart.headers.order('rank')).toBe(-1);
    });
});

describe('malformed: #SWITCH inside #IF without #ENDSW', () => {
    const text = lines(
        '#RANDOM 2',
        '#IF 1',
        '#SWITCH 2',
        '#CASE 1',
        '#00111:11',
        '#SKIP',
        '#CASE 2',
        '#00112:22',
        // #ENDSW missing
        '#ENDIF',
        '#ENDRANDOM',
        '#00113:33',
    );

    it('#ENDIF closes the open #SWITCH together with the #IF', () => {
        // #IF 1 selected, #CASE 2 selected → 12 + trailing 13
        expect(objects(text, (() => { const v = [1, 2]; return () => v.shift()!; })()))
            .toEqual(['00112:22', '00113:33']);
    });

    it('lines after #ENDIF are applied when the #IF is not selected', () => {
        // #IF 1 not selected (RANDOM → 2): the whole switch is skipped, 13 still applies
        expect(objects(text, () => 2)).toEqual(['00113:33']);
    });

    it('a well-formed #SWITCH inside #IF is unaffected', () => {
        const ok = lines('#RANDOM 1', '#IF 1', '#SWITCH 1', '#CASE 1', '#00111:11', '#ENDSW', '#00112:22', '#ENDIF', '#ENDRANDOM');
        expect(objects(ok, () => 1)).toEqual(['00111:11', '00112:22']);
    });
});

describe('public spec constants', () => {
    it('exports DEFAULT_BPM (130) used by timing for charts without #BPM', () => {
        expect(DEFAULT_BPM).toBe(130);
        const parser = new BMSParser();
        parser.compileString('#WAV01 a.wav\n#00111:01');
        expect(parser.getTiming()!.bpmAtBeat(0)).toBe(DEFAULT_BPM);
    });

    it('exports LANDMINE_INSTANT_GAMEOVER for #WAVZZ mines', () => {
        expect(calculateLandmineDamage('ZZ')).toBe(LANDMINE_INSTANT_GAMEOVER);
        expect(calculateLandmineDamage('00')).toBe(0);
        expect(calculateLandmineDamage('1E')).toBe(25);
    });
});
