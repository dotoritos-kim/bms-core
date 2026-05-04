# bms-core Stage 1 (PR-1) 독립 검증 리포트

> 검증 대상: `refactor/stage-1-infra-cleanup` (head) ↔ `master` (base)
> PR: https://github.com/dotoritos-kim/bms-core/pull/1
> 검증 일자: 2026-05-05
> 검증자: 독립 검증 에이전트 (bms-core 담당)

---

## 1. 요약

**Verdict: APPROVE**

PR-1은 REFACTOR-PLAN.md §8의 "PR-1: 인프라 정비" 항목 중 **M4 (console.log 옵션화)** 와 **M7 (\_modifiedNoteMap 제거)** 두 건을 정확히 수행했다. 변경 표면은 매우 작고(2 commit / 2 file / +17 / -8), 외부 공개 API는 추가-only(non-breaking)이며, 빌드·타입체크는 통과, 테스트 실패는 PR 도입 회귀가 아니라 master 베이스라인부터 존재하는 환경 의존(`S:\` fixture 부재) 문제다.

---

## 2. Plan 정합성 (체크리스트)

PR-1 계획 (REFACTOR-PLAN.md §8):
- [x] **M4** `console.log` 제거 또는 옵션화 → `BMSCompileOptions.logger?: { info, warn }` ✓ 정확히 일치
- [x] **M7** `_modifiedNoteMap` 미사용 변수 제거 ✓ 정확히 일치
- [ ] **L1** `lodash` 의존성 제거 검토 → 미수행 (계획상 "검토" 항목, 후속 PR 가능)
- [ ] **M6** `BMSHeaderData` 키 타입 매핑 테이블 도출 → 미수행 (PR-1 범위에서 일부 누락)

추가 검증:
- [x] 외부 API 무변경 약속 (Plan §9.1) — 시그니처 0건 변경
- [x] `BMSCompileOptions.logger`는 추가-only 옵셔널 필드 → patch/minor 호환
- [x] `cloneChart`/`diffCharts` 동작 동등성 — `_modifiedNoteMap`은 `void`로 폐기되었던 placeholder, 제거해도 거동 영향 0
- [x] 커밋 메시지에 PR-1 / M4·M7 명시 (감사 가능성 양호)

**부분 누락 (BLOCK 사유 아님)**: L1·M6은 Plan 자체에서 "검토 권장" 수준이며 위험도 LOW로 분류되어 후속 PR로 연기해도 무방. 이번 PR을 작은 단위로 자른 결정은 합리적.

---

## 3. 빌드/테스트 결과

### PR 브랜치 (refactor/stage-1-infra-cleanup)
- `npm run build`: **PASS** (vite v6.4.1, 25 modules transformed, ESM+CJS 출력 정상, 196ms)
  - 산출물 크기: writer 35.26kB / parser 44.88kB / channels 8.78kB
  - 경고 1건: `Entry module "src/writer/index.ts" is using named and default exports together` — 기존부터 있던 경고, 본 PR과 무관
- `npm run type-check` (tsc --noEmit): **PASS** (오류 0)
- `npm test` (vitest): **97 failed / 92 passed (189 tests, 11 files)** — 환경 의존 실패

### Master 베이스라인
- `npm run build`: **PASS** (산출물 크기·구조 동일, writer 35.31kB / parser 44.81kB)
- `npm test`: **97 failed / 92 passed (189 tests, 11 files)** — **PR과 동일한 결과**

### 결론
**테스트 실패 회귀 0건.** 4개 테스트 파일의 실패는 모두 `S:\4K U_E FULL PACK 2.1\...` 및 `S:\BMS Library\...` 절대 경로 fixture 의존(`tests/writer.test.ts:6` `readBmsFile` 함수의 `readFileSync(filePath)`)에서 비롯되며, master에서도 동일하게 실패한다. CI에서도 같은 실패(`gh run view 25347238988`)를 확인했고, 이는 **사전 존재하는 인프라 결함**이지 본 PR이 도입한 결함이 아니다. 후속 PR에서 별도 트래킹 필요.

---

## 4. 회귀 검사 (master 대비)

| 항목 | master | PR | 변동 |
|---|---|---|---|
| `console.log` 출현 | 3건 (compiler/index.ts) | **0건** | M4 정상 해소 |
| `any/unknown` 총 출현 | 9건 (4 file) | 9건 (4 file) | 변화 없음 (Plan §6 표와 일치) |
| 신규 TODO/FIXME/XXX | — | **0건** | 잡음 추가 없음 |
| 데드코드 (`_modifiedNoteMap`/`void _modifiedNoteMap`) | 존재 | **제거** | M7 정상 해소 |
| `npm test` 통과 수 | 92 | 92 | 동일 |
| `npm test` 실패 수 | 97 (env-dep) | 97 (env-dep) | 동일 (회귀 0) |
| `npm run type-check` | PASS | PASS | 동일 |
| `npm run build` | PASS | PASS | 동일 |
| 번들 크기 변화 (writer.js) | 35.31 kB | 35.26 kB | -0.05 kB |

**새로 실패하는 테스트 0건. 새 any/unknown 0건. 새 TODO 0건.**

---

## 5. 코드 품질 노트

### 강점
- **커밋 단위 적절**: 두 commit이 각각 M4·M7에 정확히 1:1 대응. 메시지에 Plan 항목 번호 명시 (`Addresses M4 from REFACTOR-PLAN.md`).
- **메시지 명확**: 영문 변경 요약 + "no behavior change" 명시 + 한국어 일관성 부족 없음.
- **logger DI 설계 양호**: `options.logger`가 truthy일 때만 출력 → 기본 silent 보장. `info ?? () => undefined` fallback으로 `info` 누락도 안전.
- **JSDoc 설명 추가**: `BMSCompileOptions.logger` 필드에 한국어 주석으로 동작 명세 — 컨슈머가 IDE에서 발견 가능.
- **잡음 없는 클린업**: M7 변경은 `void _modifiedNoteMap;`까지 함께 제거하여 placeholder 흔적 0.

### 주의/제안
- **PR 본문 아직 미확인**: `gh pr view 1` 본문이 비어있다면 향후 Plan 링크와 변경 요약을 본문에 추가 권장.
- **M4 `logger.warn` 미활용**: 현재 `BMSCompileOptions.logger.warn`을 정의했으나 `compile` 함수 내부 `warn(lineNumber, message)`(line 307–311)은 여전히 `result.warnings.push`만 사용. 인터페이스에 정의했지만 호출처가 없어 데드 옵션 가능성. 후속 PR-3(컴파일러 분해 + Result 타입화)에서 일관 적용 권장.
- **L1·M6 부분 누락**: PR-1 범위로 표기되었으나 본 PR에 미포함. 별도 PR로 분리하거나 PR 설명에 "이번 PR은 PR-1의 M4/M7만 처리, L1/M6는 추후"라고 명시 권장.

### 불변 보장 검증
- `compile()` 리턴 객체 구조 동일 (`headerSentences/channelSentences/.../wavStats`)
- `BMSWriter.diffCharts` 리턴 `ChartDiff` 구조 동일
- `index.ts` (parser/writer/root) export 명단 변경 0
- 외부 `bms-editor`/`bms-player`/`bms-electron-app`이 `BMSCompileOptions`를 사용 중이라도, 새 옵션은 옵셔널이므로 호환

---

## 6. 머지 위험도 + 권고사항

**머지 위험도: LOW**

| 차원 | 평가 |
|---|---|
| 동작 변경 | **거의 없음** (console 출력만 사라짐 — 라이브러리는 stdout 비오염이 정상) |
| 외부 API 영향 | **0 (추가-only 옵셔널 필드)** |
| 테스트 회귀 | **0** (환경 결함은 pre-existing) |
| 빌드·타입 영향 | **0** (양쪽 모두 PASS) |
| 롤백 비용 | **매우 낮음** (revert 2 commit으로 복원 가능) |

### 권고
1. **머지 권고: APPROVE & MERGE**.
2. CI의 `S:\` fixture 의존 실패는 본 PR과 무관하지만 모든 후속 PR 머지를 막고 있음 → **별도 인프라 PR로 fixture를 repo 내부로 옮기거나 `it.skip(...)` 처리** 우선 처리 권장 (이 PR에 끼워넣지는 말 것).
3. PR 설명 본문에 "Plan §8 PR-1 중 M4/M7만 처리, L1/M6는 후속 PR" 한 줄 추가 권고.
4. 머지 후 PR-2(P5: dataStructure.ts 폐기) 진행 시 `any/unknown` 9건 중 4건이 일괄 정리되므로 다음 단계로 자연스럽게 이어진다.
5. M4의 `logger.warn`을 활용하려면 PR-3(컴파일러 분해)에서 `warn()` 헬퍼와 통합 — 본 PR에서는 데드 옵션으로 두어도 무방.

---

## 부록 A. 검증 명령 로그

```
git log master..refactor/stage-1-infra-cleanup --oneline
  381fadb refactor(writer): drop unused _modifiedNoteMap in diffCharts
  d608766 refactor(compiler): make debug logging opt-in via logger option

git diff master..refactor/stage-1-infra-cleanup --stat
  src/parser/modules/compiler/index.ts | 22 +++++++++++++++++-----
  src/writer/index.ts                  |  3 ---
  2 files changed, 17 insertions(+), 8 deletions(-)
```

## 부록 B. 검증한 파일 (절대 경로)
- `c:\SourceCode\bms-core\REFACTOR-PLAN.md`
- `c:\SourceCode\bms-core\src\parser\modules\compiler\index.ts`
- `c:\SourceCode\bms-core\src\writer\index.ts`
- `c:\SourceCode\bms-core\package.json`
- `c:\SourceCode\bms-core\src\index.ts` (변경 없음 확인)
- `c:\SourceCode\bms-core\src\parser\index.ts` (변경 없음 확인)
