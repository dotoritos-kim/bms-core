// BGM channel (01) objects remember which `#xxx01:` line of their measure they
// came from, so editors can show the BGM columns (B1, B2, …) as written.
import { describe, it, expect } from 'vitest';
import { Compiler, BMSParser, BMSWriter } from '../src';

const lines = (...l: string[]) => l.join('\n');

function bgmLines(text: string): string[] {
    const { chart } = Compiler.compile(text, { rng: () => 1 });
    return chart.objects
        .all()
        .filter((o) => o.channel === '01')
        .map((o) => `${o.measure}:${o.value}@${o.bgmLine}`)
        .sort();
}

describe('BMSObject.bgmLine', () => {
    it('numbers the #xxx01 lines of each measure from 0, in file order', () => {
        expect(bgmLines(lines(
            '#00101:0102',
            '#00101:0300',
            '#00201:04',
        ))).toEqual(['1:01@0', '1:02@0', '1:03@1', '2:04@0']);
    });

    it('counts all-00 placeholder lines, so a column keeps its index', () => {
        expect(bgmLines(lines(
            '#00101:00',
            '#00101:0000',
            '#00101:05',
        ))).toEqual(['1:05@2']);
    });

    it('counts per measure even when the lines are interleaved', () => {
        expect(bgmLines(lines(
            '#00101:01',
            '#00201:02',
            '#00101:03',
        ))).toEqual(['1:01@0', '1:03@1', '2:02@0']);
    });

    it('skips lines in unselected #RANDOM branches', () => {
        expect(bgmLines(lines(
            '#RANDOM 2',
            '#IF 2',
            '#00101:09',
            '#ENDIF',
            '#00101:01',
        ))).toEqual(['1:01@0']);
    });

    it('is not set on other channels', () => {
        const { chart } = Compiler.compile('#00111:01\n#00101:02');
        const key = chart.objects.all().find((o) => o.channel === '11')!;
        expect(key.bgmLine).toBeUndefined();
    });

    it('is carried to the BGM notes', () => {
        const parser = new BMSParser();
        parser.compileString(lines('#WAV01 a.wav', '#WAV02 b.wav', '#00101:01', '#00101:0002'));
        const bgm = parser.getNotes()!.all().filter((n) => n.noteType === 'bgm');
        expect(bgm.map((n) => `${n.keysound}@${n.bgmLine}`).sort()).toEqual(['01@0', '02@1']);
    });

    it('is carried to the editable chart as sourceBgmLine', () => {
        const parser = new BMSParser();
        parser.compileString(lines('#WAV01 a.wav', '#WAV02 b.wav', '#00101:01', '#00101:00', '#00101:0002', '#00111:01'));
        const notes = BMSWriter.fromBMSChart(parser.chart!).notes;
        const bgm = notes.filter((n) => n.noteType === 'bgm');
        expect(bgm.map((n) => `${n.keysound}@${n.sourceBgmLine}`).sort()).toEqual(['01@0', '02@2']);
        expect(notes.find((n) => n.noteType === 'playable')!.sourceBgmLine).toBeUndefined();
    });
});
