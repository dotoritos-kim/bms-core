# bms-core Stage 3 PR — Independent Verification Report

> Verified at: 2026-05-05
> Verifier: independent verification agent (not the implementing agent)
> PR: https://github.com/dotoritos-kim/bms-core/pull/3
> Title: `refactor(parser): decompose compiler — controlFlow.ts + CompileResult types (PR-3 / P3+P4)`
> State: **OPEN** (mergeable: `MERGEABLE`, mergeStateStatus: `CLEAN`)
> Base: `master` ← Head: `refactor/stage-3-compiler-decompose`
> Commits on branch: 1 (`b62000f`)
> Diff stat: **+431 / −81, 4 files** (3 created, 1 modified)

---

## 1. Verdict

**APPROVE / Merge-ready.**

All seven verification axes pass. The refactor faithfully extracts P3 (typed Result) + P4 (state-machine extraction) from REFACTOR-PLAN.md, preserves observable behavior byte-for-byte on the flat `CompileResult` fields, and locks in the legacy `#ENDSW` top-level quirk with a regression test so future refactors cannot silently change it.

---

## 2. Plan Alignment (REFACTOR-PLAN §5 P3 / P4, §8 PR-3)

| Plan claim | Verified? | Evidence |
|---|---|---|
| §5 P4: Extract control-flow state into a class | YES | `src/parser/modules/compiler/controlFlow.ts` (+149) — encapsulates 4 stacks (`randomStack`/`skipStack`/`matchedStack`/`switchStack`) and 8 transitions: `beginRandom`, `endRandom`, `beginIf`, `beginElseIf`, `beginElse`, `endIf`, `beginSwitch`, `beginCase`, `beginSkip`, `beginDef`, `endSwitch` |
| §5 P4: `compile()` delegates instead of mutating stacks inline | YES | `src/parser/modules/compiler/index.ts` reduced from 105 → call sites use `cf.beginIf(+m[1])` etc.; no direct stack mutation remains in `index.ts` |
| §5 P3: Typed `CompileResult` | YES | `src/parser/modules/compiler/types.ts` (+65) — `CompileResult`, `CompileWarning`, `CompileStats`, `WavStats`, `WarningCode` |
| `compile()` annotated with return type | YES | `index.ts:63` — `export function compile(text, options?): CompileResult` |
| Public-API surface unchanged | YES | `git diff master...HEAD -- src/index.ts src/parser/index.ts src/writer/index.ts` returns empty (zero lines changed across all three barrel files) |
| Unit tests added | YES | `tests/compiler-controlFlow.test.ts` (+193, 18 tests) — 12 ControlFlowState transition tests + 6 `compile()` typed-result tests |

---

## 3. Build / Type-check / Test Results

Run on PR head commit `b62000f` after `gh pr checkout 3`:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | OK (zero output → zero errors) |
| `npx vite build` | OK (`built in 243ms`, all 4 entry chunks produced; only pre-existing `output.exports: "named"` warning on `src/writer/index.ts` which exists on master too) |
| `npx vitest run` | **103/103 passed**, 8 test files, duration 433 ms |
| Regression vs master baseline (85 tests) | 0 failures (85 prior + 18 new = 103) |

Bundle sizes (PR vs master, from build output): rough parity — `parser/index.js` 45.10 kB on PR (was ~44–45 kB on master); the typed result/state-machine refactor adds shape but no runtime work, so this is expected.

---

## 4. External API Preservation

```
$ git diff master...HEAD -- src/index.ts src/parser/index.ts src/writer/index.ts
(no output — zero lines changed)
```

All three external entry barrels are byte-identical with master.

The PR adds `export type { CompileResult, CompileWarning, CompileStats, WavStats, WarningCode } from './types'` inside `src/parser/modules/compiler/index.ts`, which is the *internal* compiler module — these symbols are not re-exported from the package barrel `src/parser/index.ts`. Net effect: zero new public exports, zero removed exports.

---

## 5. `compile()` Return — Byte-Identical Verification

Captured a consumer-style view of `compile(text, opts)` on **both branches** with an identical input that exercises headers, channel sentences, `#RANDOM/#IF/#ENDIF`, `#SWITCH/#CASE/#DEF/#ENDSW`, and an invalid directive (to trigger the warning path).

Input:

```
#TITLE Test
#ARTIST Foo
#PLAYER 1
#BPM 120
#WAV01 a.wav
#00111:01
#RANDOM 2
#IF 1
#TITLE Branch1
#ENDIF
#IF 2
#TITLE Branch2
#ENDIF
#ENDRANDOM
#SWITCH 3
#CASE 1
#TITLE One
#DEF
#TITLE Default
#ENDSW
#  (bogus)
```

Options: `{ setrandom: 2, setswitch: 99 }`.

Consumer view (sorted top-level keys + flat fields + `warnings[i].{lineNumber,message}` only — no `code`):

| Field | master (b62000f's parent) | refactor/stage-3-... | Match |
|---|---|---|---|
| `Object.keys(r).sort()` | `['channelSentences','chart','controlSentences','headerSentences','malformedSentences','skippedSentences','warnings','wavStats']` | identical | OK |
| `headerSentences` | 9 | 9 | OK |
| `channelSentences` | 1 | 1 | OK |
| `controlSentences` | 10 | 10 | OK |
| `skippedSentences` | 0 | 0 | OK |
| `malformedSentences` | 0 | 0 | OK |
| `warnings[].{lineNumber,message}` | `[{lineNumber:21, message:'잘못된 명령'}]` | identical | OK |
| `wavStats` | `{total:1, inSkippedBlocks:0}` | identical | OK |
| `chart.headers.get('title')` | `'Default'` | `'Default'` | OK |

`diff /tmp/out_master.json /tmp/out_pr.json` → empty.

Conclusion: the existing flat fields are observationally byte-identical for any consumer that ignores the new `code` field.

---

## 6. `#ENDSW` Top-Level Reset Quirk — Regression Lock-In

`controlFlow.ts:140-148`:

```ts
endSwitch(): void {
    this.switchStack.pop();
    if (this.skipStack.length > 1 && this.switchStack.length === 0) {
        this.skipStack[this.skipStack.length - 1] = false;
    }
}
```

This preserves the master quirk **exactly** — when `#ENDSW` runs at the top level (no enclosing `#IF`, so `skipStack.length === 1`), the skip flag is **not** reset, leaving any prior `#CASE`-induced skip latched. This is intentional legacy behavior.

The regression is locked in by `tests/compiler-controlFlow.test.ts:106-118`:

```ts
it('#ENDSW preserves existing skipStack at top level (legacy behavior)', () => {
    const cf = new ControlFlowState();
    cf.beginSwitch(1);
    cf.beginCase(2);                  // skipped
    expect(cf.isSkipped()).toBe(true);
    cf.endSwitch();
    expect(cf.isSkipped()).toBe(true); // <-- legacy behavior locked
});
```

A complementary test at line 120-132 (`#ENDSW restores normal flow when nested inside an #IF`) covers the `skipStack.length > 1` reset branch. Both branches of the `if` are exercised — quirk is fully pinned.

---

## 7. `warnings[i].code` — Additive-Only Confirmation

| Property | Status |
|---|---|
| Existing `lineNumber: number` field preserved | YES (still emitted at `index.ts:251`) |
| Existing `message: string` field preserved | YES (still emitted at `index.ts:252`) |
| New `code: WarningCode` field added | YES (at `index.ts:253`) |
| Initial `WarningCode` value set | `'INVALID_DIRECTIVE'` (single discriminant — additive future codes are SemVer-patch-safe per `types.ts:18` doc-comment) |
| Existing callers of `warnings[i].lineNumber/.message` broken? | NO — TypeScript structural widening allows extra fields; runtime shape is a strict superset |
| Workspace-wide consumer audit | No file in `bms-editor`, `bms-player`, or other sibling repos reads `compile().warnings` — grep returns zero matches. Safe to ship. |

The single internal `warn()` helper at `index.ts:249` was updated to accept the third `code` arg with type `'INVALID_DIRECTIVE'` (literal type, so any future code addition will require updating the helper signature — appropriate guard against accidental untyped warnings).

Conclusion: the change is additive and non-breaking.

---

## 8. `any` / `unknown` Residual Audit (CompileResult Surface)

```
$ grep -nE '\b(any|unknown)\b' src/parser/modules/compiler/
(no matches)
```

Zero `any`/`unknown` in the entire compiler module after Stage 3. The plan's P3 goal of removing untyped surface area on `CompileResult` is achieved with no leftover escape hatches.

---

## 9. Merge Risk Assessment

| Axis | Risk | Notes |
|---|---|---|
| Public API break | **None** | Zero diff on `src/index.ts`, `src/parser/index.ts`, `src/writer/index.ts`; new types are internal exports from `compiler/index.ts` only |
| Behavior change | **None** | All 85 prior tests pass unchanged; flat `compile()` result fields verified byte-identical against master with a multi-construct fixture |
| Quirk preservation | **None** | `#ENDSW` top-level no-reset quirk pinned by explicit regression test |
| Type-check / build | **None** | `tsc --noEmit` clean; `vite build` clean |
| Bundle size | **Negligible** | `parser/index.js` ~unchanged; class-based state machine adds shape but no runtime work |
| Mergeability | **Clean** | `gh pr view 3` reports `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`; rebases cleanly on master |
| Reviewability | **Low risk** | 1 commit, 4 files, mechanical 1:1 extraction with comments cross-referencing the plan |

**Recommendation: APPROVE and merge.** No follow-up requested. The PR is exactly what its claim says: a faithful, plan-aligned, behavior-preserving extraction with non-breaking type tightening.

---

## 10. Suggested Next Steps (Out-of-Scope)

These are *not* blockers for merging Stage 3 — listing for future PR planning only:

- Consider exporting `CompileResult` from `src/parser/index.ts` so external TypeScript consumers can annotate with the precise type (currently they get the inferred return type, which works but is less self-documenting).
- The `warn()` helper's third arg type is currently the literal `'INVALID_DIRECTIVE'`. When P3 grows additional warning codes, widening this to `WarningCode` is the natural next step (tracked under existing P3 scope).
- The top-level `#ENDSW` quirk is now formally pinned. If product ever wants to *fix* the quirk, this test is the canary that will fail — by design.
