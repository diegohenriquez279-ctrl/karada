/**
 * Tests de `Karada.isSupported()` (Fase 2.B, D48).
 *
 * Es un método estático síncrono sin efectos secundarios. Se mockean los
 * globales del entorno (`navigator`, `window`, `WebAssembly`, `HTMLVideoElement`)
 * con `vi.stubGlobal` para ejercitar cada rama de `missing` y `warnings`. No se
 * usan fake timers ni se mockea `performance.now` (no interviene aquí).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: class {},
  PoseLandmarker: class {},
  HandLandmarker: class {},
  FilesetResolver: class {},
}));

import { Karada } from '../../src/karada';

/** Deja el entorno en estado "todo soportado" antes de cada test. */
beforeEach(() => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => undefined } });
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('HTMLVideoElement', { prototype: { requestVideoFrameCallback: () => undefined } });
  // `WebAssembly` se deja nativo (node lo soporta con SIMD) salvo override explícito.
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Karada.isSupported', () => {
  it('retorna un objeto síncrono (no Promise) con la forma esperada', () => {
    const result = Karada.isSupported();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toHaveProperty('supported');
    expect(Array.isArray(result.missing)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('entorno completo → supported=true, sin required faltantes', () => {
    const { supported, missing } = Karada.isSupported();
    expect(supported).toBe(true);
    expect(missing).toEqual([]);
  });

  it('sin getUserMedia → missing incluye "getUserMedia" y supported=false', () => {
    vi.stubGlobal('navigator', {});
    const { supported, missing } = Karada.isSupported();
    expect(missing).toContain('getUserMedia');
    expect(supported).toBe(false);
  });

  it('sin WebAssembly → missing incluye "WebAssembly"', () => {
    vi.stubGlobal('WebAssembly', undefined);
    const { supported, missing } = Karada.isSupported();
    expect(missing).toContain('WebAssembly');
    expect(supported).toBe(false);
  });

  it('sin contexto seguro → missing incluye "secureContext"', () => {
    vi.stubGlobal('window', { isSecureContext: false });
    const { supported, missing } = Karada.isSupported();
    expect(missing).toContain('secureContext');
    expect(supported).toBe(false);
  });

  it('acumula varios required faltantes a la vez', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: false });
    const { missing } = Karada.isSupported();
    expect(missing).toEqual(expect.arrayContaining(['getUserMedia', 'secureContext']));
  });

  it('sin SIMD → warning de rendimiento, pero sigue supported=true', () => {
    // validate acepta el módulo mínimo (8 bytes) pero rechaza el de SIMD (>8).
    vi.stubGlobal('WebAssembly', { validate: (bytes: Uint8Array) => bytes.length === 8 });
    const { supported, missing, warnings } = Karada.isSupported();
    expect(missing).not.toContain('WebAssembly'); // el required sí pasa
    expect(supported).toBe(true);
    expect(warnings.some((w) => w.includes('SIMD'))).toBe(true);
  });

  it('sin requestVideoFrameCallback → warning de fallback a rAF', () => {
    vi.stubGlobal('HTMLVideoElement', { prototype: {} });
    const { supported, warnings } = Karada.isSupported();
    expect(supported).toBe(true);
    expect(warnings.some((w) => w.includes('requestVideoFrameCallback'))).toBe(true);
  });
});
