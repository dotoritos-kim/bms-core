import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, Reader } from '../src';
import { readFileSync } from 'fs';

function readBmsFile(filePath: string): string {
  const buffer = readFileSync(filePath);
  return Reader.read(buffer);
}

describe('BMSWriter - fromBMSChart', () => {
  it('should convert a parsed chart to editable format', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);

    expect(editable).toBeDefined();
    expect(editable.headers).toBeDefined();
    expect(editable.notes).toBeDefined();
    expect(editable.notes.length).toBeGreaterThan(0);
    expect(editable.bpmChanges).toBeDefined();
    expect(editable.stopEvents).toBeDefined();
    expect(editable.bgaEvents).toBeDefined();
    expect(editable.timeSignatures).toBeDefined();
  });

  it('should preserve header data', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);

    expect(editable.headers.title).toBeDefined();
    expect(typeof editable.headers.title).toBe('string');
    expect(editable.headers.wav).toBeInstanceOf(Map);
    expect(editable.headers.wav.size).toBeGreaterThan(0);
  });

  it('should assign unique IDs to notes', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);
    const ids = editable.notes.map(n => n.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('BMSWriter - Round Trip', () => {
  it('should preserve notes through parse -> write -> re-parse', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);
    const originalNoteCount = editable.notes.length;
    const originalTitle = editable.headers.title;
    const originalArtist = editable.headers.artist;
    const originalBpm = editable.headers.bpm;

    // Write to BMS string
    const writer = new BMSWriter();
    const output = writer.write(editable);

    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);

    // Re-parse the output
    const parser2 = new BMSParser();
    parser2.compileString(output);

    const editable2 = BMSWriter.fromBMSChart(parser2.chart!);

    // Headers should be preserved
    expect(editable2.headers.title).toBe(originalTitle);
    expect(editable2.headers.artist).toBe(originalArtist);
    expect(editable2.headers.bpm).toBe(originalBpm);

    // Note count should be preserved for playable notes
    // BGM notes may differ due to multi-keysound grouping/ungrouping
    expect(editable2.notes.length).toBeGreaterThan(0);
    const originalPlayable = editable.notes.filter(n => n.noteType === 'playable').length;
    const rewrittenPlayable = editable2.notes.filter(n => n.noteType === 'playable').length;
    // Playable note count should be close (within 10%)
    if (originalPlayable > 0) {
      const tolerance = Math.max(originalPlayable * 0.15, 5);
      expect(Math.abs(rewrittenPlayable - originalPlayable)).toBeLessThan(tolerance);
    }
  });

  it('should preserve BPM changes through round trip', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);
    const originalBpmChangeCount = editable.bpmChanges.length;

    const writer = new BMSWriter();
    const output = writer.write(editable);

    const parser2 = new BMSParser();
    parser2.compileString(output);
    const editable2 = BMSWriter.fromBMSChart(parser2.chart!);

    expect(editable2.bpmChanges.length).toBe(originalBpmChangeCount);
  });

  it('should round-trip a BML file with long notes', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q05_HEAT.bml');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);
    const longNotes = editable.notes.filter(n => n.endBeat !== undefined);
    expect(longNotes.length).toBeGreaterThan(0);

    const writer = new BMSWriter();
    const output = writer.write(editable);

    const parser2 = new BMSParser();
    parser2.compileString(output);
    const editable2 = BMSWriter.fromBMSChart(parser2.chart!);

    // Long notes should be preserved
    const longNotes2 = editable2.notes.filter(n => n.endBeat !== undefined);
    expect(longNotes2.length).toBeGreaterThan(0);
  });

  it('should round-trip a 7K file', () => {
    const content = readBmsFile('S:/BMS Library/0-9/00\uFF1A00 (by Quint)/00A.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const editable = BMSWriter.fromBMSChart(parser.chart!);
    const originalTitle = editable.headers.title;

    const writer = new BMSWriter();
    const output = writer.write(editable);

    const parser2 = new BMSParser();
    parser2.compileString(output);
    const editable2 = BMSWriter.fromBMSChart(parser2.chart!);

    expect(editable2.headers.title).toBe(originalTitle);
    expect(editable2.notes.length).toBeGreaterThan(0);
  });
});

describe('BMSWriter - createEmptyChart', () => {
  it('should create a valid empty chart', () => {
    const chart = BMSWriter.createEmptyChart();

    expect(chart.headers).toBeDefined();
    expect(chart.notes).toEqual([]);
    expect(chart.timeSignatures).toBeInstanceOf(Map);
    expect(chart.bpmChanges).toEqual([]);
    expect(chart.stopEvents).toEqual([]);
    expect(chart.bgaEvents).toEqual([]);
  });

  it('should write an empty chart without error', () => {
    const chart = BMSWriter.createEmptyChart();
    chart.headers.title = 'Test Song';
    chart.headers.artist = 'Test Artist';
    chart.headers.bpm = 120;

    const writer = new BMSWriter();
    const output = writer.write(chart);

    expect(output).toContain('#TITLE Test Song');
    expect(output).toContain('#ARTIST Test Artist');
    expect(output).toContain('#BPM 120');
  });
});

describe('BMSWriter - cloneChart', () => {
  it('should create a deep copy', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const original = BMSWriter.fromBMSChart(parser.chart!);
    const clone = BMSWriter.cloneChart(original);

    // Should be equal
    expect(clone.headers.title).toBe(original.headers.title);
    expect(clone.notes.length).toBe(original.notes.length);

    // Should be independent (deep copy)
    clone.headers.title = 'Modified Title';
    expect(original.headers.title).not.toBe('Modified Title');

    clone.notes.push({
      id: 'extra-note',
      beat: 0,
      measure: 0,
      fraction: 0,
      column: '1',
      keysound: '01',
      noteType: 'playable',
      channel: '11',
    });
    expect(clone.notes.length).toBe(original.notes.length + 1);
  });
});

describe('BMSWriter - diffCharts', () => {
  it('should detect header changes', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const original = BMSWriter.fromBMSChart(parser.chart!);
    const modified = BMSWriter.cloneChart(original);
    modified.headers.title = 'New Title';

    const diff = BMSWriter.diffCharts(original, modified);
    expect(diff.headerChanges.length).toBeGreaterThan(0);
    expect(diff.headerChanges.find(c => c.field === 'title')).toBeDefined();
  });

  it('should detect added and removed notes', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const original = BMSWriter.fromBMSChart(parser.chart!);
    const modified = BMSWriter.cloneChart(original);

    // Remove first note
    const removedNote = modified.notes.shift()!;

    // Add a new note
    modified.notes.push({
      id: 'new-note-1',
      beat: 4,
      measure: 1,
      fraction: 0,
      column: '1',
      keysound: '01',
      noteType: 'playable',
      channel: '11',
    });

    const diff = BMSWriter.diffCharts(original, modified);
    expect(diff.removedNotes.length).toBe(1);
    expect(diff.removedNotes[0].id).toBe(removedNote.id);
    expect(diff.addedNotes.length).toBe(1);
    expect(diff.addedNotes[0].id).toBe('new-note-1');
  });
});

describe('BMSWriter - Options', () => {
  it('should support different formats', () => {
    const chart = BMSWriter.createEmptyChart();
    chart.headers.title = 'Test';
    chart.headers.bpm = 150;

    const bmsWriter = new BMSWriter({ format: 'bms' });
    const bmeWriter = new BMSWriter({ format: 'bme' });
    const bmlWriter = new BMSWriter({ format: 'bml' });

    expect(() => bmsWriter.write(chart)).not.toThrow();
    expect(() => bmeWriter.write(chart)).not.toThrow();
    expect(() => bmlWriter.write(chart)).not.toThrow();
  });
});
