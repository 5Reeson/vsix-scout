import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: '/vsix-scout/',
  plugins: [
    {
      name: 'dev-csp-for-vite-styles',
      transformIndexHtml(html) {
        if (command !== 'serve') return html;
        return html.replace(
          "script-src 'self'",
          "script-src 'self' 'unsafe-inline'",
        );
      },
    },
    react(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
}));
