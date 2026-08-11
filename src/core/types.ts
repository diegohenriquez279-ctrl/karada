/**
 * Tipos del núcleo agnóstico de Karada.
 *
 * Este archivo NO depende de MediaPipe, DOM ni APIs de navegador.
 * Describe el "contrato" de datos que Karada entrega al desarrollador,
 * independientemente de qué modelo o plataforma los produjo.
 */

// ---------------------------------------------------------------------------
// Punto base
// ---------------------------------------------------------------------------

/**
 * Un landmark individual del cuerpo.
 *
 * Cada punto se entrega en dos sistemas de coordenadas para máxima comodidad:
 * - `normalized`: rango 0–1 relativo al frame (independiente de resolución).
 * - `pixel`: píxeles reales del frame (listo para dibujar en un canvas).
 *
 * `confidence` (0–1) refleja qué tan seguro está el modelo de este punto.
 */
export interface Point {
  normalized: { x: number; y: number; z: number };
  pixel: { x: number; y: number; z: number };
  confidence: number;
}

// ---------------------------------------------------------------------------
// Cara
// ---------------------------------------------------------------------------

/**
 * Subset de 33 landmarks de cara nombrados semánticamente (decisión D4 + D19).
 *
 * Filosofía: los nombres son para el uso diario; el array `raw` da acceso
 * total a la malla completa para casos avanzados. Nada se oculta.
 *
 * Convención de lados: `left`/`right` se refieren al lado ANATÓMICO del sujeto
 * (su propia izquierda/derecha), no al lado de la imagen. El flag `mirror`
 * (D9) solo voltea las coordenadas, nunca renombra los puntos.
 */
export interface FaceLandmarks {
  // Nariz (3)
  noseTip: Point;
  noseBridge: Point;
  noseBottom: Point;

  // Ojos (8)
  leftEyeInner: Point;
  leftEyeOuter: Point;
  leftEyeTop: Point;
  leftEyeBottom: Point;
  rightEyeInner: Point;
  rightEyeOuter: Point;
  rightEyeTop: Point;
  rightEyeBottom: Point;

  // Cejas (4)
  leftEyebrowInner: Point;
  leftEyebrowOuter: Point;
  rightEyebrowInner: Point;
  rightEyebrowOuter: Point;

  // Boca (6)
  mouthLeft: Point;
  mouthRight: Point;
  upperLipTop: Point;
  upperLipBottom: Point;
  lowerLipTop: Point;
  lowerLipBottom: Point;

  // Contorno (8)
  chin: Point;
  leftJaw: Point;
  rightJaw: Point;
  foreheadCenter: Point;
  leftCheek: Point;
  rightCheek: Point;
  leftTemple: Point;
  rightTemple: Point;

  // Orejas (2)
  leftEar: Point;
  rightEar: Point;

  // Extras (2) — útiles para eye-tracking futuro. Requieren refinamiento de
  // iris de MediaPipe (viven en los índices 468/473, ver D16).
  leftIris: Point;
  rightIris: Point;

  /**
   * Malla completa que devuelve MediaPipe Face Mesh.
   *
   * Con refinamiento de iris activo (D16) la longitud es 478
   * (468 base + 10 de iris). Diego necesita acceso a estos puntos
   * para proyectos futuros: este array debe estar SIEMPRE disponible.
   */
  raw: Point[];
}

// ---------------------------------------------------------------------------
// Cuerpo
// ---------------------------------------------------------------------------

/**
 * Landmarks de cuerpo (pose): 16 puntos nombrados semánticamente (D17).
 *
 * Nota de diseño: a diferencia de la cara, `BodyLandmarks` NO expone un array
 * `raw`. De los 33 puntos de MediaPipe Pose, 21 son duplicados de cara y manos
 * (ya expuestos con más detalle en sus regiones). Los 4 únicos puntos que no
 * están en cara ni manos —talones y puntas de pie— se nombran directamente.
 */
export interface BodyLandmarks {
  leftShoulder: Point;
  rightShoulder: Point;
  leftElbow: Point;
  rightElbow: Point;
  leftWrist: Point;
  rightWrist: Point;
  leftHip: Point;
  rightHip: Point;
  leftKnee: Point;
  rightKnee: Point;
  leftAnkle: Point;
  rightAnkle: Point;
  leftHeel: Point;
  rightHeel: Point;
  leftFootIndex: Point;
  rightFootIndex: Point;
}

// ---------------------------------------------------------------------------
// Manos
// ---------------------------------------------------------------------------

/** Los 4 puntos de un dedo con articulación proximal completa (índice…meñique). */
interface Finger {
  mcp: Point;
  pip: Point;
  dip: Point;
  tip: Point;
}

/**
 * Landmarks de una mano (21 puntos de MediaPipe Hands).
 * El pulgar tiene una anatomía distinta (cmc/mcp/ip/tip).
 */
export interface HandLandmarks {
  wrist: Point;
  thumb: { cmc: Point; mcp: Point; ip: Point; tip: Point };
  index: Finger;
  middle: Finger;
  ring: Finger;
  pinky: Finger;
}

// ---------------------------------------------------------------------------
// Esqueleto unificado
// ---------------------------------------------------------------------------

/**
 * El esqueleto completo de un frame. Cara y cuerpo siempre presentes;
 * las manos son `null` cuando no se detectan con confianza suficiente (D8).
 */
export interface Skeleton {
  timestamp: number;
  face: FaceLandmarks;
  body: BodyLandmarks;
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
}

// ---------------------------------------------------------------------------
// Opciones de configuración pública
// ---------------------------------------------------------------------------

/** Calidad: abstracción sobre configuraciones internas de MediaPipe. */
export type KaradaQuality = 'fast' | 'balanced' | 'accurate';

/** Cámara: frontal, trasera, o un `deviceId` específico. */
export type KaradaCamera = 'user' | 'environment' | (string & {});

export interface KaradaOptions {
  track?: {
    face?: boolean;
    body?: boolean;
    hands?: boolean;
  };
  quality?: KaradaQuality;
  camera?: KaradaCamera;
  mirror?: boolean;
  maxFPS?: number;
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/** Categorías de error esperadas por Karada (brief §10). */
export type KaradaErrorType =
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'model-load-failed'
  | 'not-supported';

/** Forma del error entregado en el evento `error`. */
export interface KaradaError {
  type: KaradaErrorType;
  message: string;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

/** Lado de una mano, usado por `handAppeared` / `handLost`. */
export type HandSide = 'left' | 'right';

/**
 * Mapa de eventos de Karada: nombre del evento → tipo de su payload.
 * `void` significa que el evento no lleva datos.
 *
 * Este mapa alimenta el `TypedEventEmitter` para dar autocompletado y
 * verificación de tipos por nombre de evento.
 */
export type KaradaEvents = {
  ready: void;
  // `frame` se emite SOLO cuando hay Skeleton real; nunca con null (D21).
  // El estado "sin persona" lo cubren personDetected/personLost (Fase 2).
  frame: Skeleton;
  error: KaradaError;
  personDetected: void;
  personLost: void;
  handAppeared: HandSide;
  handLost: HandSide;
}
