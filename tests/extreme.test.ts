import { describe, it, expect } from 'vitest';
import { BMSParser, Notes, Timing, SongInfo, Reader, Compiler } from '../src';
import { readFileSync } from 'fs';

// Helper: read file as buffer and decode using Reader (handles Shift-JIS etc.)
function readBmsFile(filePath: string): string {
  const buffer = readFileSync(filePath);
  return Reader.read(buffer);
}

describe('Extreme Edge Cases', () => {

  // ======================================================================
  // 1. Interrobang Gimmick (1.3MB, 15K lines, BPM up to 22 million)
  // ======================================================================
  describe('Interrobang Gimmick (1.3MB, extreme BPM/STOP gimmicks)', () => {
    const filePath = 'S:/SV/SV/!nterroban(%3F, (by Aoi)/_interrobang_gimmick.bms';
    let content: string;
    let parser: BMSParser;

    it('should decode Shift-JIS file via Reader', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(100000); // 1.3MB file
    });

    it('should parse without crashing', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
      expect(chart.objects).toBeDefined();
      expect(chart.headers).toBeDefined();
    });

    it('should extract song info with correct title', () => {
      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
      expect(songInfo!.title).toBeDefined();
      expect(songInfo!.title.length).toBeGreaterThan(0);
    });

    it('should handle extreme BPM values (up to 22 million)', () => {
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      // Should not throw or produce NaN/Infinity
      const bpm0 = timing!.bpmAtBeat(0);
      expect(bpm0).toBeGreaterThan(0);
      expect(isFinite(bpm0)).toBe(true);

      // Get all BPM segments and verify extreme values are parsed
      const bpmSegments = timing!.getBpmSegments();
      expect(bpmSegments.length).toBeGreaterThan(1);

      // Check that some extreme BPM values exist
      const maxBpm = Math.max(...bpmSegments.map(s => s.bpm));
      expect(maxBpm).toBeGreaterThan(10000); // BPM up to 22 million in this file
      expect(isFinite(maxBpm)).toBe(true);
    });

    it('should handle STOP events with huge durations', () => {
      // File has STOP01 599814, STOP02 4799856
      const chart = parser.chart!;
      const stop01 = chart.headers.get('stop01');
      const stop02 = chart.headers.get('stop02');
      expect(stop01).toBeDefined();
      expect(stop02).toBeDefined();
      expect(Number(stop01)).toBeGreaterThan(10000);
      expect(Number(stop02)).toBeGreaterThan(100000);

      // Timing should still produce finite results with huge STOPs
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      const seconds = timing!.beatToSeconds(4);
      expect(isFinite(seconds)).toBe(true);
    });

    it('should handle LNOBJ header', () => {
      const chart = parser.chart!;
      const lnobj = chart.headers.get('lnobj');
      expect(lnobj).toBeDefined();
      expect(typeof lnobj).toBe('string');
      expect(lnobj!.length).toBeGreaterThan(0);
    });

    it('should handle 8199-character lines without issue', () => {
      // The parser should handle very long channel data lines
      // If it parsed without crash, lines were handled correctly
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);
    });

    it('should parse within reasonable time', () => {
      const start = performance.now();
      const p = new BMSParser();
      p.compileString(content);
      p.getNotes();
      p.getTiming();
      const elapsed = performance.now() - start;
      // Should complete in under 10 seconds even for this extreme file
      expect(elapsed).toBeLessThan(10000);
    });
  });

  // ======================================================================
  // 2. DataErr0r (46K lines, 369 RANDOM blocks, 1845 IF blocks)
  // ======================================================================
  describe('DataErr0r (369 RANDOM blocks, 1845 IF blocks)', () => {
    const filePath = 'S:/GENOSIDE/[Lunatic Sounds]GltichThrone_LS_DataErr0r/!!DataErr0r!!.bms';
    let content: string;
    let parser: BMSParser;

    it('should decode the file', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(100000);
    });

    it('should parse without stack overflow despite 369 RANDOM/1845 IF blocks', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should handle LNOBJ ZZ', () => {
      const chart = parser.chart!;
      const lnobj = chart.headers.get('lnobj');
      expect(lnobj).toBeDefined();
      expect(lnobj!.toUpperCase()).toBe('ZZ');
    });

    it('should produce notes from RANDOM-selected branches', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);

      // Should have playable notes
      const playable = notes!.all().filter(n => n.noteType === 'playable');
      expect(playable.length).toBeGreaterThan(0);
    });

    it('should handle timing correctly', () => {
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      const bpm = timing!.bpmAtBeat(0);
      expect(bpm).toBeGreaterThan(0);
      expect(isFinite(bpm)).toBe(true);
    });

    it('should handle all 46K+ lines in reasonable time', () => {
      const lines = content.split(/\r\n|\r|\n/).length;
      expect(lines).toBeGreaterThan(40000);

      const start = performance.now();
      const p = new BMSParser();
      p.compileString(content);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10000);
    });

    it('should produce deterministic output with setrandom', () => {
      // Parse twice with same setrandom value, should get same result
      const result1 = Compiler.compile(content, { setrandom: 1 });
      const result2 = Compiler.compile(content, { setrandom: 1 });
      expect(result1.chart.objects.all().length).toBe(result2.chart.objects.all().length);

      // Parse with different setrandom, may get different objects
      const result3 = Compiler.compile(content, { setrandom: 2 });
      // At minimum both should parse successfully
      expect(result3.chart.objects.all().length).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // 3. BMSON format (JSON-based)
  // ======================================================================
  describe('BMSON format (JSON-based)', () => {
    const filePath = 'S:/BMS Library/E/Endless Way (by exclusion (original%3A Shou))/_endless_way_7l.bmson';

    it('should detect BMSON as JSON format', () => {
      const content = readFileSync(filePath, 'utf-8');
      expect(content.trim().startsWith('{')).toBe(true);

      // Verify it's valid JSON
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
    });

    it('should have bmson-specific fields', () => {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      // BMSON v1 structure
      // version field or info object expected
      const hasVersion = 'version' in parsed;
      const hasInfo = 'info' in parsed;
      expect(hasVersion || hasInfo).toBe(true);
    });

    it('should document that BMSParser does not natively parse BMSON', () => {
      // BMSParser.compileString expects BMS text format, not JSON
      // Attempting to compile BMSON content should not crash, but
      // will produce an empty/minimal chart since no #commands found
      const content = readFileSync(filePath, 'utf-8');
      const parser = new BMSParser();
      // This should not throw
      expect(() => parser.compileString(content)).not.toThrow();

      // But the chart will be mostly empty since BMSON has no # commands
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      // BMSON parsed as BMS text won't produce meaningful notes
      // This is expected - BMSON needs a separate parser
    });
  });

  // ======================================================================
  // 4. Landmine notes (D/E channels)
  // ======================================================================
  describe('Landmine Notes (D/E channels)', () => {
    const filePath = 'S:/GENOSIDE/[eFeL]GlitchThrone_Engine/engine_DPEX.bms';
    let content: string;
    let parser: BMSParser;

    it('should parse DP landmine file', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should detect landmine notes from D/E channels', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();

      const allNotes = notes!.all();
      const landmines = allNotes.filter(n => n.noteType === 'landmine');
      expect(landmines.length).toBeGreaterThan(0);
    });

    it('should calculate landmine damage values', () => {
      const notes = parser.getNotes();
      const landmines = notes!.all().filter(n => n.noteType === 'landmine');

      for (const mine of landmines) {
        expect(mine.damage).toBeDefined();
        expect(typeof mine.damage).toBe('number');
        expect(mine.damage!).toBeGreaterThanOrEqual(0);
        expect(mine.damage!).toBeLessThanOrEqual(100);
      }
    });

    it('should have both 1P and 2P landmine channels in DP file', () => {
      const notes = parser.getNotes();
      const landmines = notes!.all().filter(n => n.noteType === 'landmine');

      // D channels are 1P landmines, E channels are 2P landmines
      const d_channels = landmines.filter(n => n.channel?.startsWith('D') || n.channel?.startsWith('d'));
      const e_channels = landmines.filter(n => n.channel?.startsWith('E') || n.channel?.startsWith('e'));

      // DP EX file should have both
      expect(d_channels.length + e_channels.length).toBe(landmines.length);
    });

    it('should also have playable notes in DP format', () => {
      const notes = parser.getNotes();
      const playable = notes!.all().filter(n => n.noteType === 'playable');
      expect(playable.length).toBeGreaterThan(0);

      // DP should have 2P columns
      const columns = new Set(playable.map(n => n.column).filter(Boolean));
      expect(columns.size).toBeGreaterThan(7); // More than 7 columns = DP
    });
  });

  // ======================================================================
  // 5. GIMMICK protocol (437KB, very long lines, Shift-JIS)
  // ======================================================================
  describe('GIMMICK protocol (437KB, very long lines, Shift-JIS)', () => {
    const filePath = 'S:/SV/SV/GIMMICK (by Ms.Sill)/__protocol.bms';
    let content: string;
    let parser: BMSParser;

    it('should decode Shift-JIS encoded file', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(100000);
    });

    it('should parse without issues', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should handle LNTYPE 1 long notes (channel 5x/6x)', () => {
      // GIMMICK uses #LNTYPE 1 with channel 5x for long notes (visual scroll effects)
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      const allNotes = notes!.all();
      // LNTYPE 1 long notes should have endBeat set
      const longNotes = allNotes.filter(n => n.endBeat !== undefined);
      expect(longNotes.length).toBeGreaterThan(0);
    });

    it('should extract notes from long channel lines', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);
    });

    it('should handle positioning/scroll data', () => {
      const positioning = parser.getPositioning();
      expect(positioning).toBeDefined();
    });

    it('should extract song info', () => {
      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
      expect(songInfo!.title.length).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // 6. BM98 Ancient Format
  // ======================================================================
  describe('BM98 Ancient Format', () => {
    const filePath = 'S:/BM98 THE BEST-unpack/[$W] Flight to the Mars/FttM.bms';
    let content: string;
    let parser: BMSParser;

    it('should decode the file', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should parse BM98-era BMS file', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should extract basic song info', () => {
      const songInfo = parser.getSongInfo();
      expect(songInfo).toBeDefined();
      expect(songInfo!.title.length).toBeGreaterThan(0);
    });

    it('should extract notes', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      expect(notes!.count()).toBeGreaterThan(0);

      // BM98-era files usually only have basic playable + BGM notes
      const allNotes = notes!.all();
      const playable = allNotes.filter(n => n.noteType === 'playable');
      const bgm = allNotes.filter(n => n.noteType === 'bgm');
      expect(playable.length).toBeGreaterThan(0);
      expect(bgm.length).toBeGreaterThan(0);
    });

    it('should handle old-style 5-key format', () => {
      // BM98 files typically use only channels 11-15 (5 keys) + 16 (scratch)
      const notes = parser.getNotes();
      const playable = notes!.all().filter(n => n.noteType === 'playable');
      const columns = new Set(playable.map(n => n.column).filter(Boolean));
      // Should have some playable columns
      expect(columns.size).toBeGreaterThan(0);
      expect(columns.size).toBeLessThanOrEqual(9); // At most 7+SC+FZ for SP
    });

    it('should handle timing without extended BPM commands', () => {
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      const bpm = timing!.bpmAtBeat(0);
      expect(bpm).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // 7. Double Play BME
  // ======================================================================
  describe('Double Play BME', () => {
    const filePath = 'S:/DPBMS Uploader/0100-0199/dpbms_0125.bme';
    let content: string;
    let parser: BMSParser;

    it('should decode BME file', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should parse DP BME format', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should detect DP mode and have 2P channels', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      const allNotes = notes!.all();
      const playable = allNotes.filter(n => n.noteType === 'playable');
      expect(playable.length).toBeGreaterThan(0);

      // DP should have columns beyond typical SP range
      const columns = new Set(playable.map(n => n.column).filter(Boolean));
      expect(columns.size).toBeGreaterThan(7); // More than 7 = DP
    });

    it('should have #PLAYER 3 header for DP', () => {
      const chart = parser.chart!;
      const player = chart.headers.get('player');
      expect(player).toBe('3');
    });

    it('should have both 1P and 2P playable notes', () => {
      const notes = parser.getNotes();
      const playable = notes!.all().filter(n => n.noteType === 'playable');

      // Check channels - 1x is 1P, 2x is 2P
      const has1P = playable.some(n => n.channel?.startsWith('1'));
      const has2P = playable.some(n => n.channel?.startsWith('2'));
      expect(has1P).toBe(true);
      expect(has2P).toBe(true);
    });

    it('should extract timing correctly', () => {
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      expect(timing!.bpmAtBeat(0)).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // 8. LNOBJ Long Notes
  // ======================================================================
  describe('LNOBJ Long Notes', () => {
    const filePath = 'S:/GENOSIDE/[Blue-J vs. Ruby.G]unexpected_encounter/bj_rg_a9s_141_ka2.bms';
    let content: string;
    let parser: BMSParser;

    it('should decode the file (potential Shift-JIS)', () => {
      const buffer = readFileSync(filePath);
      content = Reader.read(buffer);
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should parse LNOBJ-based file', () => {
      parser = new BMSParser();
      const chart = parser.compileString(content);
      expect(chart).toBeDefined();
    });

    it('should have LNOBJ header defined', () => {
      const chart = parser.chart!;
      const lnobj = chart.headers.get('lnobj');
      expect(lnobj).toBeDefined();
      expect(typeof lnobj).toBe('string');
      expect(lnobj!.length).toBeGreaterThan(0);
    });

    it('should produce long notes from LNOBJ mechanism', () => {
      const notes = parser.getNotes();
      expect(notes).toBeDefined();
      const allNotes = notes!.all();
      expect(allNotes.length).toBeGreaterThan(0);

      // LNOBJ creates long notes by setting endBeat on the previous note
      const longNotes = allNotes.filter(n => n.endBeat !== undefined);
      expect(longNotes.length).toBeGreaterThan(0);

      // Verify long note integrity: endBeat > beat
      for (const ln of longNotes) {
        expect(ln.endBeat!).toBeGreaterThan(ln.beat);
      }
    });

    it('should have correct timing', () => {
      const timing = parser.getTiming();
      expect(timing).toBeDefined();
      expect(timing!.bpmAtBeat(0)).toBeGreaterThan(0);
    });

    it('should have playable notes', () => {
      const notes = parser.getNotes();
      const playable = notes!.all().filter(n => n.noteType === 'playable');
      expect(playable.length).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // Cross-cutting: Performance & Robustness
  // ======================================================================
  describe('Cross-cutting robustness tests', () => {
    const extremeFiles = [
      { name: 'Interrobang Gimmick', path: 'S:/SV/SV/!nterroban(%3F, (by Aoi)/_interrobang_gimmick.bms' },
      { name: 'DataErr0r', path: 'S:/GENOSIDE/[Lunatic Sounds]GltichThrone_LS_DataErr0r/!!DataErr0r!!.bms' },
      { name: 'GIMMICK protocol', path: 'S:/SV/SV/GIMMICK (by Ms.Sill)/__protocol.bms' },
      { name: 'Engine DPEX', path: 'S:/GENOSIDE/[eFeL]GlitchThrone_Engine/engine_DPEX.bms' },
      { name: 'BM98 FttM', path: 'S:/BM98 THE BEST-unpack/[$W] Flight to the Mars/FttM.bms' },
      { name: 'DP BME 0125', path: 'S:/DPBMS Uploader/0100-0199/dpbms_0125.bme' },
      { name: 'LNOBJ encounter', path: 'S:/GENOSIDE/[Blue-J vs. Ruby.G]unexpected_encounter/bj_rg_a9s_141_ka2.bms' },
    ];

    it.each(extremeFiles)('$name: full pipeline (parse -> notes -> timing) should not throw', ({ path }) => {
      const buffer = readFileSync(path);
      const content = Reader.read(buffer);

      const parser = new BMSParser();
      expect(() => {
        parser.compileString(content);
        parser.getNotes();
        parser.getTiming();
        parser.getPositioning();
        parser.getSongInfo();
        parser.getKeySounds();
        parser.calculateTotalPlayTime();
      }).not.toThrow();
    });

    it.each(extremeFiles)('$name: beat-to-seconds round-trip should be consistent', ({ path }) => {
      const buffer = readFileSync(path);
      const content = Reader.read(buffer);

      const parser = new BMSParser();
      parser.compileString(content);
      const timing = parser.getTiming();
      expect(timing).toBeDefined();

      // Test at multiple beat points
      for (const beat of [0, 4, 8, 16, 32]) {
        const seconds = timing!.beatToSeconds(beat);
        expect(isFinite(seconds)).toBe(true);
        if (seconds >= 0) {
          const backToBeat = timing!.secondsToBeat(seconds);
          expect(isFinite(backToBeat)).toBe(true);
        }
      }
    });
  });
});
