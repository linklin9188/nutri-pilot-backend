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
    // TICKET-052 P1 PERF (qa-047 audit): 单 chunk 1.7 MB → 拆 7+ chunk 优化首屏
    // 加载。manualChunks 按 vendor 维度切：react / supabase / motion / xlsx /
    // icons / wechat-jssdk 这些大 lib 各自单 chunk，浏览器并行下载 + 长缓存
    // 命中率高。@google/genai 不在前端 bundle（CLAUDE.md hard invariant: Gemini
    // 走 gemini-proxy edge function，VITE_GEMINI_API_KEY 已移除）。Lazy-loaded
    // proto 路由（App.tsx 47-49 行 import.meta.env.DEV gate）自动单 chunk，不在
    // 这里手动列出。chunkSizeWarningLimit 提到 1100 让业务主 chunk（含 3930 行
    // useWeeklyMenu 算法 + 全部 page static imports）暂时不触发 warning；后续
    // route-level lazy load 才能进一步降主 chunk（超出本 ticket scope）。
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase': ['@supabase/supabase-js'],
            'motion': ['motion', 'framer-motion'],
            'xlsx': ['xlsx'],
            'icons': ['lucide-react'],
            'wechat': ['weixin-js-sdk'],
          },
        },
      },
      chunkSizeWarningLimit: 1100,
    },
  };
});
