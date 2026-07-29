// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat config (pattern shared with bms-editor / bms-player / bms-electron-app).
 * Baseline: js + typescript-eslint recommended. Rules downgraded to "warn"
 * reflect pre-existing patterns in this codebase — tighten incrementally.
 */
export default tseslint.config(
    { ignores: ['dist/', 'coverage/', 'node_modules/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts', 'tests/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
);
