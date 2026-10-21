// Writing a chart back in the encoding it was read with.
// Expected bytes were produced with iconv-lite (cp932 / cp949 / gbk / windows-1251).
import { describe, it, expect } from 'vitest';
import { BMSParser, encodeText, canonicalEncoding, isWritableEncoding, Reader } from '../src';

const SJIS = '#TITLE テスト曲 ①～\n#ARTIST ｱｰﾃｨｽﾄ\n#GENRE 漢字かなカナ\n';
const SJIS_BYTES = [
  0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x8b, 0xc8, 0x20,
  0x87, 0x40, 0x81, 0x60, 0x0a, 0x23, 0x41, 0x52, 0x54, 0x49, 0x53, 0x54, 0x20, 0xb1, 0xb0, 0xc3,
  0xa8, 0xbd, 0xc4, 0x0a, 0x23, 0x47, 0x45, 0x4e, 0x52, 0x45, 0x20, 0x8a, 0xbf, 0x8e, 0x9a, 0x82,
  0xa9, 0x82, 0xc8, 0x83, 0x4a, 0x83, 0x69, 0x0a,
];
// KS X 1001 only: Node's ICU 'euc-kr' decoder lacks the CP949 (UHC) extension
// syllables (e.g. 똠); Chromium's has them, and the encoder table is built from
// the runtime decoder, so both stay consistent.
const KO = '#TITLE ★한국어 테스트★\n#ARTIST 작곡가 방각하\n#GENRE 韓國 POP\n';
const KO_BYTES = [
  0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0xa1, 0xda, 0xc7, 0xd1, 0xb1, 0xb9, 0xbe, 0xee, 0x20,
  0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae, 0xa1, 0xda, 0x0a, 0x23, 0x41, 0x52, 0x54, 0x49, 0x53, 0x54,
  0x20, 0xc0, 0xdb, 0xb0, 0xee, 0xb0, 0xa1, 0x20, 0xb9, 0xe6, 0xb0, 0xa2, 0xc7, 0xcf, 0x0a, 0x23,
  0x47, 0x45, 0x4e, 0x52, 0x45, 0x20, 0xf9, 0xdb, 0xcf, 0xd0, 0x20, 0x50, 0x4f, 0x50, 0x0a,
];
const ZH = '#TITLE 中文测试歌曲\n#ARTIST 作曲家\n';
const ZH_BYTES = [
  0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0xb8,
  0xe8, 0xc7, 0xfa, 0x0a, 0x23, 0x41, 0x52, 0x54, 0x49, 0x53, 0x54, 0x20, 0xd7, 0xf7, 0xc7, 0xfa,
  0xbc, 0xd2, 0x0a,
];
const RU = '#TITLE Тест\n#ARTIST Артист\n';
const RU_BYTES = [
  0x23, 0x54, 0x49, 0x54, 0x4c, 0x45, 0x20, 0xd2, 0xe5, 0xf1, 0xf2, 0x0a, 0x23, 0x41, 0x52, 0x54,
  0x49, 0x53, 0x54, 0x20, 0xc0, 0xf0, 0xf2, 0xe8, 0xf1, 0xf2, 0x0a,
];

describe('encodeText', () => {
  it.each([
    ['shift_jis', SJIS, SJIS_BYTES],
    ['euc-kr', KO, KO_BYTES],
    ['gbk', ZH, ZH_BYTES],
    ['windows-1251', RU, RU_BYTES],
  ])('%s matches the reference bytes and round-trips', (enc, text, expected) => {
    const r = encodeText(text, enc);
    expect(r).toMatchObject({ encoding: enc, exact: true });
    expect([...r.bytes]).toEqual(expected);
    expect(new TextDecoder(enc).decode(r.bytes)).toBe(text);
  });

  it('accepts labels the reader reports or users type', () => {
    expect(canonicalEncoding('Shift-JIS')).toBe('shift_jis');
    expect(canonicalEncoding('EUC-KR')).toBe('euc-kr');
    expect(isWritableEncoding('shift-jis')).toBe(true);
    expect(isWritableEncoding('iso-2022-jp')).toBe(false);
    expect(encodeText(SJIS, 'Shift-JIS').exact).toBe(true);
  });

  it('falls back to UTF-8 with BOM when a character does not fit', () => {
    const r = encodeText('#TITLE テスト 한국어\n', 'shift_jis');
    expect(r).toMatchObject({ encoding: 'utf-8', exact: false });
    expect([...r.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(Reader.read(r.bytes)).toBe('#TITLE テスト 한국어\n');
  });

  it('UTF-8 keeps or omits the BOM as asked; UTF-16 writes a BOM', () => {
    expect([...encodeText('a', 'utf-8').bytes]).toEqual([0x61]);
    expect([...encodeText('a', 'utf-8', true).bytes]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
    expect([...encodeText('a', 'utf-16le', true).bytes]).toEqual([0xff, 0xfe, 0x61, 0x00]);
  });
});

describe('BMSParser reports the source encoding', () => {
  it.each([
    ['shift_jis', SJIS, SJIS_BYTES],
    ['euc-kr', KO, KO_BYTES],
  ])('%s file -> encoding + identical bytes when written back', async (enc, text, src) => {
    const parser = new BMSParser();
    const decoded = await parser.readBuffer(new Uint8Array(src));
    expect(decoded).toBe(text);
    expect(parser.encoding).toBe(enc);
    expect(parser.bom).toBe(false);
    expect([...encodeText(decoded, parser.encoding!).bytes]).toEqual(src);
  });

  it('UTF-8 with BOM is reported as utf-8 + bom', async () => {
    const parser = new BMSParser();
    await parser.readBuffer(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('#TITLE 한')]));
    expect(parser.encoding).toBe('utf-8');
    expect(parser.bom).toBe(true);
  });
});
