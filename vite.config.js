import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` serves the game.
// `npm run build`: one self-contained dist/index.html (claude.ai artifact, offline file).
// `npm run build:pages`: the website build in dist-pages/, split into files so the big libraries
// (three.js, Rapier, Supabase) are cached by the browser and only the game code downloads again
// after an update. Copy dist-pages/ into docs/.
export default defineConfig(({ mode }) => {
  if (mode === 'pages') {
    return {
      base: './',
      build: {
        target: 'es2020',
        outDir: 'dist-pages',
        emptyOutDir: true,
        chunkSizeWarningLimit: 8000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/three')) return 'three';
              if (id.includes('node_modules/@dimforge')) return 'rapier';
              if (id.includes('node_modules/@supabase')) return 'supabase';
              return undefined;
            },
          },
        },
      },
    };
  }
  return {
    plugins: [viteSingleFile()],
    build: {
      target: 'es2020',
      assetsInlineLimit: 100000000,
      chunkSizeWarningLimit: 8000,
    },
  };
});
