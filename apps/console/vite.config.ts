import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // La console lit le pack d'icônes LÀ OÙ IL VIT, dans l'application
      // mobile. Le copier ici créerait deux vérités qui divergeraient au
      // premier ajout de symbole.
      allow: [resolve(__dirname), resolve(__dirname, '../mobile/assets')],
    },
  },
});
