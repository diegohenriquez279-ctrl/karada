/**
 * Clase pública `Karada`: la única puerta de entrada para el desarrollador.
 * Une el núcleo agnóstico (1.A) con el adaptador web de MediaPipe (1.B).
 *
 * Responsabilidad: orquestar cámara → landmarkers → loop → `buildSkeleton` y
 * emitir eventos. Toda la lógica específica de MediaPipe/DOM vive en
 * `src/adapters/web/`; aquí solo se coordina.
 */

import { buildSkeleton } from './core/skeleton';
import { TypedEventEmitter } from './core/events';
import { KaradaError } from './core/errors';
import {
  createInitialState,
  processTick,
  type DerivedEmission,
  type DerivedEventsConfig,
  type DerivedEventsState,
} from './core/derived-events';
import type {
  KaradaCamera,
  KaradaEvents,
  KaradaOptions,
  KaradaQuality,
  Skeleton,
} from './core/types';
import { CameraError, closeCamera, openCamera } from './adapters/web/camera';
import { detectFrame, loadLandmarkers, type Landmarkers } from './adapters/web/mediapipe';
import { startLoop } from './adapters/web/loop';

/** Opciones ya resueltas con sus valores por defecto (brief §7). */
interface ResolvedKaradaOptions {
  track: { face: boolean; body: boolean; hands: boolean };
  quality: KaradaQuality;
  camera: KaradaCamera;
  mirror: boolean;
  /** 0 significa "sin límite" de FPS. */
  maxFPS: number;
}

type Listener<K extends keyof KaradaEvents> = (...args: KaradaEvents[K]) => void;

/** Recorta `value` al rango `[min, max]`, usando `fallback` si es `undefined`. */
function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value ?? fallback));
}

export class Karada {
  private readonly emitter = new TypedEventEmitter<KaradaEvents>();
  private readonly options: ResolvedKaradaOptions;

  /** Parámetros de debounce de eventos derivados, ya resueltos (D41–D42). */
  private readonly derivedConfig: DerivedEventsConfig;
  /** Estado acumulado de los eventos derivados. Se resetea en cada `start()`. */
  private derivedState: DerivedEventsState = createInitialState();

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarkers: Landmarkers | null = null;
  private stopLoop: (() => void) | null = null;
  private lastFrame: Skeleton | null = null;
  private running = false;
  private lastEmitTime = 0;

  // Referencia estable para poder removerlo en stop() (brief §10).
  private readonly onBeforeUnload = (): void => this.stop();

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

    // Resolución de los parámetros de eventos derivados. Clamp silencioso en
    // Fase 2.A (D41/D42); en Fase 2.B pasará a throw 'invalid-options' (D50).
    const events = options.events;
    this.derivedConfig = {
      // TODO(2.B): reemplazar clamp por throw invalid-options
      personLostDebounceMs: clamp(events?.personLostDebounceMs, 500, 300, 600),
      // TODO(2.B): reemplazar clamp por throw invalid-options
      handAppearedFrames: clamp(events?.handAppearedFrames, 2, 1, 5),
      // TODO(2.B): reemplazar clamp por throw invalid-options
      handLostDebounceMs: clamp(events?.handLostDebounceMs, 300, 100, 1000),
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

  /**
   * @internal
   * Devuelve el `<video>` interno para poder visualizarlo (el demo de `demo/`
   * lo inserta en el DOM tras `ready`). NO es API pública: no se exporta desde
   * `src/index.ts`, se elide de los `.d.ts` por `stripInternal`, y desaparecerá
   * o cambiará en Fase 2 (cuando se decida cómo exponer el video oficialmente).
   */
  getVideoElement(): HTMLVideoElement {
    if (this.video === null) {
      throw new Error('Karada: el video interno no existe hasta llamar start().');
    }
    return this.video;
  }

  /** Enciende cámara y modelos, y empieza a emitir `frame`. */
  async start(): Promise<void> {
    if (this.running) return;

    // Sesión nueva: se olvida todo el estado de eventos derivados para que un
    // `start` tras un `stop` no arrastre `personPresent`/timestamps viejos.
    this.derivedState = createInitialState();

    try {
      // Precheck de capacidades del entorno (D34). Sin getUserMedia ni
      // WebAssembly no hay nada que intentar: fallamos rápido y tipado.
      if (
        typeof navigator === 'undefined' ||
        navigator.mediaDevices?.getUserMedia === undefined ||
        typeof WebAssembly === 'undefined'
      ) {
        throw new KaradaError(
          'not-supported',
          'Este entorno no soporta getUserMedia y/o WebAssembly, requeridos por Karada.',
        );
      }

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      this.video = video;

      this.stream = await openCamera({ facingMode: this.options.camera, video });
      this.landmarkers = await loadLandmarkers({
        face: this.options.track.face,
        body: this.options.track.body,
        hands: this.options.track.hands,
        quality: this.options.quality,
      });

      window.addEventListener('beforeunload', this.onBeforeUnload);
      this.running = true;
      this.emitter.emit('ready');

      this.stopLoop = startLoop(video, (timestampMicros) => this.onTick(timestampMicros));
    } catch (err) {
      this.cleanup();
      const kerr = toKaradaError(err);
      // D34 + §4.3: se rechaza la promesa con el MISMO `KaradaError` que se
      // emite en el evento `error`, no con un `Error` genérico envuelto.
      this.emitter.emit('error', kerr);
      throw kerr;
    }
  }

  /**
   * Apaga todo, libera cámara y memoria, y olvida el último frame. `stop()` es
   * un cierre abrupto por diseño: NO emite eventos derivados finales sintéticos
   * (nada de `personLost` "al parar"). El consumidor sabe que llamó `stop`.
   */
  stop(): void {
    this.cleanup();
    this.lastFrame = null;
    // Consistente con `lastFrame = null`: tras `stop` no hay persona ni historia.
    this.derivedState = createInitialState();
  }

  /**
   * Devuelve el esqueleto más reciente (síncrono). Puede quedar "stale" (el
   * último válido) mientras no hay persona; el estado real "sin persona" se
   * consulta con `isPresent()` o se escucha con `personLost` (D30, D44).
   */
  getFrame(): Skeleton | null {
    return this.lastFrame;
  }

  /**
   * Indica si hay persona detectada en el frame actual. No aplica el
   * comportamiento "stale" de `getFrame()`: refleja la verdad del momento (D44).
   */
  isPresent(): boolean {
    return this.derivedState.personPresent;
  }

  /**
   * Timestamp (`performance.now`) del último frame válido con persona detectada.
   * Devuelve `-1` si nunca se detectó persona en esta sesión (D44).
   */
  getLastSeen(): number {
    return this.derivedState.lastValidSkeletonTimestamp;
  }

  // -------------------------------------------------------------------------

  private onTick(timestampMicros: number): void {
    if (!this.running || this.landmarkers === null || this.video === null) return;
    if (this.video.videoWidth === 0) return; // aún sin frame decodificado

    // Throttle de maxFPS (gancho listo; 0 = sin límite). Fase 2.B lo formaliza.
    if (this.options.maxFPS > 0) {
      const now = performance.now();
      if (now - this.lastEmitTime < 1000 / this.options.maxFPS) return;
      this.lastEmitTime = now;
    }

    let skeleton: Skeleton | null;
    try {
      const raw = detectFrame(this.landmarkers, {
        video: this.video,
        timestampMicros,
        mirror: this.options.mirror,
      });
      skeleton = buildSkeleton(raw);
    } catch (err) {
      this.emitter.emit('error', toKaradaError(err));
      return;
    }

    // Los debounces de eventos derivados se miden en tiempo real (D41/D42), con
    // `performance.now()` —no con el `mediaTime` del video—.
    this.ingest(skeleton, performance.now());
  }

  /**
   * @internal
   * Procesa un `Skeleton | null` ya construido: emite los eventos derivados
   * (Fase 2.A) y luego `frame`, respetando el orden "estado antes que datos"
   * (D45). Está separado de `onTick` —y expuesto como `@internal`— para poder
   * testear la lógica de eventos de forma determinista sin cámara. Se elide de
   * los `.d.ts` por `stripInternal`; no es API pública.
   */
  ingest(skeleton: Skeleton | null, now: number): void {
    // `lastFrame` conserva el último válido (stale, D30); `null` no lo pisa.
    if (skeleton !== null) {
      this.lastFrame = skeleton;
    }

    // 1) Eventos de estado derivados, en el orden que decide el algoritmo.
    const { emissions, nextState } = processTick(
      skeleton,
      now,
      this.derivedState,
      this.derivedConfig,
    );
    this.derivedState = nextState;
    for (const emission of emissions) this.emitDerived(emission);

    // 2) `frame` DESPUÉS de los eventos de estado (D45). D21: solo con Skeleton
    //    real; `null` no se emite.
    if (skeleton !== null) {
      this.emitter.emit('frame', skeleton);
    }
  }

  /** Traduce una emisión derivada a la llamada tipada del emitter (D43). */
  private emitDerived(emission: DerivedEmission): void {
    switch (emission.type) {
      case 'personDetected':
        this.emitter.emit('personDetected', emission.skeleton);
        break;
      case 'personLost':
        this.emitter.emit('personLost', {
          lastSkeleton: emission.lastSkeleton,
          timestamp: emission.timestamp,
        });
        break;
      case 'handAppeared':
        this.emitter.emit('handAppeared', emission.side, emission.hand);
        break;
      case 'handLost':
        this.emitter.emit('handLost', emission.side, {
          lastPosition: emission.lastPosition,
          timestamp: emission.timestamp,
        });
        break;
    }
  }

  private cleanup(): void {
    if (this.stopLoop !== null) {
      this.stopLoop();
      this.stopLoop = null;
    }
    if (this.landmarkers !== null) {
      this.landmarkers.close();
      this.landmarkers = null;
    }
    if (this.stream !== null && this.video !== null) {
      closeCamera(this.stream, this.video);
    }
    this.stream = null;
    this.video = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.onBeforeUnload);
    }
    this.running = false;
  }
}

/**
 * Convierte cualquier throw en un `KaradaError` tipado (brief §10, D34).
 * Ningún error nativo debe escapar de `start()` sin envolver.
 */
function toKaradaError(err: unknown): KaradaError {
  // Ya tipado (p. ej. el precheck 'not-supported'): se deja pasar tal cual.
  if (err instanceof KaradaError) return err;
  // Errores de cámara (getUserMedia) traen su `type` ya mapeado (D34).
  if (err instanceof CameraError) {
    return new KaradaError(err.type, err.message, { cause: err });
  }
  // Fuera de la cámara, el fallo típico en start() es la carga de modelos
  // (FilesetResolver / createFromOptions). Fallback a 'model-load-failed'.
  const message = err instanceof Error ? err.message : String(err);
  return new KaradaError('model-load-failed', message, { cause: err });
}
