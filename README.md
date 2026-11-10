# `@rhythm-archive/bms-core`

Parser and domain model for BMS (Be-Music Script) chart files. The package is
runtime-agnostic: no DOM dependencies, no audio engine, and ships pure
TypeScript.

## What it does

- **Reader** (`src/parser/modules/reader/`): auto-detects character encoding
  and decodes the byte stream. Supported encodings:
  `UTF-8`, `UTF-16` (with BOM), `Shift-JIS`, `GBK`, `GB18030`, `Big5`,
  `EUC-KR`, `Windows-1251`.
  Filename overrides (`Reader.getReaderOptionsFromFilename`): `.sjis.<ext>`,
  `.euc_kr.<ext>`, `.utf8.<ext>`, `.win1251.<ext>`.
- **Parser**: walks `#TITLE`, `#ARTIST`, `#BPM`, `#WAVxx`, channel data and
  produces a structured chart with notes, BGM lanes, time-bound BPM/STOP/SCROLL
  events, key sounds, and section bars. Follows the
  [BMS command memo](https://hitkey.nekokan.dyndns.info/cmds.htm) for:
  - control flow: `#RANDOM` / `#IF` / `#SWITCH` on one frame stack (nested
    skips, in-file `#SETRANDOM` / `#SETSWITCH`, `#CASE` fallthrough, `#DEF`,
    `#END IF` / `#IFEND` typos); `#WAV` / `#BMP` in unselected branches do not
    override the selected one
  - `#BASE 62` (case-sensitive object IDs)
  - `#EXBPMxx` as an alias of `#BPMxx` for channel 08 (`#BPMxx` wins)
  - `#LNTYPE 2` (MGQ notation, `notes/mgq.ts`) next to `#LNTYPE 1` and `#LNOBJ`
  - `#BPM` 130 when omitted; landmine damage `value / 2` % with `ZZ` as an
    instant game over
  - BGM notes keep the index of the `#xxx01:` line they came from
    (`BMSNote.bgmLine`, and `EditableBMSNote.sourceBgmLine` from
    `BMSWriter.fromBMSChart`), so editors can lay BGM lanes out as written
- **Writer** (`BMSWriter`): round-trip serialisation back to BMS text.
  - Picks the channel layout from the chart's `style` (IIDX / keyboard / PMS,
    SP or DP), or infers it from the columns in use (`resolveReverseMapping`).
    `styleForKeyMode(keyMode)` maps an editor key mode to a layout.
  - Keeps objects on channels it does not model (`extraObjects`: 05, 0A-0E,
    97/98, 99, A0-A6, extension lanes 1A-2Z) and value-less headers such as
    Qwilight's `#4K` / `#6K` / `#8K`.
  - Resolves `#BPMxx` / `#STOPxx` definitions at write time, reroutes objects
    that share a slot to BGM channel 01, and reports every adjustment through
    `getWarnings()`.
  - Writes untouched measures on their source resolution; `#LNTYPE 2` charts
    are written back in `#LNTYPE 1` notation.
  - Writes a BGM note's column (`EditableBMSNote.bgmChannel`) as the Nth
    `#xxx01:` line of its measure, with `00` placeholder lines below it, so the
    column is read back as `sourceBgmLine`. Notes without a column, and notes
    whose slot on their line is taken, go to the first line with the slot free.
- **Encoding write-back**: `encodeText(text, encoding, bom)` writes Shift_JIS,
  EUC-KR, GBK, Big5, Windows-1251 and UTF-8/16, falling back to UTF-8
  (`exact: false`) when a character does not fit.
- **Modules**: `Timing`, `Positioning`, `Spacing`, `KeySounds`, `SongInfo`,
  `Notes`, `TimeSignatures` exposed for consumers that need partial views.

## Usage

```ts
import { BMSParser, Notes, SongInfo } from '@rhythm-archive/bms-core';

const buffer = await fs.readFile('chart.bms');
const parser = new BMSParser();
const text = await parser.readBuffer(buffer); // detects the encoding
const chart = parser.compileString(text);
console.log(parser.encoding, parser.bom); // e.g. 'shift_jis', false
console.log(SongInfo.fromBMSChart(chart).title, Notes.fromBMSChart(chart).count());
```

For consumers that already know the encoding (e.g. a `#ENCODING` sidecar):

```ts
import { Reader } from '@rhythm-archive/bms-core';
const text = Reader.read(buffer, { forceEncoding: 'windows-1251' });
```

Edit and write back in the source encoding:

```ts
import { BMSWriter, encodeText } from '@rhythm-archive/bms-core';

const editable = BMSWriter.fromBMSChart(chart); // style auto-detected; pass one to force it
const writer = new BMSWriter({ lnMode: 'channel' });
const out = writer.write(editable);
const { bytes, exact } = encodeText(out, parser.encoding ?? 'utf-8', parser.bom);
if (writer.getWarnings().length) console.warn(writer.getWarnings());
```

## Encoding heuristic notes

A BOM decides first. Otherwise strict UTF-8 is tried, then every legacy
encoding that decodes without `U+FFFD` or C1 control bytes is scored by how
much its output looks like real text (common Hangul syllables, kana, CJK,
Cyrillic), and the best score wins. Ties keep the order Shift-JIS, GBK,
GB18030, Big5, EUC-KR, Windows-1251. Scoring is what lets EUC-KR charts win
over GBK / Shift-JIS, which accept almost every EUC-KR byte sequence.
Short Cyrillic-only payloads can still collide with Shift-JIS (the bytes also
form valid half-width katakana). For Russian charts, prefer the explicit
`.win1251` extension or the `forceEncoding` option.

## Development

```bash
npm install       # on Windows use `npm install --include=dev` if devDeps are skipped
npm run build     # vite build + .d.ts emit
npm test          # vitest
npm run lint      # eslint (flat config: eslint.config.js)
npm run format    # prettier (config: .prettierrc.json)
```

This package is **vendored** by `bms-electron-app` as a git submodule at
`vendor/bms-core/` and linked through npm workspaces. When changing the public
API, update the submodule pointer in the app in the same change.

## Versioning

Standard semver. The chart object shape is part of the public API; structural
breaking changes require a major bump.

## Related

- [`@rhythm-archive/bms-player`](https://github.com/dotoritos-kim/bms-player): runtime player
- [`@rhythm-archive/bms-editor`](https://github.com/dotoritos-kim/bms-editor): chart editor UI
- [`bms-electron-app`](https://github.com/dotoritos-kim/bms-electron-app): desktop shell
