/**
 * Adaptador de cámara para web. Aísla `getUserMedia`, la traducción de errores
 * nativos a los tipos del brief §10 y la liberación del stream.
 *
 * Este archivo pertenece a la capa de adaptadores (arquitectura de 3 capas):
 * puede usar APIs de navegador libremente. El núcleo NUNCA lo importa.
 */

import type { KaradaErrorType } from '../../core/types';

/** Error de cámara con el `type` tipado del brief §10. */
export class CameraError extends Error {
  constructor(
    public readonly type: KaradaErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export interface OpenCameraOptions {
  /** `'user'`/`'environment'`, o cualquier otro string tratado como `deviceId`. */
  facingMode: 'user' | 'environment' | string;
  video: HTMLVideoElement;
}

/**
 * Abre la cámara, la conecta al `<video>` y resuelve cuando hay metadata
 * (dimensiones ya disponibles). Devuelve el `MediaStream` para poder cerrarlo.
 */
export async function openCamera(options: OpenCameraOptions): Promise<MediaStream> {
  const { facingMode, video } = options;

  if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
    throw new CameraError('not-supported', 'getUserMedia no está disponible en este entorno.');
  }

  // Un string arbitrario (no 'user'/'environment') se interpreta como deviceId.
  const videoConstraints: MediaTrackConstraints =
    facingMode === 'user' || facingMode === 'environment'
      ? { facingMode }
      : { deviceId: { exact: facingMode } };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
  } catch (err) {
    throw translateGetUserMediaError(err);
  }

  video.srcObject = stream;
  await waitForMetadata(video);
  // `play()` puede requerir `muted` (autoplay policy); el smoke test lo marca.
  await video.play().catch(() => undefined);

  return stream;
}

/** Detiene todos los tracks y desconecta el stream del `<video>`. */
export function closeCamera(stream: MediaStream, video: HTMLVideoElement): void {
  for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 /* HAVE_METADATA */) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
}

/** Mapea el `DOMException.name` de getUserMedia a los tipos del brief §10. */
function translateGetUserMediaError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('permission-denied', 'El usuario denegó el permiso de cámara.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('camera-not-found', 'No se encontró una cámara que cumpla las restricciones.');
    case 'NotReadableError':
      return new CameraError('camera-in-use', 'La cámara está en uso por otra aplicación.');
    default:
      return new CameraError('not-supported', `Error de cámara no reconocido: ${name || String(err)}.`);
  }
}
