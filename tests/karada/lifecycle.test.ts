/**
 * Tests de ciclo de vida de Fase 2.B (D46): `pause`/`resume`, guardas de estado
 * (`invalid-state`) y congelamiento del reloj de eventos derivados.
 *
 * Estrategia:
 *  - Se mockean los tres módulos del adaptador web (`camera`, `mediapipe`,
 *    `loop`) para que `start()` complete sin cámara ni MediaPipe reales. El
 *    `startLoop` mockeado NO invoca `onTick`, así que ningún tick automático
 *    interfiere: los ticks se inyectan a mano con `ingest(skeleton, now)` (D55).
 *  - El congelamiento del reloj se prueba de forma 100% determinista con los
 *    seams `@internal` `pauseAt(now)` / `resumeAt(now)`, que inyectan el reloj
 *    igual que `ingest`. No se usan fake timers ni se mockea `performance.now`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks del adaptador web (hoisted para poder inspeccionarlos) ------------
const mocks = vi.hoisted(() => {
  const track = { enabled: true, stop: vi.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  const stopLoop = vi.fn();
  const startLoop = vi.fn(() => stopLoop); // devuelve un stop fn; nunca auto-tickea
  const openCamera = vi.fn(async () => stream);
  const closeCamera = vi.fn();
  const loadLandmarkers = vi.fn(async () => ({ close: vi.fn() }));
  return { track, stream, stopLoop, startLoop, openCamera, closeCamera, loadLandmarkers };
});

vi.mock('../../src/adapters/web/camera', () => ({
  CameraError: class CameraError extends Error {
    type: string;
    constructor(type: string, message: string) {
      super(message);
      this.type = type;
    }
  },
  openCamera: mocks.openCamera,
  closeCamera: mocks.closeCamera,
}));

vi.mock('../../src/adapters/web/mediapipe', () => ({
  loadLandmarkers: mocks.loadLandmarkers,
  detectFrame: vi.fn(),
}));

vi.mock('../../src/adapters/web/loop', () => ({
  startLoop: mocks.startLoop,
}));

import { Karada } from '../../src/karada';
import { KaradaError } from '../../src/core/errors';
import { buildSkeleton, type RawFrame } from '../../src/core/skeleton';
import type { Skeleton } from '../../src/core/types';
import validFrame from '../fixtures/valid-frame.json';

const FULL = buildSkeleton(validFrame as RawFrame)!;
if (FULL === null) throw new Error('fixture valid-frame debe producir un Skeleton');

function person(left: boolean, right: boolean): Skeleton {
  return {
    ...FULL,
    leftHand: left ? FULL.leftHand : null,
    rightHand: right ? FULL.rightHand : null,
  };
}

/** Acceso de caja blanca al `clockOffset` privado (para el test de `stop`). */
function clockOffset(karada: Karada): number {
  return (karada as unknown as { clockOffset: number }).clockOffset;
}

beforeEach(() => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    isSecureContext: true,
  });
  vi.stubGlobal('document', { createElement: vi.fn(() => ({ videoWidth: 640 })) });
  mocks.track.enabled = true;
  mocks.startLoop.mockClear();
  mocks.stopLoop.mockClear();
  mocks.openCamera.mockClear();
  mocks.closeCamera.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Guardas de estado (invalid-state)
// ---------------------------------------------------------------------------

describe('Karada — guardas de estado (D46/D50)', () => {
  it('pause() sin start() lanza invalid-state', () => {
    const karada = new Karada();
    let caught: unknown;
    try {
      karada.pause();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KaradaError);
    expect((caught as KaradaError).type).toBe('invalid-state');
  });

  it('resume() sin pause() lanza invalid-state', () => {
    const karada = new Karada();
    let caught: unknown;
    try {
      karada.resume();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KaradaError);
    expect((caught as KaradaError).type).toBe('invalid-state');
  });

  it('start() dos veces: el segundo lanza invalid-state', async () => {
    const karada = new Karada();
    await karada.start();

    let caught: unknown;
    try {
      await karada.start();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(KaradaError);
    expect((caught as KaradaError).type).toBe('invalid-state');

    karada.stop();
  });
});

// ---------------------------------------------------------------------------
// Flujo feliz start → pause → resume → stop
// ---------------------------------------------------------------------------

describe('Karada — flujo pause/resume (D46)', () => {
  it('start → pause → resume → stop sin errores; alterna videoTrack.enabled', async () => {
    const karada = new Karada();
    await karada.start();
    expect(mocks.startLoop).toHaveBeenCalledTimes(1);

    karada.pause();
    expect(mocks.track.enabled).toBe(false); // luz de cámara apagada
    expect(mocks.stopLoop).toHaveBeenCalledTimes(1); // rVFC cancelado

    karada.resume();
    expect(mocks.track.enabled).toBe(true); // luz re-encendida
    expect(mocks.startLoop).toHaveBeenCalledTimes(2); // rVFC re-suscrito

    expect(() => karada.stop()).not.toThrow();
  });

  it('doble pause() o resume() en el estado equivocado lanza invalid-state', async () => {
    const karada = new Karada();
    await karada.start();

    karada.pause();
    expect(() => karada.pause()).toThrowError(KaradaError); // ya pausado
    karada.resume();
    expect(() => karada.resume()).toThrowError(KaradaError); // ya corriendo

    karada.stop();
  });
});

// ---------------------------------------------------------------------------
// Congelamiento del reloj de eventos derivados
// ---------------------------------------------------------------------------

describe('Karada — congelamiento del reloj en pausa (D46/D55)', () => {
  it('el debounce de personLost sigue midiendo desde antes de la pausa, no reinicia', async () => {
    const karada = new Karada();
    await karada.start();

    const lost = vi.fn();
    karada.on('personLost', lost);

    // t=1000: persona detectada. Debounce de personLost = 500 ms.
    karada.ingest(person(true, true), 1000);
    // t=1300: persona ausente 300 ms → faltan 200 ms para personLost.
    karada.ingest(null, 1300);
    expect(lost).not.toHaveBeenCalled();

    // Pausa de 300 ms de reloj REAL (1300 → 1600). Durante la pausa NO se llama
    // a ingest/processTick: el debounce no debe avanzar.
    karada.pauseAt(1300);
    karada.resumeAt(1600);
    expect(lost).not.toHaveBeenCalled(); // la pausa no disparó personLost

    // Post-resume: han pasado 199 ms de reloj real (1600 → 1799). Como el reloj
    // "congeló" la pausa, para el núcleo solo pasaron 300+199 = 499 ms < 500.
    karada.ingest(null, 1799);
    expect(lost).not.toHaveBeenCalled();

    // 1 ms más (1800): 300 + 200 = 500 ms exactos → ahora sí dispara.
    karada.ingest(null, 1800);
    expect(lost).toHaveBeenCalledTimes(1);

    karada.stop();
  });

  it('stop() resetea clockOffset y el estado derivado; un nuevo start arranca en cero', async () => {
    const karada = new Karada();
    await karada.start();

    // Genera un offset de 300 ms con una pausa.
    karada.ingest(person(true, true), 1000);
    karada.pauseAt(1300);
    karada.resumeAt(1600);
    expect(clockOffset(karada)).toBe(300);
    expect(karada.isPresent()).toBe(true);

    karada.stop();
    expect(clockOffset(karada)).toBe(0); // reloj limpio
    expect(karada.isPresent()).toBe(false); // estado derivado reseteado
    expect(karada.getLastSeen()).toBe(-1);

    // Nueva sesión: sin offset heredado, el timestamp del núcleo == el inyectado.
    await karada.start();
    karada.ingest(person(true, true), 5000);
    expect(karada.getLastSeen()).toBe(5000);

    karada.stop();
  });
});
