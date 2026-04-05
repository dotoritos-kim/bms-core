// Native replacements for the lodash functions we used.
export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
export const map = <T, U>(arr: T[], fn: (v: T) => U): U[] => arr.map(fn);
export const values = <T>(obj: Record<string, T>): T[] => Object.values(obj);
export const assign = Object.assign;
