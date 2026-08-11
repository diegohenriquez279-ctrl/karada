/**
 * Mapeo entre los índices numéricos que producen los modelos de MediaPipe y
 * los nombres semánticos que Karada expone (decisiones D4 y D5).
 *
 * IMPORTANTE: este archivo es agnóstico. NO importa MediaPipe; solo conoce
 * *qué número de fila* corresponde a cada parte del cuerpo. El adaptador de
 * cada plataforma (Fase 1.B en adelante) es quien produce los `Point[]` crudos
 * en el orden que estos índices esperan.
 *
 * Convención de lados: `left`/`right` = lado ANATÓMICO del sujeto (su propia
 * izquierda/derecha), no el lado de la imagen. En la malla de MediaPipe el
 * lado izquierdo del sujeto cae en los índices altos.
 */

// ---------------------------------------------------------------------------
// Cara — 32 puntos nombrados sobre la malla de 468/478 (D4, aprobado por Diego)
// ---------------------------------------------------------------------------

export const FACE_LANDMARK_INDICES = {
  // Nariz
  noseTip: 1,
  noseBridge: 168,
  noseBottom: 2,

  // Ojo derecho (del sujeto)
  rightEyeInner: 133,
  rightEyeOuter: 33,
  rightEyeTop: 159,
  rightEyeBottom: 145,

  // Ojo izquierdo (del sujeto)
  leftEyeInner: 362,
  leftEyeOuter: 263,
  leftEyeTop: 386,
  leftEyeBottom: 374,

  // Cejas
  rightEyebrowInner: 55,
  rightEyebrowOuter: 46,
  leftEyebrowInner: 285,
  leftEyebrowOuter: 276,

  // Boca
  mouthLeft: 291,
  mouthRight: 61,
  upperLipTop: 0,
  upperLipBottom: 13,
  lowerLipTop: 14,
  lowerLipBottom: 17,

  // Contorno
  chin: 152,
  foreheadCenter: 10,
  leftJaw: 397,
  rightJaw: 172,
  leftCheek: 425,
  rightCheek: 205,
  leftTemple: 284,

  // Orejas (borde facial más cercano; la malla no cubre orejas reales)
  leftEar: 454,
  rightEar: 234,

  // Iris (requieren refinamiento de MediaPipe → malla de 478 puntos, D16)
  leftIris: 473,
  rightIris: 468,
} as const;

// ---------------------------------------------------------------------------
// Cuerpo — 12 articulaciones mayores sobre MediaPipe Pose (33 puntos)
// Índices canónicos y documentados por MediaPipe.
// ---------------------------------------------------------------------------

export const POSE_LANDMARK_INDICES = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

// ---------------------------------------------------------------------------
// Manos — 21 puntos de MediaPipe Hands, agrupados por dedo.
// Índices canónicos: 0 muñeca; luego pulgar…meñique de 4 en 4.
// ---------------------------------------------------------------------------

export const HAND_LANDMARK_INDICES = {
  wrist: 0,
  thumb: { cmc: 1, mcp: 2, ip: 3, tip: 4 },
  index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
} as const;

// ---------------------------------------------------------------------------
// Constructores puros
// ---------------------------------------------------------------------------

import type { FaceLandmarks, Point } from './types';

/**
 * Lee un punto por índice y falla claro si no existe. `noUncheckedIndexedAccess`
 * nos obliga a tratar el caso `undefined`, lo cual es bueno: un índice ausente
 * significa un frame malformado (p. ej. iris sin refinamiento activo).
 */
export function pointAt(raw: Point[], index: number, name: string): Point {
  const point = raw[index];
  if (point === undefined) {
    throw new Error(
      `Karada: falta el landmark "${name}" (índice ${index}). ` +
        `El frame tiene ${raw.length} puntos; ¿está activo el refinamiento de iris?`,
    );
  }
  return point;
}

/**
 * Construye el subset nombrado de la cara a partir de la malla cruda.
 * Función pura: mismos puntos de entrada → misma salida, sin efectos.
 *
 * El array `raw` completo se conserva intacto: nada se oculta.
 */
export function buildFaceLandmarks(rawPoints: Point[]): FaceLandmarks {
  const named = {} as { -readonly [K in keyof typeof FACE_LANDMARK_INDICES]: Point };

  for (const [name, index] of Object.entries(FACE_LANDMARK_INDICES)) {
    named[name as keyof typeof FACE_LANDMARK_INDICES] = pointAt(rawPoints, index, name);
  }

  return { ...named, raw: rawPoints };
}
