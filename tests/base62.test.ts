/**
 * #BASE 62 — object IDs are case-sensitive ("0a" != "0A"). Folding their case
 * merged different keysounds (ADiOS: 986 colliding pairs out of 2520 WAVs).
 */
import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, KeySounds, allocateObjectIds, canonicalObjectId, keysoundKey, objectIdIndex } from '../src';

function parse(text: string) {
    const parser = new BMSParser();
    parser.compileString(text);
    return parser.chart!;
}

const BASE62 = [
    '#PLAYER 1',
    '#BPM 120',
    '#BASE 62',
    '#WAV0a lower.wav',
    '#WAV0A upper.wav',
    '#WAVzz last.wav',
    '#00101:0a0A',
    '#00111:zz00',
].join('\n');

describe('#BASE 62 object IDs', () => {
    it('keeps WAV definitions that differ only by case apart', () => {
        const ks = KeySounds.fromBMSChart(parse(BASE62));
        expect(ks.base62).toBe(true);
        expect(ks.get('0a')).toBe('lower.wav');
        expect(ks.get('0A')).toBe('upper.wav');
        expect(ks.get('zz')).toBe('last.wav');
        expect(Object.keys(ks.all()).sort()).toEqual(['0A', '0a', 'zz']);
    });

    it('base36 charts stay case-insensitive', () => {
        const ks = KeySounds.fromBMSChart(parse('#BPM 120\n#WAV0a kick.wav\n#00101:0A'));
        expect(ks.base62).toBe(false);
        expect(ks.get('0A')).toBe('kick.wav');
        expect(ks.get('0a')).toBe('kick.wav');
    });

    it('editable chart and writer round-trip IDs with their case', () => {
        const editable = BMSWriter.fromBMSChart(parse(BASE62));
        expect([...editable.headers.wav.keys()].sort()).toEqual(['0A', '0a', 'zz']);
        expect(editable.notes.map((n) => n.keysound).sort()).toEqual(['0A', '0a', 'zz']);

        const written = new BMSWriter().write(editable);
        expect(written).toContain('#WAV0a lower.wav');
        expect(written).toContain('#WAV0A upper.wav');
        expect(written).toMatch(/#00101:0a0A|#00101:0A0a|#00101:0a\r?\n[\s\S]*#00101:0A/);
        expect(written).toContain('zz');

        const again = BMSWriter.fromBMSChart(parse(written));
        expect([...again.headers.wav.entries()].sort()).toEqual([...editable.headers.wav.entries()].sort());
        expect(again.notes.map((n) => n.keysound).sort()).toEqual(['0A', '0a', 'zz']);
    });

    it('LNOBJ compares case-sensitively in base62', () => {
        const text = ['#BASE 62', '#BPM 120', '#LNOBJ zZ', '#WAV01 a.wav', '#WAVZZ b.wav', '#00111:01ZZ', '#00211:01zZ'].join('\n');
        const editable = BMSWriter.fromBMSChart(parse(text));
        const playable = editable.notes.filter((n) => n.noteType === 'playable');
        // measure 1: "ZZ" is a normal note (not the marker); measure 2: "zZ" ends the LN
        expect(playable.some((n) => n.keysound === 'ZZ' && n.endBeat === undefined)).toBe(true);
        expect(playable.some((n) => n.endBeat !== undefined)).toBe(true);
    });
});

describe('object ID helpers', () => {
    it('allocates base62 IDs beyond the base36 range', () => {
        const used = Array.from({ length: 1295 }, (_, i) => (i + 1).toString(36).toUpperCase().padStart(2, '0'));
        const [next] = allocateObjectIds(used, 1, true);
        expect(next).toBeDefined();
        expect(/[a-z]/.test(next)).toBe(true);
        expect(allocateObjectIds(used, 1, false)).toEqual([]);
    });

    it('canonical / lookup keys and ordering', () => {
        expect(canonicalObjectId('0a', false)).toBe('0A');
        expect(canonicalObjectId('0a', true)).toBe('0a');
        expect(keysoundKey('0A', false)).toBe('0a');
        expect(keysoundKey('0A', true)).toBe('0A');
        expect(objectIdIndex('0Z', true)).toBeLessThan(objectIdIndex('0a', true));
        expect(objectIdIndex('zz', true)).toBe(62 * 62 - 1);
    });
});
