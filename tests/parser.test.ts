import { describe, it, expect } from 'vitest';
import { BMSParser, Notes, Timing, SongInfo, KeySounds, Reader } from '../src';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Helper: read file as buffer and decode using Reader (handles Shift-JIS etc.)
function readBmsFile(filePath: string): string {
  const buffer = readFileSync(filePath);
  return Reader.read(buffer);
}

// Helper: recursively find BMS files in a directory
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

describe('BMSParser - Basic Parsing', () => {
  describe('4K BMS file', () => {
    const filePath = 'S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms';

    it('should parse the file without errors', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      const chart = parser.compileString(content);

      expect(chart).toBeDefined();
      expect(chart.headers).toBeDefined();
      expect(chart.objects).toBeDefined();
    });

    it('should extract song info', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
      expect(songInfo!.title).toBeDefined();
      expect(typeof songInfo!.title).toBe('string');
      expect(songInfo!.title.length).toBeGreaterThan(0);
    });

    it('should extract notes', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      const allNotes = notes!.all();
      expect(allNotes).toBeDefined();
      expect(allNotes.length).toBeGreaterThan(0);
    });

    it('should extract timing', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      // BPM at beat 0 should be a positive number
      const bpm = timing!.bpmAtBeat(0);
      expect(bpm).toBeGreaterThan(0);
    });

    it('should extract keysounds', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const keySounds = parser.getKeySounds();
      expect(keySounds).toBeDefined();
    });
  });

  describe('7K BMS file (IIDX style)', () => {
    const filePath = 'S:/BMS Library/0-9/00\uFF1A00 (by Quint)/00A.bms';

    it('should parse and extract notes from a 7K file', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);

      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
    });
  });

  describe('PMS file (9K)', () => {
    const filePath = 'S:/PMS Database PACK/[Database]PLv/01 Your mind/_n.pms';

    it('should parse PMS file', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);

      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
    });
  });

  describe('BML file (long notes)', () => {
    const filePath = 'S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q05_HEAT.bml';

    it('should parse BML file with long notes', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      const allNotes = notes!.all();
      expect(allNotes.length).toBeGreaterThan(0);

      // BML files typically contain long notes (notes with endBeat)
      const longNotes = allNotes.filter(n => n.endBeat !== undefined);
      expect(longNotes.length).toBeGreaterThan(0);
    });
  });

  describe('6K BMS file', () => {
    const filePath = 'S:/6K U_E FULL PACK 3.1/111_sinkaron_ogg/61_deepender_6kh.bms';

    it('should parse a 6K file', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);
    });
  });

  describe('8K BMS file', () => {
    const filePath = "S:/8K U_E FULL PACK 1.1/[Childive] Cat's rule/__Cat's_rule_8k_Hard.bms";

    it('should parse an 8K file', () => {
      const content = readBmsFile(filePath);
      const parser = new BMSParser();
      parser.compileString(content);

      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);
    });
  });
});

describe('BMSParser - Encoding Detection', () => {
  it('should handle Shift-JIS encoded files from stellabms', () => {
    const files = findBmsFiles('S:/stellabms-unpack/', 5);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const buffer = readFileSync(file);
      const content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);

      // Should be parseable
      const parser = new BMSParser();
      expect(() => parser.compileString(content)).not.toThrow();
    }
  });

  it('should handle files from 발광-unpack (likely Shift-JIS)', () => {
    const files = findBmsFiles('S:/\uBC1C\uAD11-unpack/', 3);
    if (files.length === 0) return; // skip if no files found

    for (const file of files) {
      const buffer = readFileSync(file);
      const content = Reader.read(buffer);
      expect(typeof content).toBe('string');

      const parser = new BMSParser();
      expect(() => parser.compileString(content)).not.toThrow();
    }
  });

  it('should handle readBuffer async method', async () => {
    const filePath = 'S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms';
    const buffer = readFileSync(filePath);
    const parser = new BMSParser();

    const content = await parser.readBuffer(buffer);
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);

    parser.compileString(content);
    const songInfo = parser.getSongInfo();
    expect(songInfo).toBeDefined();
  });
});

describe('BMSParser - Key Mode Detection', () => {
  it('should detect keyboard style for 4K pack files', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const notes = parser.getNotes();
    expect(notes).toBeDefined();
    const allNotes = notes!.all();
    // 4K files use keyboard style; playable notes should have columns
    const playableNotes = allNotes.filter(n => n.noteType === 'playable');
    expect(playableNotes.length).toBeGreaterThan(0);

    // Check that columns are assigned
    for (const note of playableNotes) {
      expect(note.column).toBeDefined();
    }
  });

  it('should detect PMS style for PMS files', () => {
    const content = readBmsFile('S:/PMS Database PACK/[Database]PLv/01 Your mind/_n.pms');
    const parser = new BMSParser();
    parser.compileString(content);

    const notes = parser.getNotes();
    expect(notes).toBeDefined();
    const allNotes = notes!.all();
    const playableNotes = allNotes.filter(n => n.noteType === 'playable');
    expect(playableNotes.length).toBeGreaterThan(0);

    // PMS columns should be '1'-'9'
    const columns = new Set(playableNotes.map(n => n.column).filter(Boolean));
    expect(columns.size).toBeGreaterThan(0);
    expect(columns.size).toBeLessThanOrEqual(9);
  });
});

describe('BMSParser - Edge Cases with Real Files', () => {
  it('should handle SV (scroll velocity) files with many BPM changes', () => {
    const files = findBmsFiles('S:/SV/SV/', 3);
    if (files.length === 0) return;

    for (const file of files) {
      const content = readBmsFile(file);
      const parser = new BMSParser();
      expect(() => parser.compileString(content)).not.toThrow();

      const timing = parser.getTiming();
      expect(timing).toBeDefined();
    }
  });

  it('should calculate total play time', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const playTime = parser.calculateTotalPlayTime();
    expect(playTime).toBeGreaterThan(0);
    // Play time should be reasonable (between 10 seconds and 30 minutes)
    expect(playTime).toBeGreaterThan(10000); // > 10s
    expect(playTime).toBeLessThan(1800000); // < 30min
  });

  it('should handle beat-to-seconds conversion', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const timing = parser.getTiming();
    expect(timing).toBeDefined();

    // Beat 0 should be at time 0
    expect(timing!.beatToSeconds(0)).toBe(0);

    // Later beats should be at positive times
    expect(timing!.beatToSeconds(4)).toBeGreaterThan(0);

    // Round-trip conversion should be consistent
    const seconds = timing!.beatToSeconds(8);
    const backToBeat = timing!.secondsToBeat(seconds);
    expect(backToBeat).toBeCloseTo(8, 5);
  });

  it('should get positioning data', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const positioning = parser.getPositioning();
    expect(positioning).toBeDefined();
  });
});

describe('BMSParser - Note Properties', () => {
  it('should have correct note structure', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const notes = parser.getNotes();
    const allNotes = notes!.all();

    for (const note of allNotes.slice(0, 20)) {
      expect(typeof note.beat).toBe('number');
      expect(note.beat).toBeGreaterThanOrEqual(0);
      expect(typeof note.keysound).toBe('string');
      expect(note.noteType).toBeDefined();
      expect(['playable', 'invisible', 'landmine', 'bgm']).toContain(note.noteType);
      expect(typeof note.channel).toBe('string');
    }
  });

  it('should categorize notes correctly', () => {
    const content = readBmsFile('S:/4K U_E FULL PACK 2.1/(time_traveler)Corgito_Ergosum/__4K_Q01_EZ.bms');
    const parser = new BMSParser();
    parser.compileString(content);

    const notes = parser.getNotes();
    const allNotes = notes!.all();

    const playable = allNotes.filter(n => n.noteType === 'playable');
    const bgm = allNotes.filter(n => n.noteType === 'bgm');

    // Should have both playable and BGM notes
    expect(playable.length).toBeGreaterThan(0);
    expect(bgm.length).toBeGreaterThan(0);

    // Playable notes should have columns
    for (const note of playable) {
      expect(note.column).toBeDefined();
    }

    // BGM notes should not have columns
    for (const note of bgm) {
      expect(note.column).toBeUndefined();
    }
  });
});
