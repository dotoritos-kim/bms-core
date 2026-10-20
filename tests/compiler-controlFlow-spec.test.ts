// Control-flow behavior checked against the examples of the BMS command memo
// (#RANDOM / #SETRANDOM / #ELSEIF / #ELSE / #END IF / #SWITCH family / test cases).
import { describe, it, expect } from 'vitest';
import { Compiler } from '../src';

/** Returns a deterministic rng that yields `values` in order (and throws when exhausted). */
function seq(...values: number[]) {
    const calls: number[] = [];
    const rng = (max: number) => {
        calls.push(max);
        if (values.length === 0) throw new Error('rng called more often than expected');
        return values.shift() as number;
    };
    return { rng, calls };
}

/** Compiles and returns the applied objects as sorted `MMMCC:VV` strings. */
function objects(text: string, rng: (max: number) => number): string[] {
    const { chart } = Compiler.compile(text, { rng });
    return chart.objects
        .all()
        .map((o) => `${String(o.measure).padStart(3, '0')}${o.channel}:${o.value}`)
        .sort();
}

const lines = (...l: string[]) => l.join('\n');

describe('#RANDOM / #IF / #ENDIF', () => {
    const basic = lines(
        '#00111:11000000',
        '#RANDOM 2',
        '#IF 1',
        '#00112:00220000',
        '#ENDIF',
        '#IF 2',
        '#00113:00003300',
        '#ENDIF',
        '#00114:00000044',
    );

    it('basic example: only the generated label is applied, top level always', () => {
        expect(objects(basic, seq(1).rng)).toEqual(['00111:11', '00112:22', '00114:44']);
        expect(objects(basic, seq(2).rng)).toEqual(['00111:11', '00113:33', '00114:44']);
    });

    const nested = lines(
        '#00111:11000000',
        '#RANDOM 2',
        '#IF 1',
        '#00112:00220000',
        '#RANDOM 2',
        '#IF 1',
        '#00115:00550000',
        '#ENDIF',
        '#IF 2',
        '#00116:00006600',
        '#ENDIF',
        '#ENDRANDOM',
        '#ENDIF',
        '#IF 2',
        '#00113:00003300',
        '#ENDIF',
        '#ENDRANDOM',
        '#00114:00000044',
    );

    it('nested #RANDOM: pattern A / B / C', () => {
        expect(objects(nested, seq(1, 1).rng)).toEqual(['00111:11', '00112:22', '00114:44', '00115:55']);
        expect(objects(nested, seq(1, 2).rng)).toEqual(['00111:11', '00112:22', '00114:44', '00116:66']);
        expect(objects(nested, seq(2).rng)).toEqual(['00111:11', '00113:33', '00114:44']);
    });

    it('a #RANDOM inside an unselected branch does not consume randomness', () => {
        const r = seq(2);
        objects(nested, r.rng);
        expect(r.calls).toEqual([2]);
    });

    it('an inner #IF cannot re-enable lines of an unselected outer branch', () => {
        // Outer picks 2; the inner #RANDOM is inside the skipped #IF 1, so even an
        // inner #IF whose label would match must stay skipped.
        const text = lines(
            '#RANDOM 2',
            '#IF 1',
            '#RANDOM 2',
            '#IF 2',
            '#00115:55',
            '#ELSE',
            '#00116:66',
            '#ENDIF',
            '#ENDRANDOM',
            '#ENDIF',
            '#ENDRANDOM',
            '#00117:77',
        );
        // Every #RANDOM gets value 2 — only top-level #00117 must survive
        expect(Compiler.compile(text, { setrandom: 2 }).chart.objects.all().map((o) => o.value)).toEqual(['77']);
    });

    it('nested #SWITCH inside an unselected #IF is skipped entirely', () => {
        const text = lines(
            '#RANDOM 2',
            '#IF 1',
            '#SWITCH 3',
            '#DEF',
            '#00111:11',
            '#ENDSW',
            '#ENDIF',
            '#ENDRANDOM',
            '#00112:22',
        );
        const r = seq(2);
        expect(objects(text, r.rng)).toEqual(['00112:22']);
        expect(r.calls).toEqual([2]);
    });

    it('lines directly inside #RANDOM (outside #IF) are applied (BM98 / kitchen twies)', () => {
        const text = lines(
            '#RANDOM 2',
            '#00002:0.5',
            '#00003:4F',
            '#IF 1',
            '#00004:01',
            '#ENDIF',
            '#IF 2',
            '#00004:02',
            '#ENDIF',
        );
        const { chart } = Compiler.compile(text, { rng: seq(2).rng });
        expect(chart.timeSignatures.getBeats(0)).toBe(2);
        expect(objects(text, seq(2).rng)).toEqual(['00003:4F', '00004:02']);
    });

    it('an orphan #IF (no #RANDOM) is ignored entirely, including #ELSE', () => {
        const text = lines('#IF 1', '#00111:11', '#ELSE', '#00112:22', '#ENDIF', '#00113:33');
        expect(objects(text, seq().rng)).toEqual(['00113:33']);
    });

    it('#RANDOM without #ENDRANDOM at top level: the next #RANDOM governs following #IFs', () => {
        const text = lines(
            '#RANDOM 2',
            '#IF 1',
            '#00111:11',
            '#ENDIF',
            '#RANDOM 3',
            '#IF 3',
            '#00112:22',
            '#ENDIF',
            '#00113:33',
        );
        expect(objects(text, seq(1, 3).rng)).toEqual(['00111:11', '00112:22', '00113:33']);
        expect(objects(text, seq(2, 1).rng)).toEqual(['00113:33']);
    });

    it('headers are controlled too (randomized #TITLE)', () => {
        const text = lines('#RANDOM 2', '#IF 1', '#TITLE one', '#ENDIF', '#IF 2', '#TITLE two', '#ENDIF', '#ENDRANDOM');
        expect(Compiler.compile(text, { rng: seq(1).rng }).chart.headers.get('title')).toBe('one');
        expect(Compiler.compile(text, { rng: seq(2).rng }).chart.headers.get('title')).toBe('two');
    });
});

describe('#ELSEIF / #ELSE', () => {
    const elseif = lines(
        '#RANDOM 5',
        '#IF 1',
        '#00111:UU',
        '#ELSEIF 2',
        '#00112:VV',
        '#ELSEIF 3',
        '#00113:WW',
        '#ELSE',
        '#00115:ZZ',
        '#ENDIF',
        '#IF 2',
        '#00121:AA',
        '#ELSEIF 2',
        '#00123:BB',
        '#ELSEIF 5',
        '#00125:CC',
        '#ELSE',
        '#00126:DD',
        '#ENDIF',
        '#ENDRANDOM',
    );

    it.each([
        [1, ['00111:UU', '00126:DD']],
        [2, ['00112:VV', '00121:AA']],
        [3, ['00113:WW', '00126:DD']],
        [4, ['00115:ZZ', '00126:DD']],
        [5, ['00115:ZZ', '00125:CC']],
    ])('#ELSEIF example, value %i', (value, expected) => {
        expect(objects(elseif, seq(value).rng)).toEqual(expected);
    });

    const elseExample = lines(
        '#RANDOM 4',
        '#IF 1',
        '#00111:UU',
        '#ELSE',
        '#00112:VV',
        '#ENDIF',
        '#IF 2',
        '#00113:WW',
        '#ELSE',
        '#00114:XX',
        '#ENDIF',
        '#IF 3',
        '#00115:YY',
        '#ELSE',
        '#00116:ZZ',
        '#ENDIF',
        '#ENDRANDOM',
    );

    it.each([
        [1, ['00111:UU', '00114:XX', '00116:ZZ']],
        [2, ['00112:VV', '00113:WW', '00116:ZZ']],
        [3, ['00112:VV', '00114:XX', '00115:YY']],
        [4, ['00112:VV', '00114:XX', '00116:ZZ']],
    ])('#ELSE example, value %i', (value, expected) => {
        expect(objects(elseExample, seq(value).rng)).toEqual(expected);
    });
});

describe('#SETRANDOM / #SETSWITCH in the file', () => {
    it('#SETRANDOM n always selects label n (spec example)', () => {
        const text = lines(
            '// #RANDOM 3',
            '#SETRANDOM 2',
            '#IF 1',
            '#WAV01 a.wav',
            '#ENDIF',
            '#IF 2',
            '#WAV01 b.wav',
            '#ENDIF',
            '#IF 3',
            '#WAV01 c.wav',
            '#ENDIF',
            '#ENDRANDOM',
        );
        const r = seq();
        const { chart } = Compiler.compile(text, { rng: r.rng });
        expect(chart.headers.get('wav01')).toBe('b.wav');
        expect(r.calls).toEqual([]);
    });

    it('#SETSWITCH n always selects #CASE n', () => {
        const text = lines('#SETSWITCH 2', '#CASE 1', '#00111:11', '#SKIP', '#CASE 2', '#00112:22', '#SKIP', '#ENDSW', '#00113:33');
        const r = seq();
        expect(objects(text, r.rng)).toEqual(['00112:22', '00113:33']);
        expect(r.calls).toEqual([]);
    });

    it('options.setrandom still pins every #RANDOM', () => {
        const text = lines('#RANDOM 9', '#IF 7', '#00111:11', '#ENDIF', '#ENDRANDOM');
        expect(Compiler.compile(text, { setrandom: 7 }).chart.objects.all()).toHaveLength(1);
        expect(Compiler.compile(text, { setrandom: 6 }).chart.objects.all()).toHaveLength(0);
    });
});

describe('#SWITCH / #CASE / #SKIP / #DEF / #ENDSW', () => {
    const example = lines(
        '#SWITCH 5',
        '#CASE 1',
        '#00111:XX',
        '#CASE 2',
        '#00112:YY',
        '#SKIP',
        '#CASE 3',
        '#00113:ZZ',
        '#DEF',
        '#00114:AA',
        '#00115:BB',
        '#ENDSW',
        '#00116:CC',
    );

    it.each([
        [1, ['00111:XX', '00112:YY']],
        [2, ['00112:YY']],
        [3, ['00113:ZZ', '00114:AA', '00115:BB']],
        [4, ['00114:AA', '00115:BB']],
        [5, ['00114:AA', '00115:BB']],
    ])('spec example (fallthrough + #DEF), value %i', (value, expected) => {
        // Lines after #ENDSW are top level and always applied
        expect(objects(example, seq(value).rng)).toEqual([...expected, '00116:CC'].sort());
    });

    it('top-level #ENDSW resumes parsing after an unmatched switch', () => {
        const text = lines('#SWITCH 2', '#CASE 1', '#TITLE one', '#SKIP', '#ENDSW', '#ARTIST after', '#00111:11');
        const { chart } = Compiler.compile(text, { rng: seq(2).rng });
        expect(chart.headers.get('title')).toBeUndefined();
        expect(chart.headers.get('artist')).toBe('after');
        expect(chart.objects.all()).toHaveLength(1);
    });

    it('lines between #SWITCH and the first #CASE are not applied', () => {
        const text = lines('#SWITCH 2', '#00110:10', '#CASE 2', '#00111:11', '#ENDSW');
        expect(objects(text, seq(2).rng)).toEqual(['00111:11']);
    });

    // BMIIDXView2010.txt test case from the command memo:
    // #DEF before #CASE, nested #RANDOM without #ENDRANDOM, fallthrough, nested #SWITCH.
    const iidxv = lines(
        '#SWITCH 5',
        '#DEF',
        '#00013:0055',
        '#SKIP',
        '#CASE 1',
        '#00013:0100000000000000',
        '#RANDOM 2',
        '#IF 1',
        '#00014:04',
        '#ELSE',
        '#00014:05',
        '#ENDIF',
        '#CASE 2',
        '#00013:0200000000000000',
        '#SKIP',
        '#CASE 3',
        '#00013:0300000000000000',
        '#SWITCH 2',
        '#CASE 1',
        '#00016:1111',
        '#SKIP',
        '#CASE 2',
        '#00016:2222',
        '#SKIP',
        '#ENDSW',
        '#SKIP',
        '#ENDSW',
    );

    it('IIDXv test case: value 1 → CASE 1 + inner #RANDOM + fallthrough into CASE 2', () => {
        // #00013:01 (CASE 1) and #00013:02 (CASE 2 via fallthrough) occupy the same
        // position, so the later line wins; #00014 proves CASE 1 itself was applied.
        expect(objects(iidxv, seq(1, 1).rng)).toEqual(['00013:02', '00014:04']);
        expect(objects(iidxv, seq(1, 2).rng)).toEqual(['00013:02', '00014:05']);
    });

    it('IIDXv test case: value 1 applies the CASE 1 line before falling through', () => {
        const { chart } = Compiler.compile(iidxv.replace('#00013:0100000000000000', '#00012:0100000000000000'), {
            rng: seq(1, 1).rng,
        });
        const applied = chart.objects.all().map((o) => `${o.channel}:${o.value}`).sort();
        expect(applied).toEqual(['12:01', '13:02', '14:04']);
    });

    it('IIDXv test case: value 2 → CASE 2 only (no #DEF, no inner #RANDOM draw)', () => {
        const r = seq(2);
        expect(objects(iidxv, r.rng)).toEqual(['00013:02']);
        expect(r.calls).toEqual([5]);
    });

    it('IIDXv test case: value 3 → CASE 3 + nested #SWITCH', () => {
        expect(objects(iidxv, seq(3, 1).rng)).toEqual(['00013:03', '00016:11', '00016:11']);
        expect(objects(iidxv, seq(3, 2).rng)).toEqual(['00013:03', '00016:22', '00016:22']);
    });

    it.each([4, 5])('IIDXv test case: value %i → #DEF written before #CASE', (value) => {
        expect(objects(iidxv, seq(value).rng)).toEqual(['00013:55']);
    });

    it('#DEF reached by fallthrough from a matched #CASE', () => {
        const text = lines('#SWITCH 3', '#CASE 1', '#00111:11', '#DEF', '#00112:22', '#SKIP', '#ENDSW');
        expect(objects(text, seq(1).rng)).toEqual(['00111:11', '00112:22']);
        expect(objects(text, seq(2).rng)).toEqual(['00112:22']);
    });

    it('#DEF before #CASE falls through into the next #CASE when #SKIP is omitted', () => {
        const text = lines('#SWITCH 3', '#DEF', '#00110:10', '#CASE 1', '#00111:11', '#SKIP', '#CASE 2', '#00112:22', '#ENDSW');
        expect(objects(text, seq(3).rng)).toEqual(['00110:10', '00111:11']);
        expect(objects(text, seq(2).rng)).toEqual(['00112:22']);
    });

    it('#SKIP inside an unselected #IF does not terminate the case', () => {
        const text = lines(
            '#SWITCH 1',
            '#CASE 1',
            '#RANDOM 2',
            '#IF 1',
            '#SKIP',
            '#ENDIF',
            '#ENDRANDOM',
            '#00111:11',
            '#ENDSW',
        );
        expect(objects(text, seq(1, 2).rng)).toEqual(['00111:11']);
        expect(objects(text, seq(1, 1).rng)).toEqual([]);
    });

    it('#RANDOM nested in #SWITCH nested in #RANDOM', () => {
        const text = lines(
            '#RANDOM 2',
            '#IF 2',
            '#SWITCH 3',
            '#CASE 3',
            '#RANDOM 2',
            '#IF 1',
            '#00111:11',
            '#ENDIF',
            '#ENDRANDOM',
            '#SKIP',
            '#ENDSW',
            '#00112:22',
            '#ENDIF',
            '#ENDRANDOM',
        );
        expect(objects(text, seq(2, 3, 1).rng)).toEqual(['00111:11', '00112:22']);
        expect(objects(text, seq(2, 1).rng)).toEqual(['00112:22']);
        expect(objects(text, seq(1).rng)).toEqual([]);
    });
});

describe('Examples of mistakes', () => {
    it('#END IF closes an #IF like #ENDIF', () => {
        const text = lines('#RANDOM 2', '#IF 1', '#00111:11', '#END IF', '#IF 2', '#00112:22', '#END IF', '#ENDRANDOM', '#00113:33');
        expect(objects(text, seq(1).rng)).toEqual(['00111:11', '00113:33']);
        expect(objects(text, seq(2).rng)).toEqual(['00112:22', '00113:33']);
    });

    it('#IFEND closes an #IF', () => {
        const text = lines('#RANDOM 2', '#IF 1', '#00111:11', '#IFEND', '#00113:33');
        expect(objects(text, seq(2).rng)).toEqual(['00113:33']);
    });

    it('#IF n without #ENDIF: the next #IF is an adjacent sibling', () => {
        const text = lines('#RANDOM 2', '#IF 1', '#00111:11', '#IF 2', '#00112:22', '#ENDIF', '#ENDRANDOM', '#00113:33');
        expect(objects(text, seq(1).rng)).toEqual(['00111:11', '00113:33']);
        expect(objects(text, seq(2).rng)).toEqual(['00112:22', '00113:33']);
    });

    it('#random5 (no delimiter) and #RONDAM n are accepted as #RANDOM', () => {
        const a = lines('#random5', '#IF 5', '#00111:11', '#ENDIF', '#ENDRANDOM');
        const ra = seq(5);
        expect(objects(a, ra.rng)).toEqual(['00111:11']);
        expect(ra.calls).toEqual([5]);
        const b = lines('#rondam 3', '#IF 3', '#00111:11', '#ENDIF');
        expect(objects(b, seq(3).rng)).toEqual(['00111:11']);
        expect(Compiler.compile(a, { rng: seq(5).rng }).chart.headers.get('random5')).toBeUndefined();
    });
});

describe('headers in unselected branches', () => {
    const text = lines(
        '#WAV00 common.wav',
        '#RANDOM 2',
        '#IF 1',
        '#WAV01 a.wav',
        '#BMP01 a.bmp',
        '#ENDIF',
        '#IF 2',
        '#WAV01 b.wav',
        '#BMP01 b.bmp',
        '#WAV02 only-two.wav',
        '#ENDIF',
        '#ENDRANDOM',
    );

    it('#WAVxx/#BMPxx of an unselected branch do not override the selected one', () => {
        const one = Compiler.compile(text, { rng: seq(1).rng }).chart.headers;
        expect(one.get('wav01')).toBe('a.wav');
        expect(one.get('bmp01')).toBe('a.bmp');
        expect(one.get('wav02')).toBeUndefined();
        expect(one.get('wav00')).toBe('common.wav');

        const two = Compiler.compile(text, { rng: seq(2).rng }).chart.headers;
        expect(two.get('wav01')).toBe('b.wav');
        expect(two.get('bmp01')).toBe('b.bmp');
        expect(two.get('wav02')).toBe('only-two.wav');
    });

    it('wavStats counts the ignored definitions', () => {
        const result = Compiler.compile(text, { rng: seq(1).rng });
        expect(result.wavStats.total).toBe(6);
        expect(result.wavStats.inSkippedBlocks).toBe(3);
    });
});
