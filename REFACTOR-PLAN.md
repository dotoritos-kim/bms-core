# bms-core 리팩토링 계획서

> 분석 대상: `@rhythm-archive/bms-core` v0.1.0
> 분석 일자: 2026-05-05
> 작성자: 리팩토링 분석 에이전트 (bms-core 담당)

---

## 1. Executive Summary

- **bms-core**는 30개 TS 파일/5,167라인의 BMS 포맷 파서·라이터로, 외부 3개 패키지(bms-editor / bms-player / bms-electron-app)의 의존 루트이므로 공개 API 보존이 최우선 조건이다.
- 핵심 이슈는 (1) `parser/utils/dataStructure.ts`의 자체 런타임 검증 시스템, (2) `BMSWriter`의 God-class 성격(614라인, fromBMSChart에 채널분류·LN페어링·BGM할당·멀티키음병합 책임 혼재), (3) `compiler` 내부의 거대한 #IF/#SWITCH 상태머신.
- `any/unknown` 9건은 모두 외부 boundary(스키마 검증, fetch, header 직렬화)에 한정되어 있어 Generic + Discriminated Union + 협소한 Type Guard로 수렴 가능하다.
- 디자인 패턴 도입은 **Strategy(채널 매핑/스타일 감지)**, **Builder(Notes/Chart 빌드)**, **Visitor(BMSObject 채널 분기)**, **Result/Either(컴파일 경고)** 가 자연스럽다.
- 리팩토링은 외부 API를 변경하지 않는 내부 구조개선 위주로 6단계 PR로 분할한다 — Breaking 변경은 발생하지 않도록 설계한다.

---

## 2. 현재 구조 매핑

### 2.1 폴더 트리

```
src/
├── index.ts                              (56 line)  공개 API 배럴
├── parser/
│   ├── index.ts                          (185 line) BMSParser facade + re-export
│   ├── bms/
│   │   ├── chart.ts                      (43)       BMSChart (헤더+오브젝트+박자)
│   │   ├── headers.ts                    (65)       BMSHeaders 단일/다중값 저장소
│   │   └── objects.ts                    (67)       BMSObjects 컬렉션 + BMSObject 타입
│   ├── modules/
│   │   ├── bga/index.ts                  (132)      #BGAxx 정의 추출
│   │   ├── compiler/index.ts             (341)      #RANDOM/#SWITCH 제어흐름 + 라인 파싱
│   │   ├── exrank/index.ts               (144)      #EXRANK + 채널 A0
│   │   ├── keysounds/index.ts            (92)       #WAV / #VOLWAV 매핑
│   │   ├── notes/
│   │   │   ├── index.ts                  (229)      Notes + BMSNoteBuilder
│   │   │   ├── note.ts                   (56)       BMSNote 타입 + Note Façade
│   │   │   └── channels.ts               (550)      11종 채널 매핑 + 스타일 자동감지
│   │   ├── positioning/index.ts          (222)      #SCROLL + BASEBPM 정규화
│   │   ├── reader/
│   │   │   ├── index.ts                  (141)      문자집합 자동 감지
│   │   │   ├── types.ts                  (3)        ReaderOptions
│   │   │   └── getReaderOptionsFromFilename.ts (17) 파일명 힌트
│   │   ├── songInfo/index.ts             (118)      메타 헤더 추출 + 부제 파싱
│   │   ├── spacing/index.ts              (101)      #SPEED 세그먼트
│   │   ├── speedcore/
│   │   │   ├── index.ts                  (121)      Speedcore 키프레임 엔진
│   │   │   └── segment.ts                (16)       SpeedSegment Façade
│   │   ├── text/index.ts                 (137)      #TEXT + 채널 99
│   │   ├── timeSignatures/index.ts       (133)      박자표 + measure↔beat 변환
│   │   └── timing/index.ts               (203)      BPM/STOP → 시간변환
│   └── utils/
│       ├── dataStructure.ts              (83)       자체 런타임 스키마 검증
│       ├── lodash.ts                     (7)        lodash 대체 헬퍼 4종
│       └── match.ts                      (18)       정규식 분기 빌더
└── writer/
    ├── index.ts                          (614)      BMSWriter God-class
    ├── headerWriter.ts                   (300)      헤더 직렬화 + 역파싱
    ├── channelWriter.ts                  (793)      채널 직렬화 + IIDX 역매핑
    └── types.ts                          (180)      Editable* / BMS* 타입군
```

### 2.2 파일별 역할 요약

| 파일 | 책임 | 역할 분류 |
|---|---|---|
| `index.ts` | barrel, export | 공개 API |
| `parser/index.ts` | `BMSParser` facade | facade |
| `bms/chart.ts` | 컴파일 산출물 컨테이너 | 도메인 모델 |
| `bms/headers.ts` | 헤더 단일/다중 값 저장소 | 도메인 모델 |
| `bms/objects.ts` | `BMSObject` 컬렉션 + dedup | 도메인 모델 |
| `compiler` | 텍스트→`BMSChart` 변환, 제어 흐름 | 핵심 파이프라인 |
| `reader` | 인코딩 자동 감지 | I/O boundary |
| `notes` | 채널→컬럼 매핑, LN 페어링 | 응용 도메인 |
| `notes/channels.ts` | 11개 매핑 + `detectBMSStyle` | 데이터/Strategy 후보 |
| `timing` / `positioning` / `spacing` | Speedcore 활용 좌표계 변환 | 응용 도메인 |
| `bga` / `exrank` / `text` | 보조 모듈 | 부가 기능 |
| `speedcore` | 키프레임 보간 엔진 | 핵심 유틸 |
| `keysounds` / `songInfo` | 헤더 기반 추출자 | 응용 도메인 |
| `writer/index.ts` | `BMSWriter` 클래스 + diff/clone | 직렬화 facade(God) |
| `writer/headerWriter.ts` | header ↔ data 양방향 변환 | 직렬화 |
| `writer/channelWriter.ts` | tick→채널 데이터 출력, IIDX 역매핑 상수 | 직렬화 |
| `utils/dataStructure.ts` | 자체 런타임 검증 (비표준) | 인프라 |
| `utils/match.ts` | regex 분기 헬퍼 | 인프라 |
| `utils/lodash.ts` | uniq/map/values/assign 4종 | 인프라 |

---

## 3. 공개 API 표면 (외부 의존자 영향 추적용)

### 3.1 `@rhythm-archive/bms-core` 루트 export

값 export:
- `BMSParser`, `Reader`, `Compiler`, `KeySounds`, `Timing`, `SongInfo`, `Positioning`, `Spacing`, `BMSChart`, `Notes`, `TimeSignatures`
- `BMSWriter`, `writeHeaders`, `createEmptyHeaders`, `parseHeadersToData`, `writeChannels`, `IIDX_SP_REVERSE`, `IIDX_DP_REVERSE`

타입 export:
- `ReaderOptions`, `BMSNote`, `NoteType`, `TimingAction`, `BaseTimingAction`, `BPMTimingAction`, `StopTimingAction`, `ISongInfoData`, `PositioningSegment`, `SpacingSegment`
- `BMSWriterOptions`, `EditableBMSChart`, `EditableBMSNote`, `BMSHeaderData`, `BMSBpmChange`, `BMSStopEvent`, `BMSBgaEvent`, `ReverseChannelMapping`, `ChartDiff`

### 3.2 서브패스 export
- `@rhythm-archive/bms-core/parser` → `parser/index.ts`
- `@rhythm-archive/bms-core/writer` → `writer/index.ts`

### 3.3 외부 의존자가 의존할 가능성이 높은 메서드
- `BMSParser.fetchFromUrl/readBuffer/compileString/getSongInfo/getTiming/getPositioning/getNotes/getKeySounds/calculateTotalPlayTime`
- `BMSChart.headers/objects/timeSignatures/measureToBeat`
- `BMSHeaders.get/getAll/each/set`
- `BMSObjects.add/all/allSorted`
- `Notes.fromBMSChart/all/count`, `Notes.CHANNEL_MAPPING`(정적 네임스페이스)
- `Timing.beatToSeconds/secondsToBeat/bpmAtBeat/getBpmSegments/getInitialBpm/getEventBeats`
- `TimeSignatures.set/get/getBeats/measureToBeat/beatToMeasure/fromMap/toMap`
- `BMSWriter.write/fromBMSChart/createEmptyChart/cloneChart/diffCharts`

> **위 시그니처는 모두 보존**한다. 내부 구조 개선 시에도 메서드명·파라미터·리턴타입을 유지해야 한다.

---

## 4. 식별된 이슈

### HIGH

**H1. `BMSWriter` God-class** (writer/index.ts 614 line)
- `write`(LNOBJ 처리) + `fromBMSChart`(채널 분류 + LN 페어링 + BGM 채널 할당 + 멀티 키음 병합) + `cloneChart`/`diffCharts` 등 여러 책임이 한 클래스에 응축.
- `fromBMSChart`(165–330라인)는 8개 분기로 채널 종류를 처리, `_handleX` 메서드가 없는 거대 메서드.
- **변경 시 회귀 위험 매우 큼**. 분리가 시급.

**H2. `parser/utils/dataStructure.ts` 자체 검증 시스템 — 비표준 런타임 의존**
- `Schema = string | number | Function | Record<string, unknown>` — 문자열 리터럴(`'string'`)·생성자·중첩 객체를 모두 받는 Stringly-typed 검증.
- `unknown`/`as` 단언이 4건 집중. 타입과 런타임 검증이 분리되어 있고, `_isMaybe` 플래그로 옵션을 표현.
- 사용처는 `Note`(notes/note.ts)와 `Segment`(speedcore/segment.ts) 두 군데뿐 — 비용 대비 효용이 낮다.

**H3. `compiler/index.ts` 거대 함수 (341 line) + 다중 스택 상태머신**
- `compile`이 전체 함수 안에서 `randomStack/skipStack/matchedStack/switchStack` 4개 스택을 직접 조작.
- `match(text).when(...).when(...)` 체인 두 번 — 제어흐름과 본문 처리. 한 함수에서 23종 패턴 처리.
- 파싱 정확도 회귀 위험이 가장 높은 영역인데, 단일 함수로 응집되어 있어 테스트가 통합테스트에 의존.

**H4. `BMSWriter.fromBMSChart` ↔ `BMSNoteBuilder` 로직 중복**
- `notes/index.ts:_handle`, `_handleNormalNote`, `_handleLongNote`, `_normalizeChannel`이 `writer/index.ts:fromBMSChart`(LN 페어링/normalizeChannel)와 거의 동일 알고리즘을 중복 구현.
- `LNOBJ` 처리도 양쪽에 별도 존재. 한쪽 버그 수정 시 동기화 누락 위험.

### MID

**M1. `BMSParser.calculateTotalPlayTime` (parser/index.ts:117–177)** — `Timing` 클래스가 이미 같은 일을 더 정확히 함에도 별도 BPM 맵·STOP 처리 로직이 있음. 코드 중복 + 진실의 단일 출처(SSoT) 위반.

**M2. `BMSObjects.add` O(n²) 중복 검사** (objects.ts:18–28) — 매 add마다 전체 배열 선형 탐색. 큰 차트(수만 객체)에서 컴파일 단계 핫스팟이 될 수 있음.

**M3. `Speedcore._segmentAt` 선형 탐색** (speedcore/index.ts:78–83) — `_segments`가 정렬 보장이 있다면 이진탐색으로 O(log n) 가능. 시간/포지션 변환은 빈번 호출.

**M4. `console.log` 디버그 출력** (compiler/index.ts:279–283) — 라이브러리에서 항상 stdout에 출력. 의존자 콘솔 오염. 옵션 또는 logger DI 필요.

**M5. `notes/channels.ts:detectBMSStyle` 휴리스틱이 단일 함수에 응축 (84 line)** — 룰이 추가될 때마다 if 분기가 늘어남. 룰 객체 컬렉션 + 점수 기반 결정으로 분해 가능.

**M6. `headerWriter.ts` `BMSHeaderData` 인덱스 접근 시 `as keyof BMSHeaderData`** — 헤더 키-타입 매핑이 유지보수 시 누락되기 쉬움. 매핑 테이블 추출 권장.

**M7. `BMSWriter.diffCharts`의 `_modifiedNoteMap` 미사용 변수** (writer/index.ts:546–547) — 의도된 흔적이라면 TODO화 + ESLint disable 코멘트. 잡음 제거.

**M8. `Notes.CHANNEL_MAPPING = ChannelMapping`** (notes/index.ts:23) — 정적 네임스페이스 어태치. tree-shaking 방해 + Notes 내부 책임 분산. 외부 노출이 필요하면 별도 named export로 충분.

### LOW

**L1.** `parser/utils/lodash.ts`는 4개 함수만 사용하고 lodash 의존성을 그대로 둠. 내부에서 만든 헬퍼와 lodash 모두 유지 — `lodash` 의존성 제거 가능 검토.

**L2.** `writer/types.ts`의 `BMSHeaderData`에 `Map`·`undefined`가 혼재 — JSON 직렬화 시 정보 손실 가능성. (현재 외부 노출 형태이므로 변경 신중)

**L3.** `match.ts`가 `match` 함수를 export — 표준 라이브러리 `String.prototype.match`와 식별자 충돌. 의미를 살린 이름(`matchPattern`/`firstMatch`) 권장 — 단 외부 export가 아니므로 자유.

**L4.** `parser/index.ts:36` 클래스 선언 직전 빈 줄 누락, `parser/modules/notes/index.ts:54 void BMSChart;` 류 패턴 다수 — tree-shake 회피 흔적인지 확인 필요.

**L5.** `compiler`에서 `lineNumber`를 `BMSObject`에 `as BMSObject`로 강제 주입 (compiler/index.ts:300). `BMSObject` 인터페이스에는 `lineNumber`가 없음 — 의도라면 옵셔널 필드 추가, 아니면 별도 메타 맵.

---

## 5. 디자인 패턴 적용 계획

### P1. Strategy: 채널 매핑 / 스타일 감지 (HIGH)

**위치**: `parser/modules/notes/channels.ts`, `parser/modules/notes/index.ts`, `writer/index.ts`, `writer/channelWriter.ts`

**현재**:
```ts
// parser
export function createCombinedMapping(style: BMSStyle = 'iidx', isDP: boolean = false): { ... } {
  switch (style) { case 'keyboard': ...; case 'pms': ...; default: ... }
}
export function detectBMSStyle(objects, playerHeader?): { style, isDP } { /* 84 line if-chain */ }
```

**제안**:
```ts
export interface ChannelStyleStrategy {
  readonly id: BMSStyle;
  readonly score: (stats: ChannelStats, playerHeader?: string) => number; // 감지용 점수
  readonly buildMapping: (mode: 'sp' | 'dp') => Readonly<Record<string, string>>;
  readonly buildReverseMapping: (mode: 'sp' | 'dp') => ReverseChannelMapping;
}

export const IIDX_STRATEGY: ChannelStyleStrategy = { ... };
export const KEYBOARD_STRATEGY: ChannelStyleStrategy = { ... };
export const PMS_STRATEGY: ChannelStyleStrategy = { ... };

export const STRATEGIES: readonly ChannelStyleStrategy[] = [PMS_STRATEGY, KEYBOARD_STRATEGY, IIDX_STRATEGY];

export function detectStyle(objects: BMSObject[], playerHeader?: string): { strategy: ChannelStyleStrategy; isDP: boolean } {
  const stats = computeChannelStats(objects);
  const ranked = STRATEGIES.map(s => ({ s, score: s.score(stats, playerHeader) })).sort((a, b) => b.score - a.score);
  return { strategy: ranked[0].s, isDP: deriveIsDP(stats, playerHeader) };
}
```

**효과**: parser와 writer가 같은 `Strategy` 객체에서 forward/reverse 매핑을 가져오므로 `IIDX_SP_REVERSE`/`IIDX_DP_REVERSE`도 strategy 내부로 흡수, **H4 중복 제거의 토대**.

**우선순위**: HIGH

---

### P2. Builder + Visitor: BMSObject 처리 파이프라인 (HIGH)

**위치**: `parser/modules/notes/index.ts:_handle/_handleX`, `writer/index.ts:fromBMSChart`

**현재** (fromBMSChart 내부):
```ts
for (const obj of objects) {
  const channel = obj.channel.toUpperCase();
  if (channel === '02') { /* 박자표 */ continue; }
  if (channel === '03') { /* 직접 BPM */ continue; }
  if (channel === '08') { /* 확장 BPM */ continue; }
  if (channel === '09') { /* STOP */ continue; }
  if (channel === '04' || channel === '06' || channel === '07') { /* BGA */ continue; }
  if (firstChar === '5' || firstChar === '6') { /* LN */ continue; }
  if (['1','2','3','4','D','E'].includes(firstChar)) { /* 일반 노트 */ continue; }
  if (channel === '01') { /* BGM */ }
}
```

**제안**: Visitor + EditableChartBuilder
```ts
interface ObjectVisitor {
  onTimeSignature?(obj: BMSObject): void;
  onBpmDirect?(obj: BMSObject): void;
  onBpmExtended?(obj: BMSObject): void;
  onStop?(obj: BMSObject): void;
  onBga?(obj: BMSObject, layer: '04' | '06' | '07'): void;
  onLongNote?(obj: BMSObject): void;
  onPlayableLike?(obj: BMSObject, kind: 'playable' | 'invisible' | 'landmine'): void;
  onBgm?(obj: BMSObject): void;
}

function dispatch(obj: BMSObject, v: ObjectVisitor): void { /* channel → method */ }

class EditableChartBuilder implements ObjectVisitor {
  // 상태 + 각 메서드 구현 (LN 페어링, BGM 채널 할당 등)
  build(): EditableBMSChart { ... }
}
```

**효과**: `BMSWriter.fromBMSChart`가 ~30라인으로 축소, `BMSNoteBuilder`도 같은 Visitor 구조로 통일하여 **H4 중복 제거**.

**우선순위**: HIGH

---

### P3. Result/Either: 컴파일 결과 타입화 (MID)

**위치**: `parser/modules/compiler/index.ts`

**현재**:
```ts
const result = {
  headerSentences: 0, channelSentences: 0, controlSentences: 0,
  skippedSentences: 0, malformedSentences: 0,
  chart, warnings: [] as { lineNumber: number; message: string }[],
  wavStats: { total: 0, inSkippedBlocks: 0 },
};
return result;
```

**제안**:
```ts
type CompileWarning = { lineNumber: number; message: string; code: 'INVALID_DIRECTIVE' | 'UNCLOSED_LN' | ... };
type CompileStats = { headerSentences: number; channelSentences: number; ... };
type CompileResult = { chart: BMSChart; warnings: readonly CompileWarning[]; stats: CompileStats };
export function compile(text: string, options?: Partial<BMSCompileOptions>): CompileResult { ... }
```

**효과**: `warnings`가 string에서 코드 기반 enum으로 격상 → 외부에서 분류·필터링 가능. 외부 호환성을 위해 기존 필드 유지하면서 `code`만 추가 → **Non-breaking**.

**우선순위**: MID

---

### P4. State Machine 분리: #RANDOM/#SWITCH 제어 흐름 (MID)

**위치**: `parser/modules/compiler/index.ts:128–238`

**현재**: 4개 스택을 `compile` 본문에서 직접 조작.

**제안**:
```ts
class ControlFlowState {
  private randomStack: number[] = [];
  private skipStack: boolean[] = [false];
  private matchedStack: boolean[] = [false];
  private switchStack: SwitchFrame[] = [];
  beginRandom(value: number): void;
  beginIf(value: number): void;
  beginElseIf(value: number): void;
  // ... 8개 전이 메서드
  isSkipped(): boolean;
}
```

**효과**: `compile` 가독성 ↑, 단위테스트 가능. 외부 동작 동일 → **Non-breaking**.

**우선순위**: MID

---

### P5. Schema 라이브러리 통합 또는 제거 — `dataStructure.ts` (MID)

**옵션 A (선호)**: 자체 검증 폐기 + 컴파일 타임 체크 위주로. 실제 사용처(`Note`, `Segment`)에서 외부 입력은 사실상 라이브러리 내부에서 생성되므로 런타임 검증 불필요. 외부 입력은 `compile`의 텍스트뿐인데 거기는 이미 정규식으로 검증함.

**옵션 B**: `zod`/`valibot` 등 표준 도입 — 현재 의존성 0개 → 1개 증가, 번들 비용. 이 라이브러리 성격상 **옵션 A 권장**.

**효과**: `unknown`/`Function` 4건 즉시 제거. 번들 크기 감소.

**우선순위**: MID

---

### P6. Speedcore 이진 탐색 (LOW)

**위치**: `parser/modules/speedcore/index.ts:78–83`

`_segments`는 시간순으로 push되며 변경되지 않음 → 이진 탐색으로 교체 가능. 외부 시그니처 동일 → **Non-breaking**, 성능 개선.

**우선순위**: LOW

---

## 6. 타입 안전성 정리 계획 (`any`/`unknown` 위치별 표)

| # | 파일:라인 | 현재 코드 | 사용 이유 | 추천 전략 | 영향 범위 | 우선순위 |
|---|---|---|---|---|---|---|
| 1 | `dataStructure.ts:2` | `type Schema = string \| number \| Function \| Record<string, unknown>` | 자체 검증 시스템의 다형 스키마 표현 | **제거**(P5 옵션A) — 자체 검증 폐기 | parser 내부 2개 파일 | HIGH |
| 2 | `dataStructure.ts:9` | `validate(schema: Schema, value: unknown)` | 임의 입력 검증 | P5 시 제거. 유지 시 Generic + Discriminated Union: `type Schema<T> = ...` | 동상 | HIGH |
| 3 | `dataStructure.ts:18` | `as { validate?: ...; name: string }` | 함수 객체에 validate 메서드 attached 검사 | P5 시 제거. Type Guard: `function isValidator(f: unknown): f is { validate(v: unknown): void }` | 동상 | HIGH |
| 4 | `dataStructure.ts:21` | `value instanceof (schema as new (...args: unknown[]) => unknown)` | 생성자 타입 체크 | P5 시 제거. 유지 시 `Newable` 타입 + `is` 가드 | 동상 | HIGH |
| 5 | `reader/index.ts:129` | `readAsync(...args: unknown[])` | 오버로드 시그니처 통합 위해 rest 사용 | **Generic 오버로드**로 변경: 두 시그니처 직접 정의 + 본문에서 정상 파라미터 사용 | reader 단일 파일 | MID |
| 6 | `reader/index.ts:135` | `catch (e: unknown)` | TS strict 기본 | 그대로 유지(올바른 사용) | — | OK |
| 7 | `headerWriter.ts:31` | `formatHeaderValue(key: string, value: unknown)` | `BMSHeaderData[key]`이 키마다 다른 타입(number/string/undefined) | **Generic + 키별 디스패치**: `formatHeaderValue<K extends keyof BMSHeaderData>(key: K, value: BMSHeaderData[K])` 또는 룩업 테이블 `{ bpm: (v: number) => string, ... }` | writer 내부 | MID |
| 8 | `writer/index.ts:594-595` | `oldValue: unknown; newValue: unknown` (`ChartDiff.headerChanges`) | 헤더 키마다 값 타입이 달라 통합 타입 어려움 | **Discriminated Union**: `type HeaderChange = { field: 'bpm'; old?: number; new?: number } \| ...` (자동 생성 가능: `{ [K in keyof BMSHeaderData]: { field: K; old?: BMSHeaderData[K]; new?: BMSHeaderData[K] } }[keyof BMSHeaderData]`) | **공개 API — Breaking 가능** ⚠ | MID |
| 9 | `songInfo/index.ts:44` | `constructor(info: Record<string, unknown>)` | 부분 객체 수신 | `Partial<ISongInfoData>` (이미 `fromBMSChart`에서 그렇게 사용) | songInfo 단일 | LOW |

> **Note**: `unknown` 사용 자체는 안전하므로 모두 제거할 필요는 없다. 위 표에서 OK 표시는 유지를 권장한다.

### 8번(`ChartDiff.headerChanges`) 호환성 처리

옵션:
- **A (Non-breaking)**: 현 시그니처 유지하면서 내부적으로만 더 좁은 타입 사용. JSDoc으로 키별 타입 안내.
- **B (Minor breaking)**: Discriminated Union으로 변경 → 외부 사용자가 `if (change.field === 'bpm') change.old /* number? */` 형태로 바꿔야 함. semver minor 권장.

→ **옵션 A 우선, 1.0 메이저 시 옵션 B**.

---

## 7. 폴더/파일 재구성 제안

### 현재 문제
- `parser/modules/*` 안에 좌표계 변환(timing/positioning/spacing/speedcore/timeSignatures), 응용 추출자(notes/keysounds/songInfo/bga/exrank/text), I/O(reader), 핵심 파이프라인(compiler)이 평탄하게 섞여 있음.
- `writer`는 `parser/`와 형제이지만 내부적으로 `parser/modules/notes/channels`에 의존(detectBMSStyle 등) — 의존성 방향 비대칭.

### 제안 (외부 export 유지하면서 내부 폴더만 재배치)

```
src/
├── index.ts                     ← 변경 없음
├── parser/
│   ├── index.ts                 ← BMSParser facade (현 위치)
│   ├── compile/                 ← (rename from modules/compiler)
│   │   ├── compile.ts
│   │   ├── controlFlow.ts       ← P4 분리
│   │   └── matchers.ts
│   ├── domain/                  ← (rename from bms/)
│   │   ├── chart.ts
│   │   ├── headers.ts
│   │   └── objects.ts
│   ├── extractors/              ← (Notes/SongInfo/KeySounds/BGA/ExRank/Text)
│   │   ├── notes/
│   │   ├── songInfo/
│   │   ├── keysounds/
│   │   ├── bga/
│   │   ├── exrank/
│   │   └── text/
│   ├── timing/                  ← timing/positioning/spacing/speedcore/timeSignatures
│   │   ├── speedcore/
│   │   ├── timeSignatures/
│   │   ├── timing.ts
│   │   ├── positioning.ts
│   │   └── spacing.ts
│   ├── io/                      ← (rename from modules/reader)
│   │   └── reader/
│   ├── strategies/              ← P1 신규
│   │   ├── styleStrategy.ts
│   │   ├── iidx.ts
│   │   ├── keyboard.ts
│   │   └── pms.ts
│   └── utils/
│       ├── match.ts
│       └── (dataStructure 제거)
└── writer/
    ├── index.ts                 ← BMSWriter facade
    ├── editableChartBuilder.ts  ← P2 신규 (fromBMSChart 추출)
    ├── headerWriter.ts
    ├── channelWriter.ts
    ├── diff.ts                  ← diffCharts/cloneChart 추출
    └── types.ts
```

### 마이그레이션 원칙
- `barrel(index.ts)`만 import path를 바꾸고 외부 export 명세는 100% 유지.
- `parser/modules/*` 경로를 직접 참조하는 외부 코드는 없다는 가정(`exports` 필드는 `./parser`, `./writer`만 노출). 만약 deep import가 있다면 별칭 alias(re-export shim) 유지.

---

## 8. 단계별 실행 계획 (작은 PR 단위)

### PR-1: 인프라 정비 (LOW 위험)
- M4 `console.log` 제거 또는 옵션화: `BMSCompileOptions.logger?: { info, warn }`
- M7 `_modifiedNoteMap` 미사용 변수 제거
- L1 `lodash` 의존성 제거 검토 (`assign/uniq/values/map` 표준화)
- M6 `BMSHeaderData` 키 타입 매핑 테이블 도출
- 변경 표면: 내부만, 외부 API 무변경.

### PR-2: 타입 안전성 — 자체 검증 시스템 폐기 (P5)
- `parser/utils/dataStructure.ts` 삭제
- `notes/note.ts:Note` Façade 호출, `speedcore/segment.ts:Segment` Façade 호출 제거
- 9개 `any/unknown` 중 1–4번 즉시 해결
- 외부 export 변동 없음 (`Note`, `Segment`는 internal).

### PR-3: 컴파일러 분해 (P3 + P4)
- `controlFlow.ts` 분리 (P4)
- `CompileResult` 타입 도출 (P3) — 기존 필드 유지 + `code` 추가만
- 단위 테스트 추가: 각 #IF/#SWITCH 케이스
- 외부 변동 없음.

### PR-4: Strategy 도입 (P1)
- `parser/strategies/` 추가, IIDX/Keyboard/PMS 객체화
- `notes/channels.ts`는 strategy 객체로부터 매핑을 노출하는 thin re-export 레이어로 축소
- `IIDX_SP_REVERSE`/`IIDX_DP_REVERSE`는 strategy 객체로부터 파생 + 기존 export 그대로 유지(deprecated 주석)
- 외부 변동 없음.

### PR-5: Visitor + Builder (P2)
- `EditableChartBuilder` 추출, `BMSWriter.fromBMSChart`는 위임만 수행
- `BMSNoteBuilder`도 동일 visitor를 활용하여 H4 중복 제거
- 회귀 방지: 기존 `tests/writer-roundtrip-strict.test.ts` + 신규 visitor 단위 테스트
- 외부 변동 없음.

### PR-6: 성능 + 잔여 정리 (LOW)
- M2 `BMSObjects.add`: 마지막 위치만 빠르게 찾는 `Map<key, index>` 캐시
- M3 `Speedcore._segmentAt`: 이진 탐색
- M1 `calculateTotalPlayTime`: 내부적으로 `Timing` 사용하도록 단순화
- 외부 동작 동일.

> 각 PR은 **작은 commit + 회귀 테스트 통과 + 외부 export diff 0** 을 머지 조건으로 한다.

---

## 9. 외부 호환성 영향

### 9.1 Non-breaking 변경 (PR-1 ~ PR-6 전부)
- 모든 클래스/함수/타입의 시그니처 보존
- 내부 폴더 재배치는 `dist/` 출력 경로에 영향 없음(rollup/vite가 단일 entry로 번들)
- `console.log` 제거 → 동작이 바뀌지만 로그는 부수효과이므로 호환 분류상 patch

### 9.2 잠재 Breaking 변경 (1.0 마일스톤에 검토)

| 항목 | 영향 | 권고 |
|---|---|---|
| `ChartDiff.headerChanges`의 `unknown` → discriminated union | 외부 사용자가 union narrowing 필요 | semver **minor**(0.x이므로) 또는 1.0 동시 |
| `Notes.CHANNEL_MAPPING` 정적 네임스페이스 제거 | 외부에서 `Notes.CHANNEL_MAPPING.IIDX_P1` 형태로 쓰면 깨짐 | `STRATEGIES` named export 유도, deprecated 주석 1버전 유지 |
| `IIDX_SP_REVERSE`/`IIDX_DP_REVERSE`를 strategy 산출로 변경 | 객체 식별성(===)이 바뀔 수 있음 | 동일 객체를 export하되 strategy.buildReverseMapping에 위임 |
| `compile()`의 `warnings` 항목 형식에 `code` 필드 추가 | 추가만 — non-breaking | 안전 |

### 9.3 외부 의존자별 영향
- **bms-editor**: `BMSWriter.fromBMSChart`/`write`/`cloneChart`/`diffCharts`를 가장 많이 쓸 가능성 높음 → PR-5에서 회귀 테스트 강화 필요.
- **bms-player**: `BMSParser`/`Notes`/`Timing` 중심 → PR-3, PR-6의 동작 동등성을 차트 비교 테스트로 검증.
- **bms-electron-app**: `Reader`/`fetchFromUrl` 중심 → PR-2에서 reader 오버로드 변경 시 회귀 확인.

---

## 10. 검증 계획

### 10.1 컴파일 / 정적 분석
- `npm run type-check` (tsc --noEmit) 모든 PR에서 통과
- 가능하다면 `tsc --strict --noUncheckedIndexedAccess` 추가 옵션으로 부분 빌드해 인덱스 접근 안전성 검증
- (선택) `eslint --max-warnings 0` 추가, `@typescript-eslint/no-explicit-any`, `no-unsafe-assignment` 룰 활성화

### 10.2 단위 테스트 (vitest)
기존 11개 테스트:
- `parser.test.ts` / `playTime.test.ts` / `extreme.test.ts` / `malicious.test.ts` / `stress.test.ts`
- `speedcore.test.ts` / `timeSignatures.test.ts` / `timing-nan.test.ts`
- `writer.test.ts` / `writer-lnobj.test.ts` / `writer-roundtrip-strict.test.ts`

추가할 테스트:
- `compiler/controlFlow.test.ts` — 각 #IF/#SWITCH/#ELSEIF/#ELSE/#CASE/#DEF/#SKIP 케이스
- `strategies/styleStrategy.test.ts` — 각 strategy의 `score`가 대표 차트에서 올바르게 1등인지
- `editableChartBuilder.test.ts` — Visitor 분기별 단위 테스트(BPM/STOP/BGA/LN/LNOBJ/BGM)
- `diff.test.ts` — `diffCharts`의 모든 변경 카테고리

### 10.3 회귀 테스트 (라운드트립)
- 기존 `writer-roundtrip-strict.test.ts`에 더해, 실제 외부 의존자에서 사용 중인 샘플 BMS 파일(가능하다면 `bms-editor/tests/fixtures` 등에서 가져옴)로 parse → write → re-parse → 노트 ID/beat/keysound 동일성 확인.

### 10.4 성능 회귀
- `tests/stress.test.ts`(존재함)에 시간 측정 추가 — PR-6 이후 수치가 악화되지 않는지 비교

### 10.5 외부 호환성 스모크
- bms-editor / bms-player / bms-electron-app 각각의 `npm run build` + 테스트가 새 bms-core(로컬 link)로 통과하는지 — 워크스페이스 통합 단계에서 1회.

---

## 11. 위험 요소

| 위험 | 가능성 | 영향 | 완화책 |
|---|---|---|---|
| `BMSWriter.fromBMSChart` 분해 시 LN 페어링/BGM 채널 할당 미묘한 회귀 | 중 | **매우 큼** (외부 에디터 깨짐) | PR-5 전후 round-trip 테스트 + 실제 차트 fixtures 비교 |
| Strategy 객체화 시 detectBMSStyle 점수 휴리스틱이 기존 분기와 미세하게 달라짐 | 중 | 중 (자동감지 결과 변동) | 스냅샷 테스트: 기존 함수와 새 함수의 결과를 동일 입력에서 1:1 비교 |
| `dataStructure.ts` 폐기 시 과거에 의존하던 코드 누락 | 낮 | 낮 | grep으로 import 검색, 사용처 2개만 확인됨 |
| `BMSObjects.add`의 dedup 의미 변경 | 낮 | 중 | `_objects` 인덱스 캐시는 동일 의미를 유지하면서 O(n²)→O(1) |
| `console.log` 제거 시 사용자가 디버그 출력에 의존 | 낮 | 낮 | 옵션 logger 도입, 기본 silent — semver patch로 안내 |
| 폴더 재배치로 `dist/`의 deep import 경로가 변경될 가능성 | 낮 | 중 | `package.json`의 `exports`가 두 entry만 노출하므로 deep import는 비공식. 그래도 `exports`에 명시적 차단 추가 가능 |
| `unknown` → discriminated union 변경이 외부 type-check를 깸 | 낮 | 중 | 1.0 메이저까지 보류, 그 전까지는 type narrowing 헬퍼만 추가 export |
| 외부 의존자(bms-editor 등)가 `Notes.CHANNEL_MAPPING`처럼 비공식 surface 사용 중 | 중 | 중 | 워크스페이스 grep으로 사용처 점검 후 deprecated alias 유지 |

---

## 부록 A. 측정값

- 총 라인 수: 5,167 (src 기준)
- 가장 큰 파일: `writer/channelWriter.ts` (793) → `writer/index.ts` (614) → `parser/modules/notes/channels.ts` (550) → `parser/modules/compiler/index.ts` (341) → `writer/headerWriter.ts` (300)
- `any/unknown` 출현: 9건 / 4 파일
- 외부 export 심볼: 26개 (값 17 + 타입 19, 일부 중복)
- 테스트 파일: 11개

## 부록 B. 향후 개선 제안 (범위 외)

- BMSON(.bmson JSON) 포맷 — README는 언급하지만 코드에는 미구현. 별도 모듈로 추가 시 strategy 패턴 재활용 가능.
- Streaming parser — 현재는 텍스트 전체를 메모리에 올림. 거대 차트 위해 줄 단위 readable stream 인터페이스 검토.
- Worker 분리 — `BMSParser.compileString`이 대형 차트에서 메인 스레드 블로킹. 분리 시 외부 API에 영향 없도록 facade 유지.
