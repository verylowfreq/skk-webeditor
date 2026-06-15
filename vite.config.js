import { defineConfig } from 'vite';

export default defineConfig({
  base: '/skk-webeditor/',
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
});
