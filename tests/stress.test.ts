import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter, Reader } from '../src';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findBmsFiles(dir: string, maxFiles: number, extensions = ['.bms', '.bme', '.bml', '.pms']): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    if (results.length >= maxFiles) return;
    try {
      const entries = readdirSync(currentDir);
      for (const entry of entries) {
        if (results.length >= maxFiles) break;
        const fullPath = join(currentDir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (extensions.some(ext => entry.toLowerCase().endsWith(ext))) {
            results.push(fullPath);
          }
        } catch {
          // skip inaccessible files
        }
      }
    } catch {
      // skip inaccessible directories
    }
  }

  walk(dir);
  return results;
}

describe('Stress Tests', () => {
  it('should parse 50 files from 4K pack without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/4K U_E FULL PACK 2.1/', 50);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        parser.getTiming();
        parser.getSongInfo();
        successCount++;
      } catch (e) {
        errors.push({ file, error: String(e) });
      }
    }

    console.log(`Successfully parsed ${successCount}/${files.length} files`);
    if (errors.length > 0) {
      console.log('Errors:', errors.slice(0, 5));
    }

    // At least 90% should parse successfully
    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should parse files from 6K pack without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/6K U_E FULL PACK 3.1/', 30);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should parse files from 8K pack without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/8K U_E FULL PACK 1.1/', 30);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should parse PMS files without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/PMS Database PACK/', 30, ['.pms']);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should parse stellabms files (Shift-JIS) without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/stellabms-unpack/', 30);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        parser.getSongInfo();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should parse SV files (many BPM changes) without errors', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/SV/SV/', 20);
    if (files.length === 0) return;

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        parser.getTiming();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.9);
  });

  it('should round-trip 20 files through parse -> write -> re-parse', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/4K U_E FULL PACK 2.1/', 20);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);

        const editable = BMSWriter.fromBMSChart(parser.chart!);
        const writer = new BMSWriter();
        const output = writer.write(editable);

        // Re-parse
        const parser2 = new BMSParser();
        parser2.compileString(output);
        const editable2 = BMSWriter.fromBMSChart(parser2.chart!);

        // Basic sanity: title preserved and notes exist
        if (editable.headers.title) {
          expect(editable2.headers.title).toBe(editable.headers.title);
        }
        expect(editable2.notes.length).toBeGreaterThan(0);

        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.8);
  });

  it('should handle BMS Library files (diverse formats)', { timeout: 120000 }, () => {
    const files = findBmsFiles('S:/BMS Library/', 30);
    expect(files.length).toBeGreaterThan(0);

    let successCount = 0;
    for (const file of files) {
      try {
        const buffer = readFileSync(file);
        const content = Reader.read(buffer);
        const parser = new BMSParser();
        parser.compileString(content);
        parser.getNotes();
        successCount++;
      } catch {
        // count failures
      }
    }

    expect(successCount / files.length).toBeGreaterThanOrEqual(0.8);
  });

  it('should not take too long to parse a single file', { timeout: 60000 }, () => {
    const files = findBmsFiles('S:/4K U_E FULL PACK 2.1/', 5);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const buffer = readFileSync(file);
      const content = Reader.read(buffer);

      const start = performance.now();
      const parser = new BMSParser();
      parser.compileString(content);
      parser.getNotes();
      parser.getTiming();
      parser.getSongInfo();
      parser.getKeySounds();
      parser.getPositioning();
      const elapsed = performance.now() - start;

      // Each file should parse in under 2 seconds
      expect(elapsed).toBeLessThan(2000);
    }
  });
});
