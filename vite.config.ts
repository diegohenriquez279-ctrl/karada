/**
 * Config de Vite SOLO para desarrollo local: sirve las páginas de `scratch/`
 * (smoke tests) y el futuro `demo/` de 1.C.
 *
 * El paquete publicado se compila con tsup, NO con Vite. Este archivo nunca
 * entra al tarball: `package.json` usa una whitelist en `files` (D23).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: { open: false },
});
