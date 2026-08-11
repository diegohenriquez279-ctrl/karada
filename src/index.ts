/**
 * Entry point público de Karada (decisión D3).
 *
 * Superficie API deliberadamente pequeña: la clase `Karada` y los tipos que el
 * desarrollador necesita para tiparse. El núcleo (`src/core/`) y los futuros
 * adaptadores NO se exportan: eso da libertad de refactorizar sin romper a nadie.
 */

export { Karada } from './karada';

export type {
  KaradaOptions,
  KaradaQuality,
  KaradaCamera,
  Skeleton,
  Point,
  FaceLandmarks,
  BodyLandmarks,
  HandLandmarks,
  KaradaError,
  KaradaErrorType,
  KaradaEvents,
  HandSide,
} from './core/types';
