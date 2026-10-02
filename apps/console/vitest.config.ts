import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Les composants ont besoin d'un DOM : sans lui, rien ne se rend et
    // « cliquer sur un bouton » n'a pas de sens.
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
});
