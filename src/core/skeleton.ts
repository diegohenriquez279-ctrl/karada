/**
 * Ensamblado del esqueleto unificado a partir de los puntos crudos.
 *
 * Núcleo agnóstico: recibe arrays de `Point` ya normalizados por el adaptador
 * (Fase 1.B) y devuelve el `Skeleton` con la forma pública. No sabe nada de
 * MediaPipe, cámaras ni DOM; solo reorganiza y filtra puntos.
 */

import type { BodyLandmarks, HandLandmarks, Point, Skeleton } from './types';
import {
  HAND_LANDMARK_INDICES,
  POSE_LANDMARK_INDICES,
  buildFaceLandmarks,
  pointAt,
} from './landmarks';

/**
 * Umbral de confianza para manos (D8). Si la confianza promedio de los 21
 * puntos de una mano es menor a esto, la mano se reporta como `null`.
 * Constante interna, no expuesta en la API pública (ajustable en Fase 2).
 */
const HAND_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Entrada cruda de un frame. Es el "contrato" entre el adaptador de plataforma
 * y el núcleo: el adaptador entrega arrays de `Point` en el orden que los
 * índices de `landmarks.ts` esperan. Una mano ausente llega como `null`.
 */
export interface RawFrame {
  timestamp: number;
  face: Point[];
  pose: Point[];
  leftHand: Point[] | null;
  rightHand: Point[] | null;
}

/** Promedio de confianza de un conjunto de puntos. Vacío → 0. */
function averageConfidence(points: Point[]): number {
  if (points.length === 0) return 0;
  let sum = 0;
  for (const point of points) sum += point.confidence;
  return sum / points.length;
}

/** Construye el subset nombrado de cuerpo + el array `raw` con los 33 puntos. */
export function buildBodyLandmarks(rawPose: Point[]): BodyLandmarks {
  const named = {} as { -readonly [K in keyof typeof POSE_LANDMARK_INDICES]: Point };

  for (const [name, index] of Object.entries(POSE_LANDMARK_INDICES)) {
    named[name as keyof typeof POSE_LANDMARK_INDICES] = pointAt(rawPose, index, name);
  }

  return { ...named, raw: rawPose };
}

/** Construye la estructura de una mano (21 puntos agrupados por dedo). */
export function buildHandLandmarks(rawHand: Point[]): HandLandmarks {
  const i = HAND_LANDMARK_INDICES;
  return {
    wrist: pointAt(rawHand, i.wrist, 'wrist'),
    thumb: {
      cmc: pointAt(rawHand, i.thumb.cmc, 'thumb.cmc'),
      mcp: pointAt(rawHand, i.thumb.mcp, 'thumb.mcp'),
      ip: pointAt(rawHand, i.thumb.ip, 'thumb.ip'),
      tip: pointAt(rawHand, i.thumb.tip, 'thumb.tip'),
    },
    index: {
      mcp: pointAt(rawHand, i.index.mcp, 'index.mcp'),
      pip: pointAt(rawHand, i.index.pip, 'index.pip'),
      dip: pointAt(rawHand, i.index.dip, 'index.dip'),
      tip: pointAt(rawHand, i.index.tip, 'index.tip'),
    },
    middle: {
      mcp: pointAt(rawHand, i.middle.mcp, 'middle.mcp'),
      pip: pointAt(rawHand, i.middle.pip, 'middle.pip'),
      dip: pointAt(rawHand, i.middle.dip, 'middle.dip'),
      tip: pointAt(rawHand, i.middle.tip, 'middle.tip'),
    },
    ring: {
      mcp: pointAt(rawHand, i.ring.mcp, 'ring.mcp'),
      pip: pointAt(rawHand, i.ring.pip, 'ring.pip'),
      dip: pointAt(rawHand, i.ring.dip, 'ring.dip'),
      tip: pointAt(rawHand, i.ring.tip, 'ring.tip'),
    },
    pinky: {
      mcp: pointAt(rawHand, i.pinky.mcp, 'pinky.mcp'),
      pip: pointAt(rawHand, i.pinky.pip, 'pinky.pip'),
      dip: pointAt(rawHand, i.pinky.dip, 'pinky.dip'),
      tip: pointAt(rawHand, i.pinky.tip, 'pinky.tip'),
    },
  };
}

/**
 * Aplica la puerta de confianza a una mano: `null` si no hay puntos o si la
 * confianza promedio queda por debajo del umbral (D8).
 */
function resolveHand(rawHand: Point[] | null): HandLandmarks | null {
  if (rawHand === null || rawHand.length === 0) return null;
  if (averageConfidence(rawHand) < HAND_CONFIDENCE_THRESHOLD) return null;
  return buildHandLandmarks(rawHand);
}

/**
 * Ensambla el esqueleto completo de un frame.
 *
 * Devuelve `null` cuando no hay persona (sin cara ni cuerpo). Los tipos exigen
 * `face` y `body` siempre presentes; en vez de inventar puntos vacíos, la
 * ausencia de persona se representa con el `Skeleton` completo ausente. Esto
 * alimenta el futuro evento `personLost` (Fase 2).
 */
export function buildSkeleton(input: RawFrame): Skeleton | null {
  if (input.face.length === 0 || input.pose.length === 0) return null;

  return {
    timestamp: input.timestamp,
    face: buildFaceLandmarks(input.face),
    body: buildBodyLandmarks(input.pose),
    leftHand: resolveHand(input.leftHand),
    rightHand: resolveHand(input.rightHand),
  };
}
