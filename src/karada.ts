/**
 * Clase pública `Karada`: la única puerta de entrada para el desarrollador.
 *
 * En Fase 1.A es un STUB. Su propósito ahora es garantizar que la API pública
 * compila, es exportable y tiene la forma definitiva. La implementación real
 * (cámara + MediaPipe + loop de captura) llega en 1.B y 1.C.
 *
 * Nota de diseño: `on`/`off` SÍ funcionan ya (delegan en el emisor interno).
 * Aunque el prompt los describía como stubs, suscribirse a eventos es una
 * operación pura que no necesita cámara ni modelos, y permite que el usuario
 * registre sus listeners antes de `start()`. Los métodos que dependen del
 * pipeline (`start`, `stop`, `getFrame`) sí lanzan error hasta 1.B.
 */

import { TypedEventEmitter } from './core/events';
import type {
  KaradaCamera,
  KaradaEvents,
  KaradaOptions,
  KaradaQuality,
  Skeleton,
} from './core/types';

const NOT_IMPLEMENTED = 'Karada: método no implementado en Fase 1.A (llega en 1.B).';

/** Opciones ya resueltas con sus valores por defecto (brief §7). */
interface ResolvedKaradaOptions {
  track: { face: boolean; body: boolean; hands: boolean };
  quality: KaradaQuality;
  camera: KaradaCamera;
  mirror: boolean;
  /** 0 significa "sin límite" de FPS. */
  maxFPS: number;
}

type Listener<K extends keyof KaradaEvents> = (payload: KaradaEvents[K]) => void;

export class Karada {
  private readonly emitter = new TypedEventEmitter<KaradaEvents>();
  private readonly options: ResolvedKaradaOptions;

  constructor(options: KaradaOptions = {}) {
    this.options = {
      track: {
        face: options.track?.face ?? true,
        body: options.track?.body ?? true,
        hands: options.track?.hands ?? true,
      },
      quality: options.quality ?? 'balanced',
      camera: options.camera ?? 'user',
      mirror: options.mirror ?? true,
      maxFPS: options.maxFPS ?? 0,
    };
  }

  /** Suscribe un listener a un evento de Karada. */
  on<K extends keyof KaradaEvents>(event: K, listener: Listener<K>): this {
    this.emitter.on(event, listener);
    return this;
  }

  /** Desuscribe un listener concreto de un evento. */
  off<K extends keyof KaradaEvents>(event: K, listener: Listener<K>): this {
    this.emitter.off(event, listener);
    return this;
  }

  /** Enciende cámara y modelos. Async. (Stub en 1.A.) */
  async start(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Apaga todo y libera cámara y memoria. (Stub en 1.A.) */
  stop(): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  /** Devuelve el esqueleto más reciente de forma síncrona. (Stub en 1.A.) */
  getFrame(): Skeleton | null {
    throw new Error(NOT_IMPLEMENTED);
  }
}
