# `@rhythm-archive/bms-core`

Parser and domain model for BMS (Be-Music Script) chart files. The package is
runtime-agnostic — no DOM dependencies, no audio engine — and ships pure
TypeScript.

🇰🇷 [한국어 README](README.ko.md) <!-- Phase 4 follow-up: split Korean version -->

## What it does

- **Reader** (`src/parser/modules/reader/`) — auto-detects character encoding
  and decodes the byte stream. Supported encodings:
  `UTF-8`, `Shift-JIS`, `GBK`, `GB18030`, `Big5`, `EUC-KR`, `Windows-1251`.
  Filename overrides: `.sjis.<ext>`, `.euc_kr.<ext>`, `.utf8.<ext>`,
  `.win1251.<ext>`.
- **Parser** — walks `#TITLE`, `#ARTIST`, `#BPM`, `#WAVxx`, channel data and
  produces a structured chart with notes, BGM lanes, time-bound BPM/STOP/SCROLL
  events, key sounds, and section bars.
- **Writer** — round-trip serialisation back to BMS text.
- **Modules** — `Timing`, `Positioning`, `Spacing`, `KeySounds`, `SongInfo`,
  `Notes` exposed for consumers that need partial views.

## Usage

```ts
import { BMSParser } from '@rhythm-archive/bms-core';

const buffer = await fs.readFile('chart.bms');
const chart = new BMSParser().parse(buffer);
console.log(chart.songInfo.title, chart.notes.length);
```

For consumers that already know the encoding (e.g. a `#ENCODING` sidecar):

```ts
import { read } from '@rhythm-archive/bms-core/parser';
const text = read(buffer, { forceEncoding: 'windows-1251' });
```

## Encoding heuristic notes

Auto-detection runs encodings in priority order and rejects a candidate when
the result contains `U+FFFD` or C1 control bytes. Short Cyrillic-only payloads
can collide with Shift-JIS (the bytes also form valid half-width katakana).
For Russian charts, prefer the explicit `.win1251` extension or the
`forceEncoding` option.

## Versioning

Standard semver. The chart object shape is part of the public API; structural
breaking changes require a major bump.

## Related

- [`@rhythm-archive/bms-player`](https://github.com/dotoritos-kim/bms-player) — runtime player
- [`@rhythm-archive/bms-editor`](https://github.com/dotoritos-kim/bms-editor) — chart editor UI
- [`bms-electron-app`](https://github.com/dotoritos-kim/bms-electron-app) — desktop shell
