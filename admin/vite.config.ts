import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// TICKET-001 sprint 0 — independent admin app.
// - base '/admin/' so all asset URLs are prefixed under /admin/
// - outDir '../dist-admin/' so Railway can serve it via express.static('dist-admin')
// - root '.' (admin/) — vite resolves node_modules from parent automatically
export default defineConfig({
  root: __dirname,
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist-admin'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 3100,
    host: '0.0.0.0',
  },
});
