import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    preview: {
      // Railway injects PORT at runtime; default to 3000 locally
      port: parseInt(process.env.PORT ?? '3000'),
      host: '0.0.0.0',
      // Allow all external hosts (required for Railway / any cloud preview domain)
      allowedHosts: true,
    },
  };
});
