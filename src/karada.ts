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

/**
 * Estado interno del ciclo de vida (D46). Transiciones válidas:
 *   idle → starting → running ⇄ paused ; {running|paused} → stopped ; * → stopped.
 * Un `start()` fallido durante `starting` vuelve a `idle` (se puede reintentar).
 */
type KaradaState = 'idle' | 'starting' | 'running' | 'paused' | 'stopped';

type Listener<K extends keyof KaradaEvents> = (...args: KaradaEvents[K]) => void;

/** Recorta `value` al rango `[min, max]`, usando `fallback` si es `undefined`. */
function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value ?? fallback));
}

/**
 * Valida `maxFPS` contra el rango del brief §7 (D47). `undefined` = sin límite.
 * Cualquier no-número, no-finito o fuera de `[1, 120]` lanza `'invalid-options'`.
 * Se usa tanto en el constructor (retrofit sobre D40) como en `setMaxFPS`.
 */
function validateMaxFPS(value: number | undefined): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 120) {
    throw new KaradaError('invalid-options', 'maxFPS must be undefined or a number in [1, 120]');
  }
}

/**
 * Módulo WebAssembly mínimo (solo cabecera magic + versión). Válido como módulo
 * vacío: sirve para probar que `WebAssembly.validate` funciona (D48).
 */
const WASM_MINIMAL = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/**
 * Módulo WebAssembly con una instrucción SIMD (`i8x16.splat`) — patrón estándar
 * de wasm-feature-detect. Si `WebAssembly.validate` lo acepta, hay soporte SIMD.
 * `(module (func (result v128) i32.const 0 i8x16.splat))`.
 */
const WASM_SIMD = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // header
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
  0x03, 0x02, 0x01, 0x00, // func section
  0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x0b, // code: i32.const 0; i8x16.splat; end
]);

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
  private state: KaradaState = 'idle';
  private lastEmitTime = 0;

  /**
   * Desfase acumulado del reloj para "congelar" el tiempo durante las pausas
   * (D46/D55). El `now` que se pasa a `processTick` es `performance.now()` real
   * MENOS este offset, de modo que el núcleo agnóstico no percibe la pausa. Se
   * incrementa en `resume()` con la duración de la pausa y se resetea en `stop()`.
   */
  private clockOffset = 0;
  /** `performance.now()` real del instante de `pause()`; base para el offset. */
  private pauseWallClock = 0;

  // Referencia estable para poder removerlo en stop() (brief §10).
  private readonly onBeforeUnload = (): void => this.stop();

  constructor(options: KaradaOptions = {}) {
    // Retrofit de D47 sobre D40: el constructor de 1.B aceptaba `maxFPS` sin
    // validar. Ahora un valor fuera de `[1, 120]` (o no-finito) lanza en vez de
    // colarse. Cambio observable pero correcto según brief §7.
    validateMaxFPS(options.maxFPS);

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
    // D46: arrancar cuando ya hay una sesión activa (o a medio arrancar) es un
    // error de estado, no un no-op silencioso. `stop()` primero para reiniciar.
    if (this.state === 'starting' || this.state === 'running' || this.state === 'paused') {
      throw new KaradaError('invalid-state', 'start() called while already active');
    }
    this.state = 'starting';

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
      this.state = 'running';
      this.emitter.emit('ready');

      this.stopLoop = startLoop(video, (timestampMicros) => this.onTick(timestampMicros));
    } catch (err) {
      this.cleanup();
      // Init fallido: se puede reintentar `start()` desde cero.
      this.state = 'idle';
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
    this.state = 'stopped';
    this.lastFrame = null;
    // Consistente con `lastFrame = null`: tras `stop` no hay persona ni historia.
    this.derivedState = createInitialState();
    // El próximo `start()` arranca con el reloj limpio (D46): sin pausas heredadas.
    this.clockOffset = 0;
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

  /**
   * Cambia el límite de FPS en runtime (D47), con la misma validación que el
   * constructor. `undefined` quita el límite. Un valor fuera de `[1, 120]` lanza
   * `KaradaError('invalid-options')`. No reinicia nada más: el nuevo valor lo
   * consume el throttle de `onTick` a partir del siguiente frame.
   */
  setMaxFPS(value: number | undefined): void {
    validateMaxFPS(value);
    this.options.maxFPS = value ?? 0;
  }

  /**
   * Pausa la emisión de `frame` sin liberar cámara ni modelos (D46). Cancela el
   * loop, apaga la luz física de la cámara (`videoTrack.enabled = false`) y
   * CONGELA el reloj de los eventos derivados: durante la pausa no corre
   * `processTick`, así que `personLost`/`handLost` no disparan aunque el reloj
   * real venza el debounce. Reanudar con `resume()` es instantáneo.
   *
   * @throws KaradaError `'invalid-state'` si no hay una sesión corriendo.
   */
  pause(): void {
    this.pauseAt(performance.now());
  }

  /**
   * Reanuda la emisión tras `pause()` (D46). Re-enciende la cámara, re-suscribe
   * el loop y descuenta la duración de la pausa del reloj, de modo que los
   * debounces de eventos derivados siguen midiendo desde donde quedaron.
   *
   * @throws KaradaError `'invalid-state'` si no está pausado.
   */
  resume(): void {
    this.resumeAt(performance.now());
  }

  /**
   * @internal
   * Núcleo de `pause()` con el reloj inyectado (D55). Público solo de nombre:
   * se elide del `.d.ts` por `stripInternal`. El seam permite testear el
   * congelamiento del reloj sin `performance.now` real ni fake timers.
   */
  pauseAt(now: number): void {
    if (this.state !== 'running') {
      throw new KaradaError('invalid-state', 'pause() called while not running');
    }
    // Cancelar el rVFC activo: deja de procesar frames y libera CPU/GPU.
    if (this.stopLoop !== null) {
      this.stopLoop();
      this.stopLoop = null;
    }
    // Apagar la luz física de la cámara (expectativa de privacidad, D46).
    const track = this.stream?.getVideoTracks()[0];
    if (track !== undefined) track.enabled = false;
    // Congelar el reloj de debounce: se guarda el instante de pausa. No se llama
    // a `processTick` durante la pausa, así que el DerivedEventState no se toca.
    this.pauseWallClock = now;
    this.state = 'paused';
  }

  /**
   * @internal
   * Núcleo de `resume()` con el reloj inyectado (D55). Elidido del `.d.ts`.
   */
  resumeAt(now: number): void {
    if (this.state !== 'paused') {
      throw new KaradaError('invalid-state', 'resume() called while not paused');
    }
    const track = this.stream?.getVideoTracks()[0];
    if (track !== undefined) track.enabled = true;
    // Acumular la duración de la pausa en el offset. A partir de aquí, el `now`
    // que ve `processTick` (real − offset) "no avanzó" durante la pausa (D46).
    this.clockOffset += now - this.pauseWallClock;
    // El throttle de maxFPS se resetea: el primer frame post-resume no se compara
    // contra un timestamp pre-pausa.
    this.lastEmitTime = 0;
    this.state = 'running';
    // Re-suscribir el loop. `ready` NO se re-emite (es one-shot del init).
    if (this.video !== null) {
      this.stopLoop = startLoop(this.video, (timestampMicros) => this.onTick(timestampMicros));
    }
  }

  /**
   * Chequeo de capacidades del entorno (D48). Síncrono, sin efectos secundarios
   * y sin pedir permisos. `supported` es `true` solo si todos los `missing`
   * (required) están presentes; `warnings` lista features opcionales ausentes
   * que degradan el rendimiento pero no bloquean.
   */
  static isSupported(): { supported: boolean; missing: string[]; warnings: string[] } {
    const missing: string[] = [];
    const warnings: string[] = [];

    // --- Required (bloquean) ---
    if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
      missing.push('getUserMedia');
    }
    if (
      typeof WebAssembly === 'undefined' ||
      typeof WebAssembly.validate !== 'function' ||
      !WebAssembly.validate(WASM_MINIMAL)
    ) {
      missing.push('WebAssembly');
    }
    if (typeof window === 'undefined' || window.isSecureContext !== true) {
      missing.push('secureContext');
    }

    // --- Opcionales (warning) ---
    if (
      typeof WebAssembly === 'undefined' ||
      typeof WebAssembly.validate !== 'function' ||
      !WebAssembly.validate(WASM_SIMD)
    ) {
      warnings.push('WebAssembly SIMD not available; MediaPipe may run 2–3x slower');
    }
    if (
      typeof HTMLVideoElement === 'undefined' ||
      !('requestVideoFrameCallback' in HTMLVideoElement.prototype)
    ) {
      warnings.push('requestVideoFrameCallback not available; falling back to requestAnimationFrame');
    }

    return { supported: missing.length === 0, missing, warnings };
  }

  /**
   * Consulta el estado del permiso de cámara SIN dispararlo (D49). Usa la
   * Permissions API; si no existe o rechaza (Safari históricamente no soporta
   * `'camera'`), devuelve `'unknown'`. Nunca llama `getUserMedia`.
   *
   * Nota PWA (iOS): el permiso de cámara no persiste entre sesiones; se
   * re-pregunta cada vez que se abre la app. Es limitación de iOS, no de Karada.
   */
  static async checkPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    if (typeof navigator === 'undefined' || navigator.permissions?.query === undefined) {
      return 'unknown';
    }
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return result.state;
    } catch {
      return 'unknown';
    }
  }

  // -------------------------------------------------------------------------

  private onTick(timestampMicros: number): void {
    if (this.state !== 'running' || this.landmarkers === null || this.video === null) return;
    if (this.video.videoWidth === 0) return; // aún sin frame decodificado

    // Throttle de maxFPS (D40/D47; 0 = sin límite).
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
   *
   * El `now` que entra es el reloj REAL (`performance.now()` en producción). Aquí
   * se le descuenta `clockOffset` antes de pasarlo a `processTick`, para que el
   * núcleo agnóstico no perciba el tiempo transcurrido en pausas (D46/D55).
   */
  ingest(skeleton: Skeleton | null, now: number): void {
    const coreNow = now - this.clockOffset;

    // `lastFrame` conserva el último válido (stale, D30); `null` no lo pisa.
    if (skeleton !== null) {
      this.lastFrame = skeleton;
    }

    // 1) Eventos de estado derivados, en el orden que decide el algoritmo.
    const { emissions, nextState } = processTick(
      skeleton,
      coreNow,
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
    // El estado lo fija el llamador (`stop()` → 'stopped'; catch de `start()` →
    // 'idle'): `cleanup()` solo libera recursos, no decide la transición.
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
