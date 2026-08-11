/**
 * Adaptador de MediaPipe Tasks Vision (D24). Hace dos cosas:
 *
 *  1. `loadLandmarkers`: carga por COMPOSICIÓN los tres landmarkers
 *     (Face + Pose + Hand). Se descartó `HolisticLandmarker` unificado porque
 *     entrega solo 468 puntos de cara (sin iris), incompatible con D16.
 *  2. `detectFrame`: corre la detección de un frame y traduce los resultados
 *     crudos al `RawFrame` que consume el núcleo agnóstico, aplicando el
 *     espejo (D9) y una confianza por punto.
 *
 * Capa de adaptadores: puede depender de MediaPipe y del DOM. El núcleo no.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type Category,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';

import type { KaradaQuality, Point } from '../../core/types';
import type { RawFrame } from '../../core/skeleton';

/**
 * Versión de `@mediapipe/tasks-vision`. DEBE seguir a la dependencia declarada
 * en package.json: si actualizas el paquete, actualiza también esta constante
 * (los binarios wasm se sirven por CDN con esta versión en la URL).
 */
const TASKS_VISION_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

const MODEL_BASE = 'https://storage.googleapis.com/mediapipe-models';
const FACE_MODEL = `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;
const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const POSE_MODEL: Record<KaradaQuality, string> = {
  // `quality` mapea a variantes distintas de pose (imposible con el unificado, D24).
  fast: `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  balanced: `${MODEL_BASE}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  accurate: `${MODEL_BASE}/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
};

export interface Landmarkers {
  face: FaceLandmarker | null;
  pose: PoseLandmarker | null;
  hand: HandLandmarker | null;
  close(): void;
}

export interface LoadConfig {
  face: boolean;
  body: boolean;
  hands: boolean;
  quality: KaradaQuality;
}

/**
 * Carga los landmarkers pedidos. El `FilesetResolver` (wasm) se resuelve una
 * sola vez y se reutiliza para los tres. Un módulo apagado queda `null`.
 */
export async function loadLandmarkers(config: LoadConfig): Promise<Landmarkers> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

  const [face, pose, hand] = await Promise.all([
    config.face
      ? FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          // face_landmarker.task trae el refinamiento de iris por defecto →
          // faceLandmarks[0].length === 478 (D16). Verificado en el smoke test.
        })
      : Promise.resolve(null),
    config.body
      ? PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL[config.quality] },
          runningMode: 'VIDEO',
          numPoses: 1,
          outputSegmentationMasks: false,
        })
      : Promise.resolve(null),
    config.hands
      ? HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: HAND_MODEL },
          runningMode: 'VIDEO',
          numHands: 2,
        })
      : Promise.resolve(null),
  ]);

  return {
    face,
    pose,
    hand,
    close(): void {
      face?.close();
      pose?.close();
      hand?.close();
    },
  };
}

export interface DetectConfig {
  video: HTMLVideoElement;
  /** Timestamp monotónico en microsegundos (ver loop.ts + D25). */
  timestampMicros: number;
  /** Si true, se voltea x → 1 - x antes de entregar al núcleo (D9). */
  mirror: boolean;
}

/**
 * Corre los tres landmarkers sobre el mismo frame/timestamp (sincronía
 * garantizada, D25) y arma el `RawFrame` para el núcleo.
 */
export function detectFrame(landmarkers: Landmarkers, config: DetectConfig): RawFrame {
  const { video, timestampMicros, mirror } = config;
  const w = video.videoWidth;
  const h = video.videoHeight;

  const face = landmarkers.face
    ? faceToPoints(landmarkers.face.detectForVideo(video, timestampMicros), w, h, mirror)
    : [];
  const pose = landmarkers.pose
    ? poseToPoints(landmarkers.pose.detectForVideo(video, timestampMicros), w, h, mirror)
    : [];

  let leftHand: Point[] | null = null;
  let rightHand: Point[] | null = null;
  if (landmarkers.hand) {
    const hands = handsToPoints(landmarkers.hand.detectForVideo(video, timestampMicros), w, h, mirror);
    leftHand = hands.leftHand;
    rightHand = hands.rightHand;
  }

  return { timestamp: timestampMicros, face, pose, leftHand, rightHand };
}

// ---------------------------------------------------------------------------
// Conversión NormalizedLandmark → Point
// ---------------------------------------------------------------------------

/**
 * MediaPipe determina la lateralidad asumiendo imagen ESPEJADA (selfie). Como
 * pasamos el frame CRUDO a `detectForVideo`, la etiqueta viene invertida
 * respecto al lado anatómico real del sujeto (D19). Con SWAP=true, la etiqueta
 * 'Left' del modelo se interpreta como la mano DERECHA del sujeto y viceversa.
 *
 * ⚠️ Decisión tomada sobre la marcha (sin cámara para verificar aquí). Si en el
 * smoke test en vivo las manos salen intercambiadas, poner SWAP en `false`.
 */
const SWAP_HANDEDNESS = true;

function toPoint(lm: NormalizedLandmark, confidence: number, w: number, h: number, mirror: boolean): Point {
  const x = mirror ? 1 - lm.x : lm.x;
  return {
    normalized: { x, y: lm.y, z: lm.z },
    // pixel.x se deriva del x ya espejado → w - x_original*w, coherente con D9.
    pixel: { x: x * w, y: lm.y * h, z: lm.z * w },
    confidence,
  };
}

function faceToPoints(result: FaceLandmarkerResult, w: number, h: number, mirror: boolean): Point[] {
  const face = result.faceLandmarks[0];
  if (face === undefined) return [];
  // La cara no trae confianza por punto; si se detectó, es 1.
  return face.map((lm) => toPoint(lm, 1, w, h, mirror));
}

function poseToPoints(result: PoseLandmarkerResult, w: number, h: number, mirror: boolean): Point[] {
  const pose = result.landmarks[0];
  if (pose === undefined) return [];
  // Pose sí expone `visibility` (0-1): la usamos como confianza real.
  return pose.map((lm) => toPoint(lm, lm.visibility, w, h, mirror));
}

function handsToPoints(
  result: HandLandmarkerResult,
  w: number,
  h: number,
  mirror: boolean,
): { leftHand: Point[] | null; rightHand: Point[] | null } {
  let leftHand: Point[] | null = null;
  let rightHand: Point[] | null = null;

  result.landmarks.forEach((lms, i) => {
    const category = result.handedness[i]?.[0];
    if (category === undefined) return;
    // Las manos no traen confianza por punto: usamos el score de handedness
    // para todos los 21 puntos (alimenta la puerta de D8 en el núcleo).
    const points = lms.map((lm) => toPoint(lm, category.score, w, h, mirror));
    if (resolveSubjectSide(category) === 'left') leftHand = points;
    else rightHand = points;
  });

  return { leftHand, rightHand };
}

function resolveSubjectSide(category: Category): 'left' | 'right' {
  const labelIsLeft = (category.categoryName ?? '').toLowerCase().startsWith('l');
  const subjectIsLeft = SWAP_HANDEDNESS ? !labelIsLeft : labelIsLeft;
  return subjectIsLeft ? 'left' : 'right';
}
