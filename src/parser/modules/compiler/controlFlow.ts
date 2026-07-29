// #RANDOM/#IF/#ELSEIF/#ELSE/#ENDIF + #SWITCH/#CASE/#SKIP/#DEF/#ENDSW
// control-flow state machine (REFACTOR-PLAN §5 P4).
//
// Isolates the four stacks that the `compile()` body used to manipulate
// directly (randomStack / skipStack / matchedStack / switchStack) into a
// single class to improve readability and unit testability.
//
// External behavior must be 100% preserved; methods are extracted to map 1:1 semantically.
// (semver patch — Non-breaking)

interface SwitchState {
    /** Switch value */
    value: number;
    /** Whether a CASE has matched */
    matched: boolean;
    /** Skip until ENDSW after a SKIP */
    skipping: boolean;
}

/**
 * BMS control-flow state machine.
 *
 * Encapsulates the four stacks so the `compile()` body no longer manipulates them directly.
 *
 * ### State semantics
 * - `randomStack`: current random value of each #RANDOM block (LIFO)
 * - `skipStack`: whether the current block is skipped (kept in sync with depth)
 * - `matchedStack`: whether any #IF/#ELSEIF branch has matched (kept in sync with depth)
 * - `switchStack`: #SWITCH frame stack
 *
 * Initial state: `skipStack = [false]`, `matchedStack = [false]`.
 * That is, `isSkipped()` is always `false` when not inside any #IF/#SWITCH.
 */
export class ControlFlowState {
    private readonly randomStack: number[] = [];
    private readonly skipStack: boolean[] = [false];
    private readonly matchedStack: boolean[] = [false];
    private readonly switchStack: SwitchState[] = [];

    /** Whether the current line should be skipped */
    isSkipped(): boolean {
        return this.skipStack[this.skipStack.length - 1];
    }

    // ---- #RANDOM ----

    /** Handles `#RANDOM n` — pushes the evaluated value onto the stack */
    beginRandom(value: number): void {
        this.randomStack.push(value);
    }

    /** Handles `#ENDRANDOM` */
    endRandom(): void {
        this.randomStack.pop();
    }

    // ---- #IF / #ELSEIF / #ELSE / #ENDIF ----

    /** Handles `#IF n` */
    beginIf(value: number): void {
        const randomValue = this.randomStack[this.randomStack.length - 1];
        const matches = randomValue === value;
        this.skipStack.push(!matches);
        this.matchedStack.push(matches);
    }

    /** Handles `#ELSEIF n` */
    beginElseIf(value: number): void {
        const alreadyMatched = this.matchedStack[this.matchedStack.length - 1];
        if (alreadyMatched) {
            // Skip if a branch has already matched
            this.skipStack[this.skipStack.length - 1] = true;
        } else {
            const randomValue = this.randomStack[this.randomStack.length - 1];
            const matches = randomValue === value;
            this.skipStack[this.skipStack.length - 1] = !matches;
            if (matches) {
                this.matchedStack[this.matchedStack.length - 1] = true;
            }
        }
    }

    /** Handles `#ELSE` */
    beginElse(): void {
        const alreadyMatched = this.matchedStack[this.matchedStack.length - 1];
        // Skip if a branch has already matched; otherwise execute
        this.skipStack[this.skipStack.length - 1] = alreadyMatched;
    }

    /** Handles `#ENDIF` */
    endIf(): void {
        this.skipStack.pop();
        this.matchedStack.pop();
    }

    // ---- #SWITCH / #CASE / #SKIP / #DEF / #ENDSW ----

    /** Handles `#SWITCH n` */
    beginSwitch(value: number): void {
        this.switchStack.push({ value, matched: false, skipping: false });
    }

    /** Handles `#CASE n` */
    beginCase(value: number): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        if (current.skipping || current.matched) {
            // Skip when after a SKIP or already matched
            this.skipStack[this.skipStack.length - 1] = true;
        } else if (current.value === value) {
            // Matched — execute
            current.matched = true;
            this.skipStack[this.skipStack.length - 1] = false;
        } else {
            // Not matched — skip
            this.skipStack[this.skipStack.length - 1] = true;
        }
    }

    /** Handles `#SKIP` — skips the rest of the current switch block */
    beginSkip(): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        current.skipping = true;
        this.skipStack[this.skipStack.length - 1] = true;
    }

    /** Handles `#DEF` — the default branch */
    beginDef(): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        if (current.skipping || current.matched) {
            this.skipStack[this.skipStack.length - 1] = true;
        } else {
            // Execute when no CASE has matched
            this.skipStack[this.skipStack.length - 1] = false;
        }
    }

    /** Handles `#ENDSW` */
    endSwitch(): void {
        this.switchStack.pop();
        // Resume normal execution after the switch ends
        if (this.skipStack.length > 1 && this.switchStack.length === 0) {
            // Restore the top-level skip state
            this.skipStack[this.skipStack.length - 1] = false;
        }
    }
}
