/**
 * Demo pulido de Karada (Fase 1.C, D35).
 *
 * Autostart: al cargar la página se llama `start()`. Dibuja sobre canvas el
 * subset de cara (33), el cuerpo (16) y cada mano (21) con puntos + líneas.
 *
 * Nota de arquitectura (Conflicto B del prompt, aprobado por Diego): Karada crea
 * su propio `<video>` interno; el demo lo obtiene con `getVideoElement()` tras
 * `ready` y lo inserta en el `.stage`. No se lee un `<video>` estático del DOM.
 *
 * Se importa desde el código fuente (`../src/index`), no desde el paquete
 * publicado: es desarrollo local servido por Vite.
 */

import { Karada, KaradaError } from '../src/index';
import type {
  BodyLandmarks,
  FaceLandmarks,
  HandLandmarks,
  Point,
  Skeleton,
} from '../src/index';

// --- Referencias al DOM ----------------------------------------------------

const stage = document.querySelector<HTMLDivElement>('.stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
const overlay = document.querySelector<HTMLDivElement>('.overlay')!;
const stopBtn = document.querySelector<HTMLButtonElement>('.btn-stop')!;
const ctx = canvas.getContext('2d')!;

// --- Estilo de dibujo ------------------------------------------------------

const LINE_COLOR = '#22d3ee';
const POINT_COLOR = '#f472b6';
const LINE_WIDTH = 2;
const POINT_RADIUS = 3;

// --- Constantes de conexión (§4.4.4) --------------------------------------

/** Nombres de punto de la cara (todos menos el array crudo `raw`). */
type FacePointKey = Exclude<keyof FaceLandmarks, 'raw'>;

const FACE_POINT_KEYS: FacePointKey[] = [
  'noseTip', 'noseBridge', 'noseBottom',
  'leftEyeInner', 'leftEyeOuter', 'leftEyeTop', 'leftEyeBottom',
  'rightEyeInner', 'rightEyeOuter', 'rightEyeTop', 'rightEyeBottom',
  'leftEyebrowInner', 'leftEyebrowOuter', 'rightEyebrowInner', 'rightEyebrowOuter',
  'mouthLeft', 'mouthRight', 'upperLipTop', 'upperLipBottom', 'lowerLipTop', 'lowerLipBottom',
  'chin', 'leftJaw', 'rightJaw', 'foreheadCenter', 'leftCheek', 'rightCheek',
  'leftTemple', 'rightTemple', 'leftEar', 'rightEar', 'leftIris', 'rightIris',
];

// `leftCheek`, `rightCheek`, `leftIris`, `rightIris` quedan como puntos sueltos
// (aparecen en FACE_POINT_KEYS pero no en ninguna conexión).
const FACE_CONNECTIONS: [FacePointKey, FacePointKey][] = [
  // Cejas
  ['leftEyebrowInner', 'leftEyebrowOuter'],
  ['rightEyebrowInner', 'rightEyebrowOuter'],
  // Ojo izquierdo (anillo)
  ['leftEyeInner', 'leftEyeTop'], ['leftEyeTop', 'leftEyeOuter'],
  ['leftEyeOuter', 'leftEyeBottom'], ['leftEyeBottom', 'leftEyeInner'],
  // Ojo derecho (anillo)
  ['rightEyeInner', 'rightEyeTop'], ['rightEyeTop', 'rightEyeOuter'],
  ['rightEyeOuter', 'rightEyeBottom'], ['rightEyeBottom', 'rightEyeInner'],
  // Nariz
  ['noseBridge', 'noseTip'], ['noseTip', 'noseBottom'],
  // Boca (contorno)
  ['mouthLeft', 'upperLipTop'], ['upperLipTop', 'mouthRight'],
  ['mouthRight', 'lowerLipBottom'], ['lowerLipBottom', 'mouthLeft'],
  // Boca (interior)
  ['upperLipBottom', 'lowerLipTop'],
  // Mandíbula
  ['leftEar', 'leftTemple'], ['leftTemple', 'leftJaw'], ['leftJaw', 'chin'],
  ['chin', 'rightJaw'], ['rightJaw', 'rightTemple'], ['rightTemple', 'rightEar'],
  // Frente
  ['leftTemple', 'foreheadCenter'], ['foreheadCenter', 'rightTemple'],
];

type BodyPointKey = keyof BodyLandmarks;

const BODY_POINT_KEYS: BodyPointKey[] = [
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
  'leftHeel', 'rightHeel', 'leftFootIndex', 'rightFootIndex',
];

const BODY_CONNECTIONS: [BodyPointKey, BodyPointKey][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['leftAnkle', 'leftHeel'],
  ['leftHeel', 'leftFootIndex'], ['leftFootIndex', 'leftAnkle'],
  ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'], ['rightAnkle', 'rightHeel'],
  ['rightHeel', 'rightFootIndex'], ['rightFootIndex', 'rightAnkle'],
];

/** Índices canónicos 0–20 de MediaPipe Hand. */
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8], // índice
  [5, 9], [9, 10], [10, 11], [11, 12], // medio
  [9, 13], [13, 14], [14, 15], [15, 16], // anular
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // meñique + palma
];

/**
 * Traduce el índice canónico de MediaPipe Hand (0–20) al `Point` correspondiente
 * dentro de la estructura semántica `HandLandmarks`. `switch` explícito, sin
 * `any`: si el índice está fuera de rango, retorna `null` (no dibuja).
 */
function handIndexToPoint(hand: HandLandmarks, i: number): Point | null {
  switch (i) {
    case 0: return hand.wrist;
    case 1: return hand.thumb.cmc;
    case 2: return hand.thumb.mcp;
    case 3: return hand.thumb.ip;
    case 4: return hand.thumb.tip;
    case 5: return hand.index.mcp;
    case 6: return hand.index.pip;
    case 7: return hand.index.dip;
    case 8: return hand.index.tip;
    case 9: return hand.middle.mcp;
    case 10: return hand.middle.pip;
    case 11: return hand.middle.dip;
    case 12: return hand.middle.tip;
    case 13: return hand.ring.mcp;
    case 14: return hand.ring.pip;
    case 15: return hand.ring.dip;
    case 16: return hand.ring.tip;
    case 17: return hand.pinky.mcp;
    case 18: return hand.pinky.pip;
    case 19: return hand.pinky.dip;
    case 20: return hand.pinky.tip;
    default: return null;
  }
}

// --- Primitivas de dibujo --------------------------------------------------

function line(a: Point, b: Point): void {
  ctx.beginPath();
  ctx.moveTo(a.pixel.x, a.pixel.y);
  ctx.lineTo(b.pixel.x, b.pixel.y);
  ctx.stroke();
}

function dot(p: Point): void {
  ctx.beginPath();
  ctx.arc(p.pixel.x, p.pixel.y, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function drawHand(hand: HandLandmarks | null): void {
  if (hand === null) return;

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = handIndexToPoint(hand, a);
    const pb = handIndexToPoint(hand, b);
    if (pa !== null && pb !== null) line(pa, pb);
  }

  ctx.fillStyle = POINT_COLOR;
  for (let i = 0; i <= 20; i++) {
    const p = handIndexToPoint(hand, i);
    if (p !== null) dot(p);
  }
}

function draw(skeleton: Skeleton): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Líneas (cyan) primero, para que los puntos (pink) queden encima.
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  for (const [a, b] of FACE_CONNECTIONS) line(skeleton.face[a], skeleton.face[b]);
  for (const [a, b] of BODY_CONNECTIONS) line(skeleton.body[a], skeleton.body[b]);

  // Puntos (pink).
  ctx.fillStyle = POINT_COLOR;
  for (const k of FACE_POINT_KEYS) dot(skeleton.face[k]);
  for (const k of BODY_POINT_KEYS) dot(skeleton.body[k]);

  // Manos (líneas + puntos, cada una gestiona sus propios estilos).
  drawHand(skeleton.leftHand);
  drawHand(skeleton.rightHand);
}

// --- Ciclo de vida de Karada ----------------------------------------------

const karada = new Karada({
  track: { face: true, body: true, hands: true },
  quality: 'balanced',
  camera: 'user',
  mirror: true,
});

karada.on('ready', () => {
  // Inserta el video interno de Karada en el stage y ajusta el canvas al
  // tamaño real del video (coordenadas `pixel` mapean 1:1 al canvas).
  const video = karada.getVideoElement();
  stage.prepend(video);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  overlay.dataset.state = 'running';
});

karada.on('frame', (skeleton) => {
  draw(skeleton);
});

karada.on('error', (err: KaradaError) => {
  if (err.type === 'permission-denied') {
    overlay.dataset.state = 'permission';
    overlay.textContent = 'Permite el acceso a la cámara para continuar.';
  } else {
    overlay.dataset.state = 'error';
    overlay.textContent = `Error: ${err.message}`;
  }
});

stopBtn.addEventListener('click', () => {
  karada.stop();
  stopBtn.disabled = true;
});

// Autostart. El rechazo ya lo maneja el listener 'error'; el catch evita el
// "unhandled rejection" en consola.
karada.start().catch(() => {
  /* manejado por karada.on('error', …) */
});
