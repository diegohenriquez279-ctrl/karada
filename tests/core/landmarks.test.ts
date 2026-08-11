import { describe, expect, it } from 'vitest';

import { FACE_LANDMARK_INDICES } from '../../src/core/landmarks';

// Los 32 nombres exactos aprobados en D4.
const EXPECTED_FACE_NAMES = [
  'noseTip', 'noseBridge', 'noseBottom',
  'leftEyeInner', 'leftEyeOuter', 'leftEyeTop', 'leftEyeBottom',
  'rightEyeInner', 'rightEyeOuter', 'rightEyeTop', 'rightEyeBottom',
  'leftEyebrowInner', 'leftEyebrowOuter', 'rightEyebrowInner', 'rightEyebrowOuter',
  'mouthLeft', 'mouthRight', 'upperLipTop', 'upperLipBottom', 'lowerLipTop', 'lowerLipBottom',
  'chin', 'leftJaw', 'rightJaw', 'foreheadCenter', 'leftCheek', 'rightCheek', 'leftTemple',
  'leftEar', 'rightEar',
  'leftIris', 'rightIris',
] as const;

const IRIS_NAMES = ['leftIris', 'rightIris'] as const;

describe('FACE_LANDMARK_INDICES', () => {
  const entries = Object.entries(FACE_LANDMARK_INDICES);
  const names = Object.keys(FACE_LANDMARK_INDICES);
  const indices = Object.values(FACE_LANDMARK_INDICES);

  it('tiene exactamente 32 nombres', () => {
    expect(names).toHaveLength(32);
  });

  it('contiene exactamente los nombres de D4 (sin faltantes ni extras)', () => {
    expect(new Set(names)).toEqual(new Set(EXPECTED_FACE_NAMES));
  });

  it('los índices no-iris caen dentro de la malla base [0, 467]', () => {
    for (const [name, index] of entries) {
      if ((IRIS_NAMES as readonly string[]).includes(name)) continue;
      expect(index, name).toBeGreaterThanOrEqual(0);
      expect(index, name).toBeLessThanOrEqual(467);
    }
  });

  it('los iris viven en los índices de refinamiento (468/473, D16)', () => {
    expect(FACE_LANDMARK_INDICES.rightIris).toBe(468);
    expect(FACE_LANDMARK_INDICES.leftIris).toBe(473);
    // Todo índice cae dentro de la malla refinada de 478 puntos.
    for (const index of indices) {
      expect(index).toBeLessThanOrEqual(477);
    }
  });

  it('no tiene índices duplicados', () => {
    expect(new Set(indices).size).toBe(indices.length);
  });
});
