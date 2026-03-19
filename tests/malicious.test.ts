import { describe, it, expect } from 'vitest';
import { BMSParser } from '../src';

describe('Malicious Input Handling', () => {
  it('should handle empty input', () => {
    const parser = new BMSParser();
    expect(() => parser.compileString('')).not.toThrow();
  });

  it('should handle input with only comments', () => {
    const parser = new BMSParser();
    expect(() => parser.compileString('// comment\n// another')).not.toThrow();
  });

  it('should handle input with only whitespace', () => {
    const parser = new BMSParser();
    expect(() => parser.compileString('   \n\t\n  \r\n')).not.toThrow();
  });

  it('should handle extremely long lines', () => {
    const parser = new BMSParser();
    const longLine = '#TITLE ' + 'A'.repeat(100000);
    expect(() => parser.compileString(longLine)).not.toThrow();

    const songInfo = parser.getSongInfo();
    expect(songInfo).toBeDefined();
    expect(songInfo!.title.length).toBeGreaterThan(0);
  });

  it('should handle invalid channel numbers', () => {
    const parser = new BMSParser();
    const bms = '#00099:0101010101';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle massive measure numbers', () => {
    const parser = new BMSParser();
    const bms = '#99911:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle binary garbage data', () => {
    const parser = new BMSParser();
    const garbage = Array.from({ length: 1000 }, () =>
      String.fromCharCode(Math.floor(Math.random() * 256))
    ).join('');
    expect(() => parser.compileString(garbage)).not.toThrow();
  });

  it('should handle script injection in headers', () => {
    const parser = new BMSParser();
    const bms = '#TITLE <script>alert("xss")</script>\n#ARTIST "; DROP TABLE users; --\n#00111:01';
    parser.compileString(bms);
    const info = parser.getSongInfo();
    // Should store raw values, not execute them
    expect(info).toBeDefined();
    expect(info!.title).toContain('<script>');
    expect(info!.artist).toContain('DROP TABLE');
  });

  it('should handle null bytes', () => {
    const parser = new BMSParser();
    const bms = '#TITLE test\0evil\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle deeply nested RANDOM/IF blocks', () => {
    const parser = new BMSParser();
    let bms = '';
    for (let i = 0; i < 100; i++) {
      bms += `#RANDOM 2\n#IF 1\n`;
    }
    bms += '#00111:01\n';
    for (let i = 0; i < 100; i++) {
      bms += '#ENDIF\n';
    }
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle duplicate headers gracefully', () => {
    const parser = new BMSParser();
    const bms = '#TITLE First\n#TITLE Second\n#BPM 120\n#BPM 180\n#00111:01';
    parser.compileString(bms);
    const info = parser.getSongInfo();
    expect(info).toBeDefined();
    // Last value wins (typical BMS behavior)
    expect(info!.title).toBeDefined();
  });

  it('should handle extremely high BPM values', () => {
    const parser = new BMSParser();
    const bms = '#BPM 999999999\n#00111:01';
    parser.compileString(bms);
    const timing = parser.getTiming();
    expect(timing).toBeDefined();
    expect(timing!.bpmAtBeat(0)).toBe(999999999);
  });

  it('should handle negative BPM', () => {
    const parser = new BMSParser();
    const bms = '#BPM -120\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle zero BPM', () => {
    const parser = new BMSParser();
    const bms = '#BPM 0\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle zero-length measures', () => {
    const parser = new BMSParser();
    const bms = '#00002:0\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle non-even channel data length', () => {
    const parser = new BMSParser();
    // Channel data should be pairs, but this has odd length
    const bms = '#00111:010';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle path traversal in WAV definitions', () => {
    const parser = new BMSParser();
    const bms = '#WAV01 ../../../etc/passwd\n#WAV02 ..\\..\\windows\\system32\\cmd.exe\n#00111:0102';
    parser.compileString(bms);
    const keySounds = parser.getKeySounds();
    // Should store the value but consumers should validate paths
    expect(keySounds).toBeDefined();
  });

  it('should handle very long WAV definitions', () => {
    const parser = new BMSParser();
    const bms = '#WAV01 ' + 'a'.repeat(10000) + '.wav\n#00111:01';
    parser.compileString(bms);
    const keySounds = parser.getKeySounds();
    expect(keySounds).toBeDefined();
  });

  it('should handle channel data with non-hex characters', () => {
    const parser = new BMSParser();
    const bms = '#00111:XXYYZZ';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle BPM with non-numeric value', () => {
    const parser = new BMSParser();
    const bms = '#BPM abc\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle only headers without any channel data', () => {
    const parser = new BMSParser();
    const bms = '#TITLE Test\n#ARTIST Someone\n#BPM 140\n#GENRE Pop';
    parser.compileString(bms);

    const info = parser.getSongInfo();
    expect(info).toBeDefined();
    expect(info!.title).toBe('Test');
    expect(info!.artist).toBe('Someone');
    expect(info!.genre).toBe('Pop');

    const notes = parser.getNotes();
    expect(notes).toBeDefined();
    expect(notes!.count()).toBe(0);
  });

  it('should handle RANDOM without ENDIF', () => {
    const parser = new BMSParser();
    const bms = '#RANDOM 5\n#IF 1\n#00111:01\n';
    // Missing #ENDIF - should not crash
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle ENDIF without matching IF', () => {
    const parser = new BMSParser();
    const bms = '#ENDIF\n#00111:01';
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle multiple RANDOM blocks', () => {
    const parser = new BMSParser();
    const bms = [
      '#RANDOM 3',
      '#IF 1',
      '#00111:01',
      '#ENDIF',
      '#IF 2',
      '#00111:02',
      '#ENDIF',
      '#IF 3',
      '#00111:03',
      '#ENDIF',
      '#ENDRANDOM',
      '#RANDOM 2',
      '#IF 1',
      '#00211:04',
      '#ENDIF',
      '#IF 2',
      '#00211:05',
      '#ENDIF',
      '#ENDRANDOM',
    ].join('\n');
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle SWITCH/CASE/ENDSW blocks', () => {
    const parser = new BMSParser();
    const bms = [
      '#SWITCH 3',
      '#CASE 1',
      '#00111:01',
      '#CASE 2',
      '#00111:02',
      '#DEF',
      '#00111:03',
      '#ENDSW',
    ].join('\n');
    expect(() => parser.compileString(bms)).not.toThrow();
  });

  it('should handle mixed line endings', () => {
    const parser = new BMSParser();
    const bms = '#TITLE Test\r#BPM 120\r\n#00111:01\n#00211:02';
    parser.compileString(bms);
    const info = parser.getSongInfo();
    expect(info!.title).toBe('Test');
  });

  it('should handle Unicode in headers', () => {
    const parser = new BMSParser();
    const bms = '#TITLE \u30C6\u30B9\u30C8\u66F2\n#ARTIST \u30A2\u30FC\u30C6\u30A3\u30B9\u30C8\n#00111:01';
    parser.compileString(bms);
    const info = parser.getSongInfo();
    expect(info!.title).toBe('\u30C6\u30B9\u30C8\u66F2');
    expect(info!.artist).toBe('\u30A2\u30FC\u30C6\u30A3\u30B9\u30C8');
  });

  it('should handle subtitle extraction patterns', () => {
    const parser = new BMSParser();

    // [HYPER] pattern
    parser.compileString('#TITLE Song Name [HYPER]\n#00111:01');
    let info = parser.getSongInfo();
    expect(info!.title).toBe('Song Name');
    expect(info!.subtitles).toContain('HYPER');

    // (ANOTHER) pattern
    parser.compileString('#TITLE Another Song (ANOTHER)\n#00111:01');
    info = parser.getSongInfo();
    expect(info!.title).toBe('Another Song');
    expect(info!.subtitles).toContain('ANOTHER');

    // -NORMAL- pattern
    parser.compileString('#TITLE Cool Song -NORMAL-\n#00111:01');
    info = parser.getSongInfo();
    expect(info!.title).toBe('Cool Song');
    expect(info!.subtitles).toContain('NORMAL');
  });

  it('should handle float BPM values', () => {
    const parser = new BMSParser();
    const bms = '#BPM 174.5\n#00111:01';
    parser.compileString(bms);
    const timing = parser.getTiming();
    expect(timing!.bpmAtBeat(0)).toBeCloseTo(174.5);
  });

  it('should handle PLAYLEVEL and DIFFICULTY', () => {
    const parser = new BMSParser();
    const bms = '#TITLE Test\n#PLAYLEVEL 12\n#DIFFICULTY 4\n#00111:01';
    parser.compileString(bms);
    const info = parser.getSongInfo();
    expect(info!.level).toBe(12);
    expect(info!.difficulty).toBe(4);
  });

  it('should handle very large channel data', () => {
    const parser = new BMSParser();
    // 1000 notes in a single measure
    const data = '01'.repeat(1000);
    const bms = `#BPM 120\n#WAV01 test.wav\n#001011:${data}`;
    expect(() => parser.compileString(bms)).not.toThrow();

    const notes = parser.getNotes();
    expect(notes).toBeDefined();
  });
});
