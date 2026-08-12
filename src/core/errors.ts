/**
 * Contrato de errores de Karada (brief §10, decisión D34).
 *
 * Este archivo pertenece al núcleo agnóstico: NO depende de MediaPipe, DOM ni
 * APIs de navegador. Define la forma tipada del error que Karada entrega tanto
 * al rechazar `start()` como en el evento `error`.
 *
 * `KaradaError` es una CLASE (no una interface) para que los consumidores puedan
 * hacer `err instanceof KaradaError` y para poder encadenar el error original
 * vía `cause`. El union `KaradaErrorType` queda estable desde 0.1.0: agregar
 * valores es cambio compatible; cambiar la semántica de los existentes no lo es.
 */

/** Categorías de error esperadas por Karada (brief §10 + D34). */
export type KaradaErrorType =
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'model-load-failed'
  | 'not-supported';

/**
 * Error tipado de Karada. Lleva un `type` de la enumeración cerrada anterior y,
 * opcionalmente, el error nativo que lo originó en `cause` (para depuración).
 */
export class KaradaError extends Error {
  readonly type: KaradaErrorType;

  constructor(type: KaradaErrorType, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KaradaError';
    this.type = type;
  }
}
