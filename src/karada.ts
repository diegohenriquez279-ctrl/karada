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
import type {
  KaradaCamera,
  KaradaError,
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

type Listener<K extends keyof KaradaEvents> = (payload: KaradaEvents[K]) => void;

export class Karada {
  private readonly emitter = new TypedEventEmitter<KaradaEvents>();
  private readonly options: ResolvedKaradaOptions;

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
   * Devuelve el `<video>` interno para poder visualizarlo durante el desarrollo
   * (páginas de `scratch/`). NO es API pública: no se exporta desde
   * `src/index.ts` y desaparecerá o cambiará en Fase 2.
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

    try {
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
      this.emitter.emit('ready', undefined);

      this.stopLoop = startLoop(video, (timestampMicros) => this.onTick(timestampMicros));
    } catch (err) {
      this.cleanup();
      const kerr = toKaradaError(err);
      this.emitter.emit('error', kerr);
      throw new Error(`[${kerr.type}] ${kerr.message}`);
    }
  }

  /** Apaga todo, libera cámara y memoria, y olvida el último frame. */
  stop(): void {
    this.cleanup();
    this.lastFrame = null;
  }

  /**
   * Devuelve el esqueleto más reciente (síncrono). Puede quedar "stale" (el
   * último válido) mientras no hay persona; el estado real "sin persona" se
   * cubrirá en Fase 2 con `personLost`.
   */
  getFrame(): Skeleton | null {
    return this.lastFrame;
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

    // D21: solo se emite `frame` cuando hay Skeleton real. `null` no se emite;
    // `lastFrame` conserva el último válido.
    if (skeleton !== null) {
      this.lastFrame = skeleton;
      this.emitter.emit('frame', skeleton);
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

/** Convierte cualquier error en la forma tipada del brief §10. */
function toKaradaError(err: unknown): KaradaError {
  if (err instanceof CameraError) return { type: err.type, message: err.message };
  // Fuera de la cámara, el fallo típico en start() es la carga de modelos.
  const message = err instanceof Error ? err.message : String(err);
  return { type: 'model-load-failed', message };
}
