/**
 * Tests de validación de `maxFPS` y del setter `setMaxFPS` (Fase 2.B, D47).
 *
 * No requieren cámara: solo el constructor y el setter. `@mediapipe/tasks-vision`
 * se mockea porque importar `Karada` arrastra el adaptador web que lo importa;
 * el mock evita cargar la dependencia pesada en el entorno `node` de Vitest.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: class {},
  PoseLandmarker: class {},
  HandLandmarker: class {},
  FilesetResolver: class {},
}));

import { Karada } from '../../src/karada';
import { KaradaError } from '../../src/core/errors';

/** Lee el `maxFPS` ya resuelto que consume el throttle (0 = sin límite). */
function internalMaxFPS(karada: Karada): number {
  return (karada as unknown as { options: { maxFPS: number } }).options.maxFPS;
}

describe('maxFPS — validación en el constructor (D47)', () => {
  it('acepta valores válidos y undefined sin lanzar', () => {
    for (const value of [1, 30, 60, 120, undefined] as const) {
      expect(() => new Karada({ maxFPS: value })).not.toThrow();
    }
    // Sin `maxFPS`: por defecto "sin límite" (0 interno).
    expect(internalMaxFPS(new Karada())).toBe(0);
    expect(internalMaxFPS(new Karada({ maxFPS: undefined }))).toBe(0);
    expect(internalMaxFPS(new Karada({ maxFPS: 30 }))).toBe(30);
  });

  it('lanza KaradaError("invalid-options") con valores fuera de rango o no-número', () => {
    const invalid = [0, -1, 121, NaN, Infinity, -Infinity, '30' as unknown as number];
    for (const value of invalid) {
      let caught: unknown;
      try {
        new Karada({ maxFPS: value });
      } catch (err) {
        caught = err;
      }
      expect(caught, `maxFPS=${String(value)} debe lanzar`).toBeInstanceOf(KaradaError);
      expect((caught as KaradaError).type).toBe('invalid-options');
    }
  });
});

describe('setMaxFPS — cambio en runtime (D47)', () => {
  it('setMaxFPS(60) cambia el valor interno consumido por el throttle', () => {
    const karada = new Karada();
    expect(internalMaxFPS(karada)).toBe(0);

    karada.setMaxFPS(60);
    expect(internalMaxFPS(karada)).toBe(60);

    // undefined vuelve a "sin límite".
    karada.setMaxFPS(undefined);
    expect(internalMaxFPS(karada)).toBe(0);
  });

  it('setMaxFPS(0) lanza KaradaError("invalid-options") y no muta el valor', () => {
    const karada = new Karada({ maxFPS: 30 });
    expect(() => karada.setMaxFPS(0)).toThrowError(KaradaError);
    try {
      karada.setMaxFPS(0);
    } catch (err) {
      expect((err as KaradaError).type).toBe('invalid-options');
    }
    // El valor previo se conserva: la validación ocurre antes de asignar.
    expect(internalMaxFPS(karada)).toBe(30);
  });
});
