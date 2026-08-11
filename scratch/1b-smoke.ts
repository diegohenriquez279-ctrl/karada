/**
 * Wire-up del smoke test de 1.B (D22). Abre la cámara vía Karada, muestra el
 * video interno y loguea el `Skeleton` throttleado a 1/seg. No dibuja nada en
 * canvas (eso es 1.C).
 *
 * Importa desde el código fuente (`../src/index`), no desde el paquete
 * publicado: estamos en desarrollo local.
 */

import { Karada } from '../src/index';
import type { Skeleton } from '../src/index';

declare global {
  interface Window {
    __lastSkeleton?: Skeleton;
  }
}

const statusEl = document.getElementById('status') as HTMLDivElement;
const holder = document.getElementById('video-holder') as HTMLDivElement;

const karada = new Karada({
  track: { face: true, body: true, hands: true },
  quality: 'balanced',
  mirror: true,
});

karada.on('ready', () => {
  statusEl.textContent = 'ready';
});

karada.on('error', (err) => {
  statusEl.textContent = `error: ${err.type}`;
  console.error('Karada error:', err);
});

let lastLog = 0;
karada.on('frame', (skeleton) => {
  window.__lastSkeleton = skeleton;
  const now = performance.now();
  if (now - lastLog >= 1000) {
    lastLog = now;
    console.log(skeleton);
  }
});

try {
  await karada.start();
  // Insertar el video interno para verlo, con espejo visual (D9).
  const video = karada.getVideoElement();
  video.classList.add('mirror');
  holder.appendChild(video);
} catch (err) {
  // El evento `error` ya actualizó el status; esto es log adicional.
  console.error('start() falló:', err);
}
