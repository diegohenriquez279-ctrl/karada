/**
 * Tests de `Karada.checkPermission()` (Fase 2.B, D49).
 *
 * Verifica que use la Permissions API, que degrade a `'unknown'` cuando no está
 * disponible o rechaza, y que NUNCA dispare `getUserMedia` (lo que provocaría el
 * prompt de permiso que queremos evitar).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: class {},
  PoseLandmarker: class {},
  HandLandmarker: class {},
  FilesetResolver: class {},
}));

import { Karada } from '../../src/karada';

const getUserMedia = vi.fn(async () => ({}) as MediaStream);

/** Stubbea `navigator` con una `permissions.query` que resuelve a `state`. */
function stubPermissions(state: PermissionState): void {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia },
    permissions: { query: vi.fn(async () => ({ state })) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  getUserMedia.mockClear();
});

describe('Karada.checkPermission', () => {
  it('devuelve el estado que reporta la Permissions API', async () => {
    for (const state of ['granted', 'denied', 'prompt'] as const) {
      stubPermissions(state);
      await expect(Karada.checkPermission()).resolves.toBe(state);
    }
  });

  it('sin navigator.permissions → "unknown"', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(Karada.checkPermission()).resolves.toBe('unknown');
  });

  it('si query rechaza (Safari con "camera") → "unknown"', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query: vi.fn(async () => Promise.reject(new TypeError('camera'))) },
    });
    await expect(Karada.checkPermission()).resolves.toBe('unknown');
  });

  it('sin navigator en absoluto → "unknown"', async () => {
    vi.stubGlobal('navigator', undefined);
    await expect(Karada.checkPermission()).resolves.toBe('unknown');
  });

  it('NUNCA llama getUserMedia (no dispara el prompt)', async () => {
    stubPermissions('prompt');
    await Karada.checkPermission();

    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await Karada.checkPermission(); // rama "unknown" sin permissions

    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
