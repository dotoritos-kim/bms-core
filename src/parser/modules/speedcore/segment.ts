export interface SpeedSegment {
    t: number;
    x: number;
    /** Change in x per t */
    dx: number;
    /** Whether the segment includes t */
    inclusive: boolean;
}

/**
 * Validates the required numeric fields of a SpeedSegment at runtime.
 *
 * This used to be validated with a custom `DataStructure` facade, but since
 * `Speedcore` is only created inside the library and the field types are
 * already enforced by TypeScript, it is replaced with a small inline guard.
 * The external API is unaffected.
 */
export function assertSpeedSegment(value: SpeedSegment): void {
    if (typeof value.t !== 'number') {
        throw new Error('Error in property "t": Value should be of type number');
    }
    if (typeof value.x !== 'number') {
        throw new Error('Error in property "x": Value should be of type number');
    }
    if (typeof value.dx !== 'number') {
        throw new Error('Error in property "dx": Value should be of type number');
    }
}
