// #RANDOM/#IF/#ELSEIF/#ELSE/#ENDIF + #SWITCH/#CASE/#SKIP/#DEF/#ENDSW
// control-flow state machine (REFACTOR-PLAN §5 P4).
//
// All control blocks live on a single frame stack so that nesting works as the
// BMS command memo describes: #RANDOM and #SWITCH blocks may be nested into
// each other without limit, and everything inside a skipped region is skipped
// regardless of the inner blocks (an inner #IF/#CASE can never "re-enable" lines
// of an unselected outer branch).

interface RandomFrame {
    kind: 'random';
    /** Generated (or #SETRANDOM-fixed) value */
    value: number;
    /** Lines directly inside #RANDOM (outside #IF) are applied (BM98 behavior) */
    localSkip: false;
}

interface IfFrame {
    kind: 'if';
    /** Value of the enclosing #RANDOM (undefined for an orphan #IF) */
    randomValue: number | undefined;
    /** Whether any #IF/#ELSEIF/#ELSE branch has been taken */
    matched: boolean;
    /** Opened inside a skipped region (or orphan) — branch commands are inert */
    dead: boolean;
    /** Whether the current branch is skipped */
    localSkip: boolean;
}

interface SwitchFrame {
    kind: 'switch';
    /** Generated (or #SETSWITCH-fixed) value */
    value: number;
    /** All #CASE labels of this switch (enables #DEF placed before #CASE) */
    labels: ReadonlySet<number> | undefined;
    /**
     * - `searching`: no #CASE/#DEF has matched yet
     * - `running`: executing (falls through subsequent #CASE/#DEF until #SKIP)
     * - `done`: a #SKIP was executed — skipped until #ENDSW
     */
    state: 'searching' | 'running' | 'done';
    /** Opened inside a skipped region — branch commands are inert */
    dead: boolean;
    /** Whether the current section is skipped */
    localSkip: boolean;
}

type Frame = RandomFrame | IfFrame | SwitchFrame;

/**
 * BMS control-flow state machine.
 *
 * ### State semantics
 * - `stack`: open #RANDOM / #IF / #SWITCH frames (innermost last)
 * - `skipCount`: number of frames whose current section is skipped.
 *   A line is skipped when any enclosing frame skips it (`skipCount > 0`).
 *
 * ### Recovery from common mistakes (see the command memo, "Examples of Mistakes")
 * - `#IF` directly inside an `#IF` is treated as a sibling (`#IF n` without `#ENDIF`).
 * - `#ENDIF`/`#ELSEIF`/`#ELSE` close #RANDOM frames left open inside the #IF.
 * - `#CASE`/`#DEF`/`#ENDSW` close #RANDOM/#IF frames left open inside the case.
 * - An orphan `#IF` (no enclosing #RANDOM) is ignored entirely (LR2/uBMplay behavior).
 * - Unmatched closing/branch commands are no-ops.
 */
export class ControlFlowState {
    private readonly stack: Frame[] = [];
    private skipCount = 0;

    /** Whether the current line should be skipped */
    isSkipped(): boolean {
        return this.skipCount > 0;
    }

    // ---- #RANDOM ----

    /**
     * Handles `#RANDOM n` / `#SETRANDOM n` — pushes the evaluated value.
     * Inside a skipped region the value is irrelevant (callers should avoid
     * consuming randomness then — check `isSkipped()` first).
     */
    beginRandom(value: number): void {
        this.push({ kind: 'random', value, localSkip: false });
    }

    /** Handles `#ENDRANDOM` */
    endRandom(): void {
        const index = this.findFrame('random');
        if (index >= 0) this.popTo(index - 1);
    }

    // ---- #IF / #ELSEIF / #ELSE / #ENDIF ----

    /** Handles `#IF n` */
    beginIf(value: number): void {
        // `#IF` directly inside an `#IF` is an adjacent sibling with a missing #ENDIF
        const top = this.stack[this.stack.length - 1];
        if (top && top.kind === 'if') this.popTo(this.stack.length - 2);

        const randomValue = this.currentRandomValue();
        const dead = this.isSkipped() || randomValue === undefined;
        const matches = !dead && randomValue === value;
        this.push({ kind: 'if', randomValue, matched: matches, dead, localSkip: !matches });
    }

    /** Handles `#ELSEIF n` */
    beginElseIf(value: number): void {
        const frame = this.enterFrame('if');
        if (!frame || frame.dead) return;
        if (frame.matched) {
            // Skip if a branch has already matched
            this.setLocalSkip(frame, true);
        } else {
            const matches = frame.randomValue === value;
            frame.matched = matches;
            this.setLocalSkip(frame, !matches);
        }
    }

    /** Handles `#ELSE` */
    beginElse(): void {
        const frame = this.enterFrame('if');
        if (!frame || frame.dead) return;
        // Skip if a branch has already matched; otherwise execute
        this.setLocalSkip(frame, frame.matched);
        frame.matched = true;
    }

    /**
     * Handles `#ENDIF` (and its typo forms `#END IF`, `#IFEND`).
     * Crosses #SWITCH frames: a well-formed #SWITCH inside an #IF is always
     * closed by #ENDSW before the #ENDIF, so reaching an open #SWITCH here
     * means its #ENDSW is missing — close it together with the #IF instead of
     * leaving the #IF open for the rest of the file.
     */
    endIf(): void {
        const index = this.findFrame('if', true);
        if (index >= 0) this.popTo(index - 1);
    }

    // ---- #SWITCH / #CASE / #SKIP / #DEF / #ENDSW ----

    /**
     * Handles `#SWITCH n` / `#SETSWITCH n`.
     * @param labels all `#CASE` labels of this switch block, when known. Lets a
     *        `#DEF` written before the matching `#CASE` be skipped (IIDXv behavior).
     *        Without it, `#DEF` applies whenever no earlier `#CASE` has matched.
     */
    beginSwitch(value: number, labels?: ReadonlySet<number>): void {
        const dead = this.isSkipped();
        this.push({ kind: 'switch', value, labels, state: dead ? 'done' : 'searching', dead, localSkip: true });
    }

    /** Handles `#CASE n` — execution falls through subsequent cases until #SKIP */
    beginCase(value: number): void {
        const frame = this.enterFrame('switch');
        if (!frame || frame.dead) return;
        if (frame.state === 'searching' && frame.value === value) frame.state = 'running';
        this.setLocalSkip(frame, frame.state !== 'running');
    }

    /** Handles `#SKIP` — skips the rest of the current switch block */
    beginSkip(): void {
        // A #SKIP inside a skipped section is not executed
        if (this.isSkipped()) return;
        const index = this.findFrame('switch', true);
        if (index < 0) return;
        const frame = this.stack[index] as SwitchFrame;
        frame.state = 'done';
        this.setLocalSkip(frame, true);
    }

    /** Handles `#DEF` — applied when no #CASE matches (or reached by fallthrough) */
    beginDef(): void {
        const frame = this.enterFrame('switch');
        if (!frame || frame.dead) return;
        if (frame.state === 'searching' && !(frame.labels && frame.labels.has(frame.value))) {
            frame.state = 'running';
        }
        this.setLocalSkip(frame, frame.state !== 'running');
    }

    /** Handles `#ENDSW` */
    endSwitch(): void {
        const index = this.findFrame('switch', true);
        if (index >= 0) this.popTo(index - 1);
    }

    // ---- internals ----

    private push(frame: Frame): void {
        this.stack.push(frame);
        if (frame.localSkip) this.skipCount++;
    }

    /** Pops frames until `stack.length === index + 1` */
    private popTo(index: number): void {
        while (this.stack.length > index + 1) {
            const frame = this.stack.pop() as Frame;
            if (frame.localSkip) this.skipCount--;
        }
    }

    private setLocalSkip(frame: IfFrame | SwitchFrame, skip: boolean): void {
        if (frame.localSkip === skip) return;
        frame.localSkip = skip;
        this.skipCount += skip ? 1 : -1;
    }

    /**
     * Index of the innermost frame of `kind`. Unless `crossSwitch` is set, the
     * search stops at a #SWITCH frame (a #RANDOM/#IF outside a #SWITCH cannot be
     * closed from inside it). Returns -1 when none.
     */
    private findFrame(kind: Frame['kind'], crossSwitch = false): number {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const frame = this.stack[i];
            if (frame.kind === kind) return i;
            if (frame.kind === 'switch' && !crossSwitch) return -1;
        }
        return -1;
    }

    /** Closes frames left open above the innermost frame of `kind` and returns it */
    private enterFrame(kind: 'if'): IfFrame | undefined;
    private enterFrame(kind: 'switch'): SwitchFrame | undefined;
    private enterFrame(kind: 'if' | 'switch'): IfFrame | SwitchFrame | undefined {
        const index = this.findFrame(kind, kind === 'switch');
        if (index < 0) return undefined;
        this.popTo(index);
        return this.stack[index] as IfFrame | SwitchFrame;
    }

    /** Value of the innermost #RANDOM */
    private currentRandomValue(): number | undefined {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            const frame = this.stack[i];
            if (frame.kind === 'random') return frame.value;
        }
        return undefined;
    }
}
