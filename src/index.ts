/**
 * Entry point público de Karada (decisión D3).
 *
 * Superficie API deliberadamente pequeña: la clase `Karada` y los tipos que el
 * desarrollador necesita para tiparse. El núcleo (`src/core/`) y los futuros
 * adaptadores NO se exportan: eso da libertad de refactorizar sin romper a nadie.
 */

export { Karada } from './karada';

// `KaradaError` es una CLASE (D34): se exporta como valor para que el consumidor
// pueda hacer `err instanceof KaradaError`, no solo tiparse contra ella.
export { KaradaError } from './core/errors';
export type { KaradaErrorType } from './core/errors';

export type {
  KaradaOptions,
  KaradaQuality,
  KaradaCamera,
  Skeleton,
  Point,
  FaceLandmarks,
  BodyLandmarks,
  HandLandmarks,
  KaradaEvents,
  HandSide,
} from './core/types';
