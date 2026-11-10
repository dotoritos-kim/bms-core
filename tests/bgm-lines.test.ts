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

// The writer puts a BGM note on the line of its column (bgmChannel), so the
// columns of a chart survive a save.
describe('BMSWriter BGM columns', () => {
    const HEAD = ['#WAV01 a.wav', '#WAV02 b.wav', '#WAV03 c.wav'];

    function open(...body: string[]) {
        const parser = new BMSParser();
        parser.compileString(lines(...HEAD, ...body));
        return BMSWriter.fromBMSChart(parser.chart!);
    }

    // the writer ends lines with CRLF
    const bgmLinesOf = (text: string) => text.split(/\r?\n/).filter((l) => /^#\d{3}01:/.test(l));

    function write(chart: ReturnType<typeof open>) {
        const writer = new BMSWriter();
        const text = writer.write(chart);
        return {
            text,
            bgm: bgmLinesOf(text),
            warnings: writer.getWarnings(),
        };
    }

    const bgmOf = (chart: ReturnType<typeof open>) => chart.notes.filter((n) => n.noteType === 'bgm');
    const columnsAsWritten = (text: string) => {
        const parser = new BMSParser();
        parser.compileString(text);
        return bgmOf(BMSWriter.fromBMSChart(parser.chart!))
            .map((n) => `${n.measure}:${n.keysound}@${n.sourceBgmLine}`)
            .sort();
    };

    it('writes a left-packed chart as before: one line per keysound sounding together', () => {
        const chart = open('#00101:0102', '#00101:0300', '#00201:03');
        expect(write(chart).bgm).toEqual(['#00101:0102', '#00101:03', '#00201:03']);
    });

    it('writes column N as the Nth #xxx01 line, with placeholders below it', () => {
        const chart = open('#00101:01', '#00201:02');
        bgmOf(chart)[0].bgmChannel = 3;
        const out = write(chart);
        expect(out.bgm).toEqual(['#00101:00', '#00101:00', '#00101:00', '#00101:01', '#00201:02']);
        expect(columnsAsWritten(out.text)).toEqual(['1:01@3', '2:02@0']);
        expect(out.warnings).toEqual([]);
    });

    it('keeps the lines of a file whose columns are laid out as written', () => {
        const body = ['#00101:01', '#00101:00', '#00101:0002', '#00201:0300', '#00201:0003'];
        const chart = open(...body);
        for (const note of bgmOf(chart)) note.bgmChannel = note.sourceBgmLine;
        expect(write(chart).bgm).toEqual(['#00101:01', '#00101:00', '#00101:0002', '#00201:03', '#00201:0003']);
    });

    it('keeps the columns over repeated saves', () => {
        const chart = open('#00101:01020300');
        const [a, b, c] = bgmOf(chart);
        a.bgmChannel = 2;
        b.bgmChannel = 0;
        c.bgmChannel = 5;
        const first = write(chart).text;
        expect(columnsAsWritten(first)).toEqual(['1:01@2', '1:02@0', '1:03@5']);

        const parser = new BMSParser();
        parser.compileString(first);
        const reopened = BMSWriter.fromBMSChart(parser.chart!);
        for (const note of bgmOf(reopened)) note.bgmChannel = note.sourceBgmLine;
        expect(write(reopened).bgm).toEqual(bgmLinesOf(first));
    });

    it('does not write placeholders after the last used line, and counts per measure', () => {
        const chart = open('#00101:01', '#00201:02', '#00301:03');
        const [a, b] = bgmOf(chart);
        a.bgmChannel = 1;
        b.bgmChannel = 0;
        expect(write(chart).bgm).toEqual(['#00101:00', '#00101:01', '#00201:02', '#00301:03']);
    });

    it('moves a note to the first free line when its slot on the line is taken', () => {
        const chart = open('#00101:01', '#00101:02', '#00101:03');
        for (const note of bgmOf(chart)) note.bgmChannel = 1;
        const out = write(chart);
        // 01 keeps line 1; 02 and 03 take the free lines around it
        expect(out.bgm).toEqual(['#00101:02', '#00101:01', '#00101:03']);
        expect(columnsAsWritten(out.text)).toEqual(['1:01@1', '1:02@0', '1:03@2']);
    });

    it('layers notes without a column in note order', () => {
        const chart = open('#00101:0102', '#00101:03');
        for (const note of bgmOf(chart)) delete note.bgmChannel;
        expect(write(chart).bgm).toEqual(['#00101:0102', '#00101:03']);
    });

    it('ignores a column that is negative, fractional or far out of range', () => {
        const chart = open('#00101:01', '#00101:02', '#00101:03');
        const [a, b, c] = bgmOf(chart);
        a.bgmChannel = -1;
        b.bgmChannel = 1.5;
        c.bgmChannel = 100000;
        expect(write(chart).bgm).toEqual(['#00101:01', '#00101:02', '#00101:03']);
    });

    it('puts layered and rerouted keysounds on free lines without moving the columns', () => {
        // two objects on the same key slot: the second is rerouted to channel 01
        const chart = open('#00101:01', '#00111:02');
        const key = chart.notes.find((n) => n.noteType === 'playable')!;
        chart.notes.push({ ...key, id: 'dup', keysound: '03' });
        key.additionalKeysounds = [{ keysound: '02', type: 'bgm' }];
        bgmOf(chart)[0].bgmChannel = 1;
        const out = write(chart);
        expect(out.bgm).toEqual(['#00101:02', '#00101:01', '#00101:03']);
        expect(out.warnings.map((w) => w.code)).toEqual(['slot-collision-rerouted']);
    });
});
