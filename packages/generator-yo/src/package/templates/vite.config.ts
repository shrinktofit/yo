import { defineConfig } from 'vite';
import path from 'node:path';

const projectRoot = path.resolve(__dirname);

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
      },
      formats: ['es'],
    },
    outDir: './lib',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: [],
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: path.join(projectRoot, 'src', '$1'),
      },
    ],
  },
});
