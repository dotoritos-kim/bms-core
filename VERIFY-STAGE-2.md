# bms-core Stage 2 PR — Independent Verification Report

> Verified at: 2026-05-05
> Verifier: independent verification agent (not the implementing agent)
> PR: https://github.com/dotoritos-kim/bms-core/pull/2
> Title: `refactor(parser): drop self-built DataStructure runtime validator (PR-2 / P5)`
> State: **MERGED** (already merged into master at the time of verification)
> Base: `master` ← Head: `refactor/stage-2-drop-data-structure`
> Commits on branch: 2 (`dbd70d0`, `e687b5e`)
> Diff stat: **+44 / −103, 5 files** (1 deleted)

---

## 1. Verdict

**APPROVE** — already merged; no regressions found, all Stage 2 claims independently confirmed.

If this had been pre-merge, the recommendation would still be APPROVE (clean, scope-minimal, plan-aligned).

---

## 2. Plan Alignment (REFACTOR-PLAN §5/P5, §8/PR-2, §6 #1–#4)

| Plan claim | Verified? | Evidence |
|---|---|---|
| Delete `parser/utils/dataStructure.ts` | YES | File removed; 0 references remain in `src/` (verified by grep) |
| Replace `Note` Façade in `notes/note.ts` | YES | Replaced with `assertBMSNote(value: BMSNote): void` inline guard |
| Replace `Segment` Façade in `speedcore/segment.ts` | YES | Replaced with `assertSpeedSegment(value: SpeedSegment): void` inline guard |
| Remove `any/unknown` items #1–#4 (all in `dataStructure.ts`) | YES | All 4 sites removed with the file; no replacements introduced |
| External API unchanged | YES | `Note`/`Segment` were never exported from `src/index.ts` or `src/parser/index.ts` (grep confirms); they were internal-only Façade callables |
| `Notes` / `Speedcore` constructor behavior preserved | YES | `notes.forEach(Note)` → `notes.forEach(assertBMSNote)`; `segments.forEach(Segment)` → `segments.forEach(assertSpeedSegment)` — semantically equivalent (validate-and-throw on each element) |

The PR is the textbook minimal implementation of Plan §5 P5 / §8 PR-2. **No scope creep.**

### Behavioral parity check
- Old `Note` accepted shape `{ beat, endBeat?, column?, keysound }`.
- New `assertBMSNote` validates `beat: number`, `endBeat: number|undefined|null`, `column: string|undefined|null`, `keysound: string` — same fields, same null/undefined semantics for the `maybe` fields.
- Old `Segment` validated `t: number, x: number, dx: number`. New `assertSpeedSegment` validates the same three. (The `inclusive: boolean` field on `SpeedSegment` was never validated by the old Façade either, so no regression.)
- Error messages match the old format `Error in property "<name>": Value should be of type <type>` — error-message stability preserved.

One **micro-difference (non-functional)**: the old façade returned the value (`Note(x) ⇒ x`); the new function returns `void`. This is irrelevant because the only call sites (`notes/index.ts`, `speedcore/index.ts`) already discarded the return value via `.forEach(...)`.

---

## 3. Build / Test Verification

Commands run locally on Windows / Node, in-process:

| Branch | type-check | build | test |
|---|---|---|---|
| `master` (8c9f295) | n/a (assumed) | OK | **7 files / 85 tests passed** |
| `refactor/stage-2-drop-data-structure` (e687b5e) | OK (no errors) | OK | **7 files / 85 tests passed** |

Test counts are **identical** before and after — no regressions, no new tests added (which is fine: the 2 internal helpers are exercised transitively by `parser.test.ts`, `speedcore.test.ts`, etc.).

GitHub Actions CI on the PR: `Build & Test` — SUCCESS (run 25348118398).

External integration tests requiring local fixtures are skipped on CI (introduced by `f45ce92`); this is unchanged and unrelated to Stage 2.

---

## 4. Migration Audit — Did all dataStructure consumers move?

`grep -rn "dataStructure\|from.*dataStructure\|Façade\|\\bNote\\b.*forEach\|\\bSegment\\b.*forEach" src/` after PR:

- 0 imports of `dataStructure` remain
- 0 references to the `Façade` type remain
- The two external-ish call sites flagged by the plan as risk areas:
  - **parser/utils**: only `dataStructure.ts` itself was the consumer — deleted ✓
  - **parser/modules/notes** (was using `Note`): migrated to `assertBMSNote` ✓
  - **parser/modules/speedcore** (was using `Segment`): migrated to `assertSpeedSegment` ✓

The plan also mentioned `parser/modules/reader` and `writer` as potential dependents — verification shows **neither was actually using `dataStructure`** (false alarm in the reviewer prompt; not a defect).

---

## 5. `any`/`unknown` Residual Count

Counting `\b(any|unknown)\b` in `src/**/*.ts`:

| Branch | Total | Locations |
|---|---|---|
| `master` | **13** | `dataStructure.ts` (×7), `writer/index.ts` (×2), `writer/headerWriter.ts` (×1), `parser/modules/songInfo/index.ts` (×1), `parser/modules/reader/index.ts` (×2) |
| PR (after merge) | **6** | `writer/index.ts` (×2), `writer/headerWriter.ts` (×1), `parser/modules/songInfo/index.ts` (×1), `parser/modules/reader/index.ts` (×2) |

**Δ = −7** (all 7 inside `dataStructure.ts`).

Mapping to the plan's table §6 (#1–#9):
- #1, #2, #3, #4 (all in `dataStructure.ts`) → **REMOVED** ✓
- #5, #6 (`reader/index.ts:129`, `:135`) → still present, deferred (plan: PR-2 mid-priority)
- #7 (`headerWriter.ts:31`) → still present, deferred (plan: PR-2 mid-priority)
- #8 (`writer/index.ts:594-595`, found at 591/592 in current code) → still present, deferred (plan: 1.0 milestone, breaking)
- #9 (`songInfo/index.ts:44`) → still present, deferred (plan: low-priority)

The Stage 2 self-report claim "any #1–#4 제거" is **literally true**. The remaining 6 sites are all explicitly scheduled for later PRs in the plan, not Stage 2.

---

## 6. Public API Preservation

`src/index.ts` is **byte-identical** before and after (no `Note` or `Segment` lines anywhere — they were never public).

Public symbols unchanged:
- Values: `BMSParser, Reader, Compiler, KeySounds, Timing, SongInfo, Positioning, Spacing, BMSChart, Notes, TimeSignatures, BMSWriter, writeHeaders, createEmptyHeaders, parseHeadersToData, writeChannels, IIDX_SP_REVERSE, IIDX_DP_REVERSE`
- Types: `ReaderOptions, BMSNote, NoteType, TimingAction, BaseTimingAction, BPMTimingAction, StopTimingAction, ISongInfoData, PositioningSegment, SpacingSegment, BMSWriterOptions, EditableBMSChart, EditableBMSNote, BMSHeaderData, BMSBpmChange, BMSStopEvent, BMSBgaEvent, ReverseChannelMapping, ChartDiff`

Subpath exports (`./parser`, `./writer`) are also unchanged.

`grep export.*\b(Note|Segment)\b src/` returns **no matches** on either branch — confirming neither was ever surfaced.

**External impact: zero.** bms-editor / bms-player / bms-electron-app cannot have been depending on these symbols.

---

## 7. Bundle Size Impact (Vite production build, ESM)

Identical command (`npm run build`) on both branches, fresh `dist/`:

| Bundle | master | PR | Δ |
|---|---:|---:|---:|
| `dist/index.js` | 0.61 kB | 0.61 kB | 0 |
| `dist/channels-*.js` | 8.78 kB | 8.78 kB | 0 |
| `dist/writer/index.js` | 35.26 kB | 35.26 kB | 0 |
| **`dist/parser/index.js`** | **44.88 kB** | **43.73 kB** | **−1.15 kB** |
| **gzip parser** | **11.42 kB** | **11.05 kB** | **−0.37 kB** |
| `dist/parser/index.cjs` | 45.10 kB | 43.95 kB | −1.15 kB |

The Stage 2 self-report claim "번들 −1.15kB" matches the parser ESM bundle exactly.

Module count fell from 25 → 24 (the deleted `dataStructure.ts` module).

Writer bundle is unchanged because the writer never imported `dataStructure`.

---

## 8. Merge Risk Assessment

**Risk level: VERY LOW.**

- ✅ Diff is small (5 files, +44/−103) and reviewable line-by-line
- ✅ All 85 existing tests pass
- ✅ Type-check passes with no new errors
- ✅ Public API surface is byte-identical
- ✅ Behavioral parity (validation conditions and error message format) preserved
- ✅ CI green on PR
- ✅ Bundle size strictly improves
- ✅ No new `any`/`unknown` introduced; 7 removed
- ✅ Internal-only API (`Note`/`Segment`) → callers (`Notes`/`Speedcore` constructors) updated within the same PR

**Residual risks** (all minor):
1. Hot-path overhead — the new `assertBMSNote` runs a property-by-property check on every note in the chart, same as before. **Net wash** (no regression, possibly slightly faster because no Façade indirection).
2. The new functions are **not exported** for external test introspection. If a downstream library wanted to validate ad-hoc `BMSNote`/`SpeedSegment` shapes, they couldn't (they couldn't with `Note`/`Segment` either — same situation).
3. Minor naming inconsistency: file still re-exports `BMSNote`, `NoteType`, but no longer the `Note` symbol. `notes/index.ts` was updated; no other importers exist (verified by grep).

---

## 9. Recommendation

**MERGE — already merged; verification confirms the merge was safe.**

Proceed to Stage 3 / PR-3 (compiler decomposition, P3+P4) as per `REFACTOR-PLAN.md` §8.

For Stage 3, recommend:
- Add a unit test for `assertBMSNote` / `assertSpeedSegment` directly (currently only covered transitively) — micro-cost, prevents accidental regression of the inline guards.
- The 6 remaining `unknown` sites (#5–#9) should be addressed in their assigned PRs, not bundled.

---

## 10. Appendix — Commands used for verification

```
gh pr view 2 --json title,state,headRefName,baseRefName,additions,deletions,files,mergeable,statusCheckRollup
gh pr diff 2
git log --oneline master..refactor/stage-2-drop-data-structure
git diff --stat master..refactor/stage-2-drop-data-structure
grep -rn "dataStructure" src/
grep -rn "\b(any|unknown)\b" src/**/*.ts        # before & after
grep -rn "export.*\b(Note|Segment)\b" src/
npm run type-check                              # both branches
npm run build                                   # both branches; dist/ fresh
npm test                                        # both branches
ls -la dist/parser/index.js dist/writer/index.js dist/index.js dist/channels-*.js
```
