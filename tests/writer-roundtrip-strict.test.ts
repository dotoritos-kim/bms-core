import { describe, it, expect } from 'vitest';
import { BMSParser, BMSWriter } from '../src';

describe('Writer round-trip strict tolerance', () => {
  function roundTrip(bmsString: string) {
    // Parse original
    const parser1 = new BMSParser();
    parser1.compileString(bmsString);
    const chart1 = parser1.chart!;

    // Convert to editable and write back
    const editable = BMSWriter.fromBMSChart(chart1);
    const writer = new BMSWriter();
    const written = writer.write(editable);

    // Parse written output
    const parser2 = new BMSParser();
    parser2.compileString(written);
    const chart2 = parser2.chart!;

    return { chart1, chart2, written };
  }

  it('preserves header BPM', () => {
    const bms = `#BPM 150
#00111:01`;
    const { chart1, chart2 } = roundTrip(bms);
    expect(chart2.headers.get('bpm')).toBe(chart1.headers.get('bpm'));
  });

  it('preserves playable note count exactly', () => {
    const bms = `#BPM 120
#WAV01 kick.wav
#WAV02 snare.wav
#00111:0102
#00211:0201`;
    const { chart1, chart2 } = roundTrip(bms);

    const notes1 = chart1.objects.allSorted();
    const notes2 = chart2.objects.allSorted();

    // Filter playable notes (channels 11-19, 21-29)
    const playable1 = notes1.filter(o => {
      const ch = parseInt(o.channel, 16);
      return (ch >= 0x11 && ch <= 0x19) || (ch >= 0x21 && ch <= 0x29);
    });
    const playable2 = notes2.filter(o => {
      const ch = parseInt(o.channel, 16);
      return (ch >= 0x11 && ch <= 0x19) || (ch >= 0x21 && ch <= 0x29);
    });

    expect(playable2.length).toBe(playable1.length);
  });

  it('preserves note positions', () => {
    const bms = `#BPM 120
#WAV01 kick.wav
#00111:01000100`;
    const { chart1, chart2 } = roundTrip(bms);

    const notes1 = chart1.objects.allSorted().filter(o => o.channel === '11');
    const notes2 = chart2.objects.allSorted().filter(o => o.channel === '11');

    expect(notes2.length).toBe(notes1.length);
    for (let i = 0; i < notes1.length; i++) {
      expect(notes2[i].measure).toBe(notes1[i].measure);
      expect(Math.abs(notes2[i].fraction - notes1[i].fraction)).toBeLessThan(0.001);
    }
  });

  it('preserves BPM change events', () => {
    const bms = `#BPM 120
#BPM01 180
#00108:01
#00211:01`;
    const { chart1, chart2 } = roundTrip(bms);

    const bpmChanges1 = chart1.objects.allSorted().filter(o => o.channel === '08');
    const bpmChanges2 = chart2.objects.allSorted().filter(o => o.channel === '08');
    expect(bpmChanges2.length).toBe(bpmChanges1.length);
  });

  it('empty chart round-trips without errors', () => {
    const bms = `#BPM 120`;
    const { written } = roundTrip(bms);
    expect(written).toBeDefined();
    expect(written.length).toBeGreaterThan(0);
  });
});
