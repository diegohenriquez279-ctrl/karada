/**
 * Punto de reunión del adaptador web. NO se re-exporta desde `src/index.ts`:
 * la superficie pública del paquete es solo la clase `Karada` y sus tipos (D3).
 */

export { openCamera, closeCamera } from './camera';
export { loadLandmarkers } from './mediapipe';
export { startLoop } from './loop';
