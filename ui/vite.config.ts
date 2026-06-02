import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function neutralinoInjectPlugin() {
  let isDesktop = false;
  return {
    name: 'neutralino-inject',
    configResolved(config: any) {
      isDesktop = config.mode === 'desktop';
    },
    transformIndexHtml(html: string) {
      if (isDesktop) {
        return html.replace(
          '</body>',
          '  <script src="js/neutralino.js"></script>\n  <script src="js/main.js"></script>\n</body>'
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  return {
    plugins: [react(), neutralinoInjectPlugin()],
    base: isDesktop ? '/' : '/public/admin/',
    build: {
      outDir: isDesktop ? '../desktop/resources' : '../build/public/admin',
      emptyOutDir: !isDesktop,
    },
    server: {
      host: '::',
      proxy: {
        '/admin': {
          target: 'http://localhost:8700',
          changeOrigin: true,
        },
        '/log': {
          target: 'http://localhost:8700',
          changeOrigin: true,
        },
      },
    },
  };
});
