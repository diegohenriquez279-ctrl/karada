/*
 * Config de Vite SOLO para el demo de 1.C (D36). Sirve `demo/` en desarrollo
 * (`npm run dev`) y lo compila para GitHub Pages (`npm run build:demo`).
 *
 * `base: '/karada/'` es obligatorio: el sitio vive en un subpath
 * (usuario.github.io/karada/), no en la raíz del dominio, así que los assets
 * deben resolverse contra ese prefijo.
 *
 * El paquete publicado se compila con tsup, NO con Vite. Este archivo nunca
 * entra al tarball: `package.json` usa una whitelist en `files` (D23).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: '/karada/',
  build: {
    // Relativo a `root` → el output final va a `demo/dist/`.
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
  },
});
