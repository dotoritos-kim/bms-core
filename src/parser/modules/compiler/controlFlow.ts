// #RANDOM/#IF/#ELSEIF/#ELSE/#ENDIF + #SWITCH/#CASE/#SKIP/#DEF/#ENDSW
// 제어 흐름 상태 머신 (REFACTOR-PLAN §5 P4).
//
// 기존 `compile()` 본문 안에서 직접 조작하던 4개 스택
// (randomStack / skipStack / matchedStack / switchStack)을
// 단일 클래스로 격리하여 가독성과 단위 테스트성을 끌어올립니다.
//
// 외부 동작은 100% 보존되어야 하며, 의미상 1:1 대응되도록 메서드를 추출합니다.
// (semver patch — Non-breaking)

interface SwitchState {
    /** 스위치 값 */
    value: number;
    /** CASE가 매칭되었는지 */
    matched: boolean;
    /** SKIP 이후 ENDSW까지 스킵 */
    skipping: boolean;
}

/**
 * BMS 제어 흐름 상태 머신.
 *
 * 4개 스택을 캡슐화하여 `compile()` 본문에서 직접 조작하지 않도록 합니다.
 *
 * ### 상태 의미
 * - `randomStack`: 각 #RANDOM 블록의 현재 랜덤 값 (LIFO)
 * - `skipStack`: 현재 블록을 스킵할지 여부 (depth와 동일하게 유지)
 * - `matchedStack`: #IF/#ELSEIF 중 하나라도 매칭됐는지 (depth와 동일하게 유지)
 * - `switchStack`: #SWITCH 프레임 스택
 *
 * 초기 상태: `skipStack = [false]`, `matchedStack = [false]`.
 * 즉 어떠한 #IF/#SWITCH 안에 있지 않을 때 `isSkipped()`는 항상 `false`.
 */
export class ControlFlowState {
    private readonly randomStack: number[] = [];
    private readonly skipStack: boolean[] = [false];
    private readonly matchedStack: boolean[] = [false];
    private readonly switchStack: SwitchState[] = [];

    /** 현재 라인이 스킵되어야 하는지 */
    isSkipped(): boolean {
        return this.skipStack[this.skipStack.length - 1];
    }

    // ---- #RANDOM ----

    /** `#RANDOM n` 처리 — 평가된 값을 스택에 push */
    beginRandom(value: number): void {
        this.randomStack.push(value);
    }

    /** `#ENDRANDOM` 처리 */
    endRandom(): void {
        this.randomStack.pop();
    }

    // ---- #IF / #ELSEIF / #ELSE / #ENDIF ----

    /** `#IF n` 처리 */
    beginIf(value: number): void {
        const randomValue = this.randomStack[this.randomStack.length - 1];
        const matches = randomValue === value;
        this.skipStack.push(!matches);
        this.matchedStack.push(matches);
    }

    /** `#ELSEIF n` 처리 */
    beginElseIf(value: number): void {
        const alreadyMatched = this.matchedStack[this.matchedStack.length - 1];
        if (alreadyMatched) {
            // 이미 매칭된 분기가 있으면 스킵
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

    /** `#ELSE` 처리 */
    beginElse(): void {
        const alreadyMatched = this.matchedStack[this.matchedStack.length - 1];
        // 이미 매칭된 분기가 있으면 스킵, 없으면 실행
        this.skipStack[this.skipStack.length - 1] = alreadyMatched;
    }

    /** `#ENDIF` 처리 */
    endIf(): void {
        this.skipStack.pop();
        this.matchedStack.pop();
    }

    // ---- #SWITCH / #CASE / #SKIP / #DEF / #ENDSW ----

    /** `#SWITCH n` 처리 */
    beginSwitch(value: number): void {
        this.switchStack.push({ value, matched: false, skipping: false });
    }

    /** `#CASE n` 처리 */
    beginCase(value: number): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        if (current.skipping || current.matched) {
            // SKIP 이후거나 이미 매칭된 경우 스킵
            this.skipStack[this.skipStack.length - 1] = true;
        } else if (current.value === value) {
            // 매칭됨 — 실행
            current.matched = true;
            this.skipStack[this.skipStack.length - 1] = false;
        } else {
            // 매칭 안됨 — 스킵
            this.skipStack[this.skipStack.length - 1] = true;
        }
    }

    /** `#SKIP` 처리 — 현재 스위치 블록의 나머지를 스킵 */
    beginSkip(): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        current.skipping = true;
        this.skipStack[this.skipStack.length - 1] = true;
    }

    /** `#DEF` 처리 — default 분기 */
    beginDef(): void {
        const current = this.switchStack[this.switchStack.length - 1];
        if (!current) return;
        if (current.skipping || current.matched) {
            this.skipStack[this.skipStack.length - 1] = true;
        } else {
            // 아무 CASE도 매칭되지 않은 경우 실행
            this.skipStack[this.skipStack.length - 1] = false;
        }
    }

    /** `#ENDSW` 처리 */
    endSwitch(): void {
        this.switchStack.pop();
        // 스위치 종료 후 정상 실행 재개
        if (this.skipStack.length > 1 && this.switchStack.length === 0) {
            // 최상위 스킵 상태로 복원
            this.skipStack[this.skipStack.length - 1] = false;
        }
    }
}
