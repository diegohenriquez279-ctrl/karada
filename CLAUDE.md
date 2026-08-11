# Karada — Brief técnico del proyecto

*Documento maestro. Vive en dos lugares: en el conocimiento del Proyecto de Claude y como `CLAUDE.md` en la raíz del repositorio.*

---

## 1. Contexto y filosofía de trabajo

**Autor:** Diego (estudiante de Técnico en Ingeniería en Ciencias de Datos, UDB, El Salvador).

**Nivel del autor:** Diego se está iniciando en programación pero tiene visión clara de arquitectura. Esto significa que **Claude Code debe ser proactivo**:
- Sugerir mejoras, patrones más profesionales y alternativas más limpias cuando las vea.
- **Explicar el porqué** de cada decisión técnica mientras construye, no solo ejecutar.
- Tratar el desarrollo como una colaboración de enseñanza.
- Cuando haya trade-offs importantes, presentarlos y pedir decisión antes de asumir.

**Ambición:** el proyecto está pensado para crecer mucho. Se construye por fases con núcleo sólido primero, sin miedo a escalar después.

---

## 2. Qué es Karada

Librería de **tracking corporal unificado en tiempo real** que combina cara, cuerpo (torso, brazos, piernas) y ambas manos en un solo esqueleto coherente. Pensada como motor reutilizable para apps futuras de aprendizaje interactivo: danza, gimnasio, fisioterapia, probador de ropa virtual, etc.

- **Nombre:** `karada` (japonés: 体, cuerpo).
- **Lenguaje:** TypeScript.
- **Publicación:** NPM, paquete único `karada` durante las Fases 1–3. Migración a monorepo en Fase 4.
- **Bundler:** `tsup` (genera ESM + CJS + tipos automáticamente).
- **Framework de tests:** Vitest.
- **Versionado:** SemVer estándar. Arranca en `0.1.0`. Promoción a `1.0.0` cuando esté estable y probado en apps reales.

---

## 3. Licencia y estrategia de publicación

### Licencia elegida: PolyForm Noncommercial License 1.0.0

**Modelo dual:**
- Uso **no comercial libre** (aprendizaje, hobby, académico, proyectos personales).
- Uso **comercial requiere permiso explícito del autor**, evaluado caso por caso. Puede otorgarse gratis según el proyecto.

**Razón:** proteger el trabajo de apropiación comercial no autorizada mientras se permite uso amplio en comunidad educativa y de aprendizaje.

### Aviso Apache 2.0 de MediaPipe

MediaPipe es Apache 2.0. Se debe incluir su aviso de copyright en:
- Archivo `NOTICE` en la raíz del repo.
- Sección dedicada en el README.

### Estrategia de publicación

NPM se usa como **distribución técnica**, no como canal de marketing. Diego promoverá Karada manualmente a audiencias específicas. NPM garantiza instalación de una línea (`npm install karada`) para cualquiera que Diego invite a usarla, incluido él mismo en sus propios proyectos futuros.

---

## 4. Arquitectura de 3 capas

1. **Núcleo agnóstico** (`src/core/`): lógica pura. No depende de MediaPipe, DOM ni navegador. Recibe puntos crudos y devuelve el esqueleto formateado. **Nunca debe importar MediaPipe ni APIs de plataforma.**
2. **Adaptadores por plataforma** (`src/adapters/`): traductores entre cada plataforma y el núcleo. En Fase 1 solo existe el adaptador web con MediaPipe Holistic.
3. **API pública** (`src/karada.ts`): clase `Karada` que el desarrollador instancia. Une núcleo + adaptador.

**Ventaja clave:** el día que MediaPipe desaparezca o Diego quiera un modelo propio, solo se reemplaza un adaptador. Núcleo y API pública siguen igual.

---

## 5. Estructura de carpetas

```
karada/
├── CLAUDE.md                   # Copia de este brief para Claude Code
├── LICENSE                     # PolyForm Noncommercial 1.0.0
├── NOTICE                      # Aviso Apache 2.0 de MediaPipe
├── README.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
│
├── docs/
│   ├── decisions/              # Un archivo por fase, actualizado al cerrar cada chat
│   │   ├── fase-1.md
│   │   ├── fase-2.md
│   │   └── ...
│   └── strategy/               # Opcional: se crea cuando haga falta
│
├── src/
│   ├── core/                   # Capa agnóstica
│   │   ├── types.ts
│   │   ├── skeleton.ts
│   │   ├── events.ts
│   │   └── landmarks.ts
│   │
│   ├── adapters/
│   │   └── web/
│   │       ├── mediapipe.ts
│   │       ├── camera.ts
│   │       └── index.ts
│   │
│   ├── karada.ts               # Clase pública principal
│   └── index.ts                # Entry point, exports públicos
│
├── demo/
│   ├── index.html
│   ├── main.ts
│   └── style.css
│
└── tests/
    ├── core/
    └── ...
```

---

## 6. API pública

### Uso reactivo (por defecto)

```ts
import { Karada } from 'karada';

const karada = new Karada({
  track: { face: true, body: true, hands: true },
  quality: 'balanced',
  camera: 'user',
  mirror: true,
});

karada.on('ready', () => console.log('listo'));
karada.on('frame', (skeleton) => {
  if (skeleton.rightHand) {
    dibujarMano(skeleton.rightHand);
  }
  dibujarCuerpo(skeleton.body);
});
karada.on('error', (err) => console.error(err));

await karada.start();
```

### Uso imperativo (escape para casos raros)

```ts
await karada.start();
const skeleton = karada.getFrame();
```

### Métodos de ciclo de vida

- `start()`: enciende cámara y modelos. Async.
- `stop()`: apaga todo, libera cámara y memoria.
- `pause()`: deja de emitir `frame`, mantiene todo cargado.
- `resume()`: reanuda emisión.
- `getFrame()`: devuelve el esqueleto más reciente (síncrono).

**Diferencia importante:** `stop → start` recarga todo (lento). `pause → resume` es instantáneo.

### Estáticos

- `Karada.isSupported()`: `boolean`. Verifica si el navegador soporta lo necesario.
- `Karada.checkPermission()`: async. Verifica permiso de cámara sin instanciar.

---

## 7. Configuración (opciones al instanciar)

```ts
interface KaradaOptions {
  track?: {
    face?: boolean;    // default: true
    body?: boolean;    // default: true
    hands?: boolean;   // default: true
  };
  quality?: 'fast' | 'balanced' | 'accurate';  // default: 'balanced'
  camera?: 'user' | 'environment' | string;    // default: 'user'
  mirror?: boolean;                             // default: true
  maxFPS?: number;                              // default: sin límite
}
```

- **`track`**: apaga módulos para ahorrar CPU si no se necesitan.
- **`quality`**: abstracción sobre configuraciones internas de MediaPipe.
  - `fast`: móviles gama baja
  - `balanced`: uso general
  - `accurate`: PC potente
- **`camera`**: `'user'` (frontal), `'environment'` (trasera), o `deviceId` específico.
- **`mirror`**: útil para apps tipo espejo/probador (`true`); apagar para análisis (`false`).
- **`maxFPS`**: limita frames para ahorrar batería o rendimiento en equipos débiles.

---

## 8. Formato del esqueleto

Objeto agrupado por región. Cara y cuerpo siempre presentes. Manos como objeto completo o `null`.

```ts
interface Skeleton {
  timestamp: number;
  face: FaceLandmarks;
  body: BodyLandmarks;
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
}

interface Point {
  normalized: { x: number; y: number; z: number };  // 0-1
  pixel:      { x: number; y: number; z: number };  // píxeles reales
  confidence: number;                                // 0-1
}

interface FaceLandmarks {
  // Subset nombrado semánticamente (~30 puntos útiles).
  nose: Point;
  leftEye: Point;
  rightEye: Point;
  leftEyebrow: Point;
  rightEyebrow: Point;
  mouth: Point;
  upperLip: Point;
  lowerLip: Point;
  chin: Point;
  leftEar: Point;
  rightEar: Point;
  // ... hasta ~30 puntos nombrados en Fase 1.

  // Array crudo completo con los 478 puntos que devuelve MediaPipe
  // (468 base + 10 de iris con refinamiento activo, ver D16).
  // IMPORTANTE: Diego necesita acceso a estos puntos para proyectos futuros.
  // Este array debe estar SIEMPRE disponible.
  raw: Point[];  // longitud = 478
}

interface BodyLandmarks {
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
  // ... 33 puntos totales
}

interface HandLandmarks {
  wrist: Point;
  thumb:  { cmc: Point; mcp: Point; ip: Point; tip: Point };
  index:  { mcp: Point; pip: Point; dip: Point; tip: Point };
  middle: { mcp: Point; pip: Point; dip: Point; tip: Point };
  ring:   { mcp: Point; pip: Point; dip: Point; tip: Point };
  pinky:  { mcp: Point; pip: Point; dip: Point; tip: Point };
  // 21 puntos totales por mano
}
```

**Filosofía:** el subset nombrado es para uso diario; el array crudo es para uso avanzado. Nada se oculta.

---

## 9. Eventos

**Esenciales:**
- `ready`: cámara y modelos cargados.
- `frame`: nuevo esqueleto disponible (30–60 veces/segundo).
- `error`: falla, con `type` y `message`.

**Derivados (calculados internamente):**
- `personDetected`: aparece alguien después de que no había nadie.
- `personLost`: todos los frames vienen sin persona detectada.
- `handAppeared`: emite con `'left'` o `'right'`.
- `handLost`: emite con `'left'` o `'right'`.

Todos suscribibles con `karada.on(evento, callback)` y desuscribibles con `karada.off(...)`.

---

## 10. Manejo de permisos y errores

Tipos de error esperados:
- `'permission-denied'`: usuario negó permiso de cámara.
- `'camera-not-found'`: no hay cámara disponible.
- `'camera-in-use'`: cámara ocupada por otra aplicación.
- `'model-load-failed'`: fallo al cargar MediaPipe.
- `'not-supported'`: navegador sin capacidades requeridas.

Comportamiento:
- Si el usuario niega permiso: `start()` rechaza con `Error` de tipo `'permission-denied'`, y se emite evento `error`.
- Al hacer `stop()`, liberar explícitamente el stream de la cámara.
- Listener automático de `beforeunload` para limpiar si el usuario cierra la pestaña sin llamar `stop()`.

---

## 11. Alcance por fases

Todas las fases están sub-seccionadas para testing incremental. Máximo tres sub-secciones por fase.

### Fase 1 — Núcleo web funcional (MVP publicable)

**Meta:** publicar `karada@0.1.0` en NPM. Solo una persona (la más prominente).

**1.A — Cimientos y núcleo**
- Setup: `package.json`, `tsconfig.json`, `tsup`, `vitest`, estructura de carpetas.
- Núcleo agnóstico completo: `types.ts`, `skeleton.ts`, `events.ts`, `landmarks.ts`.
- Tests unitarios del núcleo (sin cámara ni navegador).
- `LICENSE` (PolyForm Noncommercial 1.0.0) y `NOTICE` (Apache 2.0 de MediaPipe).
- **Verificación:** compila, `npm test` pasa, `npm pack` genera tarball válido.

**1.B — Cámara y MediaPipe**
- `src/adapters/web/camera.ts`: encender/apagar cámara con permisos.
- `src/adapters/web/mediapipe.ts`: cargar Holistic y recibir puntos crudos.
- Integración: núcleo recibe puntos y arma el esqueleto.
- **Verificación:** página HTML mínima que abre cámara y loguea el objeto skeleton.

**1.C — Demo visible y publicación**
- Clase `Karada` pública con `start`, `stop`, `getFrame`, `on('frame' | 'ready' | 'error')`.
- Demo con canvas que dibuja el esqueleto en vivo.
- README con instalación, ejemplo mínimo y GIF del demo.
- Publicación de `karada@0.1.0` en NPM.
- **Verificación:** instalar desde NPM en un proyecto nuevo y que funcione.

### Fase 2 — Eventos de azúcar y robustez

**Meta:** que la librería se sienta profesional.

**2.A — Eventos derivados**
- Implementación de `personDetected`, `personLost`, `handAppeared`, `handLost`.
- Lógica de detección de cambios entre frames.
- Tests de escenarios (persona entra/sale; mano entra/sale).

**2.B — Ciclo de vida y errores**
- `pause()`, `resume()`.
- `maxFPS` en configuración.
- `Karada.isSupported()`, `Karada.checkPermission()`.
- Tipos de error tipados con union type.

**2.C — Suavizado y documentación**
- Filtro opcional de suavizado (One-Euro candidato) para reducir temblor.
- Documentación completa con ejemplos por caso de uso.
- Publicación de `karada@0.2.0`.

### Fase 3 — Expansión de fuentes

**Meta:** dejar de depender solo de cámara en vivo.

**3.A — Video grabado**
- Soporte para archivos de video (`.mp4`, `.webm`, etc.).
- Control frame por frame a velocidad configurable.
- Tests con videos de muestra.

**3.B — Imágenes y refactor**
- Soporte para imágenes estáticas.
- Refactor a API unificada de fuentes: cámara / video / imagen intercambiables.
- Publicación de `karada@0.3.0`.

### Fase 4 — Multiplataforma

**Meta:** cumplir la visión de que funcione más allá de la web.

**4.A — Migración a monorepo**
- Reestructurar a `@karada/core`, `@karada/web`.
- Publicación bajo scope `@karada`.
- Promoción a `1.0.0` estable.

**4.B — Adaptador móvil**
- `@karada/native` con React Native.
- MediaPipe iOS/Android o alternativa.
- Demo en móvil.

**4.C — Adaptador escritorio**
- `@karada/desktop` con Electron o Node.js.
- Casos de uso: kiosco, análisis offline, integraciones industriales.

### Fase 5 — Independencia de MediaPipe

**Meta:** Karada como motor autónomo.

**5.A — Exploración de alternativas**
- Prototipos con modelos vigentes al momento (YOLO pose, RF-DETR u otros).
- Comparación honesta de rendimiento, precisión, tamaño.
- Adaptador con el ganador.

**5.B — Modelo propio (largo plazo, opcional)**
- Entrenamiento de un modelo propio.
- Adaptador que lo use directamente.
- MediaPipe pasa a opcional/legacy.

**Nota sobre Fase 5:** es orientativa. Cuando llegue, el paisaje habrá cambiado y probablemente se re-decidirá.

---

## 12. Workflow de trabajo

### Doble ubicación del brief

Este documento vive en dos lugares idénticos:
1. **Conocimiento del Proyecto de Claude** (chats conversacionales).
2. **`CLAUDE.md` en la raíz del repo** (Claude Code).

Cuando se actualice, debe actualizarse en ambos lugares.

### Documento de decisiones por fase

Cada fase tiene su archivo en `docs/decisions/fase-N.md`, actualizado al cerrar cada chat. Los prompts para Claude Code deben instruirle a leer:
1. `CLAUDE.md` (este brief).
2. `docs/decisions/fase-actual.md`.

### Tipos de chats

Ver "Instrucciones del proyecto" para detalle completo. Resumen:

1. **Implementación** — generar prompts para Claude Code y procesar resultados. **NO se discuten decisiones aquí.**
2. **Decisiones** — resolver preguntas técnicas o de diseño no cubiertas.
3. **Estrategia** — marketing, presentación, roadmap comercial, README, demos.
4. **Dudas rápidas** — consultas puntuales, cortas.

---

## 13. Instrucciones específicas para Claude Code

1. **Empezar por Fase 1.A y no salir de ella** hasta que esté verde.
2. **Leer siempre `CLAUDE.md` y `docs/decisions/fase-actual.md`** al iniciar cualquier sesión.
3. **Pausar y consultar** antes de tomar decisiones técnicas grandes no cubiertas en el brief ni en las decisiones de la fase.
4. **Explicar cada archivo nuevo** conforme lo crea.
5. **Proponer mejoras** cuando detecte algo mejor, incluso si ya está decidido.
6. **Setup mínimo primero:** package.json, tsconfig.json, estructura vacía, un "hello world" que compile. Antes de lógica compleja, confirmar que el pipeline funciona.
7. **Tests desde el principio** para el núcleo.
8. **Commits pequeños y descriptivos** si se usa git.
9. **README como documento vivo:** actualizarlo conforme se agregan features.
10. **Al finalizar una sub-fase**, sugerir contenido a agregar a `docs/decisions/fase-N.md`.

---

## 14. Preguntas abiertas

- Lista final del subset de ~30 landmarks de cara nombrados (a resolver en chat de decisiones al iniciar Fase 1.A).
- Elección específica de filtro de suavizado en Fase 2.C (One-Euro candidato).
- Estrategia exacta de migración a monorepo en Fase 4.A (workspaces de npm vs pnpm vs turborepo).
- Elección de modelo alternativo en Fase 5.A (dependerá del paisaje del momento).
