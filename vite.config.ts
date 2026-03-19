import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'parser/index': resolve(__dirname, 'src/parser/index.ts'),
        'writer/index': resolve(__dirname, 'src/writer/index.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['lodash', '@epic-web/invariant'],
    },
    sourcemap: true,
    minify: false,
  },
});
