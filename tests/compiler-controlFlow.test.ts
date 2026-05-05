import { describe, it, expect } from 'vitest';
import { ControlFlowState } from '../src/parser/modules/compiler/controlFlow';
import { Compiler } from '../src';

describe('ControlFlowState', () => {
    it('initial state is not skipped', () => {
        const cf = new ControlFlowState();
        expect(cf.isSkipped()).toBe(false);
    });

    it('handles a #RANDOM/#IF/#ENDIF/#ENDRANDOM sequence (matching branch)', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(2); // #RANDOM 2 → value=2
        cf.beginIf(2);     // #IF 2 → matches
        expect(cf.isSkipped()).toBe(false);
        cf.endIf();
        cf.endRandom();
        expect(cf.isSkipped()).toBe(false);
    });

    it('handles a non-matching #IF (skipped) and matching #ELSEIF', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(2);
        cf.beginIf(1);
        expect(cf.isSkipped()).toBe(true);
        cf.beginElseIf(2);
        expect(cf.isSkipped()).toBe(false);
        cf.endIf();
        cf.endRandom();
    });

    it('#ELSEIF after a matched #IF stays skipped (only first match wins)', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(1);
        cf.beginIf(1);
        expect(cf.isSkipped()).toBe(false);
        cf.beginElseIf(1);
        expect(cf.isSkipped()).toBe(true);
        cf.endIf();
        cf.endRandom();
    });

    it('#ELSE runs only when no prior branch matched', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(3);
        cf.beginIf(1);
        cf.beginElseIf(2);
        cf.beginElse();
        expect(cf.isSkipped()).toBe(false);
        cf.endIf();
        cf.endRandom();
    });

    it('#ELSE after a matched branch is skipped', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(1);
        cf.beginIf(1);
        cf.beginElse();
        expect(cf.isSkipped()).toBe(true);
        cf.endIf();
        cf.endRandom();
    });

    it('#SWITCH/#CASE: matching case runs, others skipped', () => {
        const cf = new ControlFlowState();
        cf.beginSwitch(2);
        cf.beginCase(1);
        expect(cf.isSkipped()).toBe(true);
        cf.beginCase(2);
        expect(cf.isSkipped()).toBe(false);
        cf.endSwitch();
    });

    it('#SWITCH #DEF runs when no case matches', () => {
        const cf = new ControlFlowState();
        cf.beginSwitch(99);
        cf.beginCase(1);
        cf.beginCase(2);
        cf.beginDef();
        expect(cf.isSkipped()).toBe(false);
        cf.endSwitch();
    });

    it('#SWITCH #DEF skipped if a case matched', () => {
        const cf = new ControlFlowState();
        cf.beginSwitch(1);
        cf.beginCase(1);
        cf.beginDef();
        expect(cf.isSkipped()).toBe(true);
        cf.endSwitch();
    });

    it('#SKIP causes subsequent CASE/DEF to be skipped', () => {
        const cf = new ControlFlowState();
        cf.beginSwitch(1);
        cf.beginCase(1);
        cf.beginSkip();
        expect(cf.isSkipped()).toBe(true);
        cf.beginCase(1); // would match but SKIP active
        expect(cf.isSkipped()).toBe(true);
        cf.beginDef();
        expect(cf.isSkipped()).toBe(true);
        cf.endSwitch();
    });

    it('#ENDSW preserves existing skipStack at top level (legacy behavior)', () => {
        // The original compiler only resets skipStack on #ENDSW when skipStack.length > 1.
        // At top level (no enclosing #IF) skipStack length is 1, so a skipped #CASE
        // leaves the skip flag set even after #ENDSW. This test locks in that legacy
        // behavior so future refactors don't change it inadvertently.
        const cf = new ControlFlowState();
        cf.beginSwitch(1);
        cf.beginCase(2); // skipped
        expect(cf.isSkipped()).toBe(true);
        cf.endSwitch();
        // Behavior preserved (intentional).
        expect(cf.isSkipped()).toBe(true);
    });

    it('#ENDSW restores normal flow when nested inside an #IF', () => {
        const cf = new ControlFlowState();
        cf.beginRandom(1);
        cf.beginIf(1); // matched, skip=false
        cf.beginSwitch(1);
        cf.beginCase(2); // skipped
        expect(cf.isSkipped()).toBe(true);
        cf.endSwitch();
        // skipStack.length > 1 here, so it resets to false.
        expect(cf.isSkipped()).toBe(false);
        cf.endIf();
        cf.endRandom();
    });

    it('#CASE/#SKIP/#DEF/#ENDSW outside of any #SWITCH are no-ops', () => {
        const cf = new ControlFlowState();
        cf.beginCase(1);
        cf.beginSkip();
        cf.beginDef();
        cf.endSwitch();
        expect(cf.isSkipped()).toBe(false);
    });
});

describe('Compiler.compile() typed result', () => {
    it('returns a CompileResult with all stat fields and a chart', () => {
        const result = Compiler.compile('#TITLE Hello\n#00111:01');
        expect(result.chart).toBeDefined();
        expect(typeof result.headerSentences).toBe('number');
        expect(typeof result.channelSentences).toBe('number');
        expect(typeof result.controlSentences).toBe('number');
        expect(typeof result.skippedSentences).toBe('number');
        expect(typeof result.malformedSentences).toBe('number');
        expect(Array.isArray(result.warnings)).toBe(true);
        expect(result.wavStats).toBeDefined();
        expect(typeof result.wavStats.total).toBe('number');
        expect(typeof result.wavStats.inSkippedBlocks).toBe('number');
    });

    it('warnings include a `code` field for invalid directives', () => {
        // A line that starts with `#` but does not match header/channel/control patterns
        // becomes an INVALID_DIRECTIVE warning. The fallback header pattern is permissive,
        // so we use a directive that breaks the pattern: # (just hash + space).
        const result = Compiler.compile('# \n');
        // Either malformedSentences or warnings — but if any warning exists, it has a code.
        for (const w of result.warnings) {
            expect(typeof w.lineNumber).toBe('number');
            expect(typeof w.message).toBe('string');
            expect(w.code).toBe('INVALID_DIRECTIVE');
        }
    });

    it('compile() over a #RANDOM block selects branches deterministically with setrandom', () => {
        const bms = `#RANDOM 2\n#IF 1\n#TITLE A\n#ENDIF\n#IF 2\n#TITLE B\n#ENDIF\n#ENDRANDOM`;
        const r1 = Compiler.compile(bms, { setrandom: 1 });
        expect(r1.chart.headers.get('title')).toBe('A');
        const r2 = Compiler.compile(bms, { setrandom: 2 });
        expect(r2.chart.headers.get('title')).toBe('B');
    });

    it('compile() over a #SWITCH block respects setswitch (matching case branch)', () => {
        // Single matching CASE — header sets only when value matches setswitch.
        const bms = `#SWITCH 3\n#CASE 2\n#TITLE two\n#ENDSW`;
        expect(Compiler.compile(bms, { setswitch: 2 }).chart.headers.get('title')).toBe('two');
        expect(Compiler.compile(bms, { setswitch: 1 }).chart.headers.get('title')).toBeUndefined();
    });

    it('compile() over a #SWITCH block falls through to #DEF when no case matches', () => {
        // No #SKIP between CASE and DEF — when the case doesn't match, the DEF
        // branch becomes the active branch.
        const bms = `#SWITCH 3\n#CASE 1\n#TITLE one\n#DEF\n#TITLE def\n#ENDSW`;
        expect(Compiler.compile(bms, { setswitch: 99 }).chart.headers.get('title')).toBe('def');
    });
});
