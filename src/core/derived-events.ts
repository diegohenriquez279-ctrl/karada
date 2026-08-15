/**
 * Lógica pura de los eventos derivados de Fase 2.A (D41–D45).
 *
 * Este archivo vive en el núcleo agnóstico: NO importa MediaPipe, DOM ni
 * `performance.now`. El reloj entra como argumento (`now`), así que la función
 * es 100% determinista y testeable sin cámara ni timers reales. La clase
 * pública `Karada` (`src/karada.ts`) es quien la alimenta con `performance.now()`
 * en cada tick del loop y traduce las emisiones a eventos del emitter.
 *
 * Razón de vivir en core (y no en la clase): los debounces se miden en tiempo
 * real (D41/D42), pero el "tiempo" se le pasa a `processTick` como número. No
 * hay dependencia de plataforma, así que la agnosticidad del núcleo (§4) se
 * respeta y el grep-check de core sigue limpio.
 */

import type { HandLandmarks, HandSide, Skeleton } from './types';

/**
 * Estado interno acumulado entre ticks. Es inmutable desde el punto de vista
 * del consumidor: `processTick` no muta el estado recibido, devuelve uno nuevo.
 */
export interface DerivedEventsState {
  // Persona
  /** Último `Skeleton` con persona detectada (para el payload de `personLost`). */
  lastValidSkeleton: Skeleton | null;
  /** Timestamp (`now`) del último frame con persona. -1 si nunca hubo. */
  lastValidSkeletonTimestamp: number;
  /** ¿Hay persona detectada ahora mismo? (sin comportamiento stale). */
  personPresent: boolean;

  // Manos — por lado
  /** Racha de frames consecutivos con cada mano por encima del umbral. */
  handConsecutiveFrames: { left: number; right: number };
  /** ¿Está presente cada mano ahora mismo? */
  handPresent: { left: boolean; right: boolean };
  /** Última posición conocida de cada mano (para el payload de `handLost`). */
  lastValidHand: { left: HandLandmarks | null; right: HandLandmarks | null };
  /** Timestamp del último frame válido de cada mano. -1 si nunca hubo. */
  lastValidHandTimestamp: { left: number; right: number };
}

/** Parámetros de debounce ya resueltos (con defaults y clamp aplicados). */
export interface DerivedEventsConfig {
  /** ms de ausencia continua antes de `personLost` (D41). */
  personLostDebounceMs: number;
  /** frames consecutivos antes de `handAppeared` (D42). */
  handAppearedFrames: number;
  /** ms de ausencia continua por mano antes de `handLost` (D42). */
  handLostDebounceMs: number;
}

/**
 * Una emisión a producir en este tick. La clase `Karada` la traduce a la
 * llamada `emitter.emit(...)` correspondiente, preservando el orden del array
 * ("estado antes que datos", D45).
 */
export type DerivedEmission =
  | { type: 'personDetected'; skeleton: Skeleton }
  | { type: 'personLost'; lastSkeleton: Skeleton; timestamp: number }
  | { type: 'handAppeared'; side: HandSide; hand: HandLandmarks }
  | { type: 'handLost'; side: HandSide; lastPosition: HandLandmarks; timestamp: number };

/** Estado inicial de una sesión (usado en cada `start()`). */
export function createInitialState(): DerivedEventsState {
  return {
    lastValidSkeleton: null,
    lastValidSkeletonTimestamp: -1,
    personPresent: false,
    handConsecutiveFrames: { left: 0, right: 0 },
    handPresent: { left: false, right: false },
    lastValidHand: { left: null, right: null },
    lastValidHandTimestamp: { left: -1, right: -1 },
  };
}

/** Copia superficial + de los sub-objetos por lado, para no mutar el estado recibido. */
function cloneState(state: DerivedEventsState): DerivedEventsState {
  return {
    lastValidSkeleton: state.lastValidSkeleton,
    lastValidSkeletonTimestamp: state.lastValidSkeletonTimestamp,
    personPresent: state.personPresent,
    handConsecutiveFrames: { ...state.handConsecutiveFrames },
    handPresent: { ...state.handPresent },
    lastValidHand: { ...state.lastValidHand },
    lastValidHandTimestamp: { ...state.lastValidHandTimestamp },
  };
}

const SIDES: readonly HandSide[] = ['left', 'right'];

/**
 * Procesa un tick: dado el `Skeleton | null` construido por el núcleo, el
 * instante `now` y el estado previo, decide qué eventos derivados emitir y
 * devuelve el nuevo estado.
 *
 * No emite `frame`: eso es responsabilidad de la clase `Karada`, que emite
 * TODAS las emisiones derivadas devueltas aquí y solo DESPUÉS `frame` (D45).
 */
export function processTick(
  skeleton: Skeleton | null,
  now: number,
  state: DerivedEventsState,
  config: DerivedEventsConfig,
): { emissions: DerivedEmission[]; nextState: DerivedEventsState } {
  const emissions: DerivedEmission[] = [];
  const next = cloneState(state);

  // --- Paso 1 — Persona -----------------------------------------------------
  if (skeleton !== null) {
    next.lastValidSkeleton = skeleton;
    next.lastValidSkeletonTimestamp = now;
    if (!next.personPresent) {
      // personDetected: inmediato, sin debounce (D41).
      emissions.push({ type: 'personDetected', skeleton });
      next.personPresent = true;
    }
  } else if (next.personPresent && next.lastValidSkeleton !== null) {
    const elapsed = now - next.lastValidSkeletonTimestamp;
    if (elapsed >= config.personLostDebounceMs) {
      emissions.push({
        type: 'personLost',
        lastSkeleton: next.lastValidSkeleton,
        timestamp: next.lastValidSkeletonTimestamp,
      });
      next.personPresent = false;
      // Perder a la persona implica perder las manos: se resetea su estado para
      // que al reaparecer no se dispare un `handLost` con debounce vencido de la
      // sesión anterior. No emitimos `handLost` aquí (la persona se perdió como
      // un todo; las manos no son un evento independiente en este tick).
      next.handConsecutiveFrames = { left: 0, right: 0 };
      next.handPresent = { left: false, right: false };
    }
  }

  // --- Paso 2 — Manos (solo con persona: sin persona no hay manos que evaluar) -
  if (skeleton !== null) {
    for (const side of SIDES) {
      const hand = side === 'left' ? skeleton.leftHand : skeleton.rightHand;
      if (hand !== null) {
        next.handConsecutiveFrames[side] += 1;
        next.lastValidHand[side] = hand;
        next.lastValidHandTimestamp[side] = now;
        if (!next.handPresent[side] && next.handConsecutiveFrames[side] >= config.handAppearedFrames) {
          emissions.push({ type: 'handAppeared', side, hand });
          next.handPresent[side] = true;
        }
      } else {
        // Se rompe la racha de aparición.
        next.handConsecutiveFrames[side] = 0;
        const lastHand = next.lastValidHand[side];
        if (next.handPresent[side] && lastHand !== null) {
          const elapsed = now - next.lastValidHandTimestamp[side];
          if (elapsed >= config.handLostDebounceMs) {
            emissions.push({
              type: 'handLost',
              side,
              lastPosition: lastHand,
              timestamp: next.lastValidHandTimestamp[side],
            });
            next.handPresent[side] = false;
          }
        }
      }
    }
  }

  return { emissions, nextState: next };
}
