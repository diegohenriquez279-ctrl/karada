import { describe, expect, it } from 'vitest';

import { buildSkeleton, type RawFrame } from '../../src/core/skeleton';
import { FACE_LANDMARK_INDICES, POSE_LANDMARK_INDICES, HAND_LANDMARK_INDICES } from '../../src/core/landmarks';

import validFrame from '../fixtures/valid-frame.json';
import lowConfidenceLeftHand from '../fixtures/low-confidence-left-hand.json';
import noPerson from '../fixtures/no-person.json';

// En los fixtures, cada punto codifica su índice en `normalized.x`. Eso permite
// verificar que un nombre semántico apunta a la fila correcta del array crudo.

describe('buildSkeleton', () => {
  it('construye un esqueleto completo con puntos válidos', () => {
    const skeleton = buildSkeleton(validFrame as RawFrame);

    expect(skeleton).not.toBeNull();
    expect(skeleton?.timestamp).toBe(1000);
    expect(skeleton?.face).toBeDefined();
    expect(skeleton?.body).toBeDefined();
    expect(skeleton?.leftHand).not.toBeNull();
    expect(skeleton?.rightHand).not.toBeNull();
  });

  it('conserva la malla cruda completa de la cara (478 con iris)', () => {
    const skeleton = buildSkeleton(validFrame as RawFrame);
    expect(skeleton?.face.raw).toHaveLength(478);
    expect(skeleton?.body.raw).toHaveLength(33);
  });

  it('devuelve null en una mano cuya confianza promedio es baja (D8)', () => {
    const skeleton = buildSkeleton(lowConfidenceLeftHand as RawFrame);

    expect(skeleton).not.toBeNull();
    expect(skeleton?.leftHand).toBeNull();
    expect(skeleton?.rightHand).not.toBeNull();
  });

  it('devuelve null cuando no hay persona', () => {
    const skeleton = buildSkeleton(noPerson as RawFrame);
    expect(skeleton).toBeNull();
  });

  describe('los índices semánticos apuntan al punto correcto del array crudo', () => {
    const skeleton = buildSkeleton(validFrame as RawFrame);

    it('cara: cada nombre referencia la fila esperada', () => {
      const face = skeleton!.face;
      // Igualdad por referencia: el punto nombrado ES el mismo objeto del raw.
      expect(face.noseTip).toBe(face.raw[FACE_LANDMARK_INDICES.noseTip]);
      expect(face.leftIris).toBe(face.raw[FACE_LANDMARK_INDICES.leftIris]);
      // Y su índice codificado coincide.
      expect(face.noseTip.normalized.x).toBe(FACE_LANDMARK_INDICES.noseTip);
      expect(face.chin.normalized.x).toBe(FACE_LANDMARK_INDICES.chin);
      expect(face.rightIris.normalized.x).toBe(FACE_LANDMARK_INDICES.rightIris);
    });

    it('cuerpo: cada articulación referencia la fila esperada', () => {
      const body = skeleton!.body;
      expect(body.leftShoulder.normalized.x).toBe(POSE_LANDMARK_INDICES.leftShoulder);
      expect(body.rightAnkle.normalized.x).toBe(POSE_LANDMARK_INDICES.rightAnkle);
      expect(body.leftShoulder).toBe(body.raw[POSE_LANDMARK_INDICES.leftShoulder]);
    });

    it('mano: la estructura por dedo referencia la fila esperada', () => {
      const hand = skeleton!.rightHand!;
      expect(hand.wrist.normalized.x).toBe(HAND_LANDMARK_INDICES.wrist);
      expect(hand.thumb.tip.normalized.x).toBe(HAND_LANDMARK_INDICES.thumb.tip);
      expect(hand.pinky.tip.normalized.x).toBe(HAND_LANDMARK_INDICES.pinky.tip);
    });
  });
});
