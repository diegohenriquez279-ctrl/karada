# Decisiones — Fase 1

Documento de decisiones cerradas para la Fase 1 (sub-fases A, B y C).
Toda decisión aquí es vinculante para implementación. Cambios requieren chat de decisiones nuevo.

---

## Fase 1.A — Cimientos y núcleo

### D1. Entorno de desarrollo
- **Node.js:** 20 LTS o superior.
- **Package manager:** npm (viene con Node, sin dependencias extra).
- Revisitar en Fase 4.A al migrar a monorepo (evaluar pnpm workspaces).

### D2. Configuración de TypeScript
- `strict: true` completo.
- `noUncheckedIndexedAccess: true` (crítico para el array `raw: Point[]` de 468 puntos).
- `exactOptionalPropertyTypes: true`.
- `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`.
- Razón: empezar estricto es gratis; relajar después es caro.

### D3. Exports del paquete
- Un único entry point público: `src/index.ts`.
- Exporta: clase `Karada`, tipos `KaradaOptions`, `Skeleton`, `Point`, `FaceLandmarks`, `BodyLandmarks`, `HandLandmarks`, tipos de error y de eventos.
- **No exportar** núcleo ni adaptadores directamente en Fase 1.
- Razón: superficie API pequeña = libertad de refactorizar sin romper usuarios.

### D4. Subset de landmarks de cara nombrados (33 puntos)

*Actualizada en D19: se agregó `rightTemple` por simetría con `leftTemple`. Total pasa de 32 a 33.*

Organización semántica del subset accesible por nombre. El array `raw: Point[]` con los 478 puntos (ver D16) sigue siempre disponible.

- **Nariz (3):** `noseTip`, `noseBridge`, `noseBottom`
- **Ojos (8):** `leftEyeInner`, `leftEyeOuter`, `leftEyeTop`, `leftEyeBottom`, `rightEyeInner`, `rightEyeOuter`, `rightEyeTop`, `rightEyeBottom`
- **Cejas (4):** `leftEyebrowInner`, `leftEyebrowOuter`, `rightEyebrowInner`, `rightEyebrowOuter`
- **Boca (6):** `mouthLeft`, `mouthRight`, `upperLipTop`, `upperLipBottom`, `lowerLipTop`, `lowerLipBottom`
- **Contorno (8):** `chin`, `leftJaw`, `rightJaw`, `foreheadCenter`, `leftCheek`, `rightCheek`, `leftTemple`, `rightTemple`
- **Orejas (2):** `leftEar`, `rightEar`
- **Extras (2):** `leftIris`, `rightIris` (útiles para eye-tracking futuro).

Este subset cierra la pregunta abierta #1 del brief.

### D5. Mapeo MediaPipe → nombres semánticos
- Archivo `src/core/landmarks.ts` con constante `FACE_LANDMARK_INDICES` (`as const`) mapeando cada nombre semántico al índice numérico de MediaPipe.
- Función pura `buildFaceLandmarks(rawPoints: Point[]): FaceLandmarks` en el núcleo consume ese mapa.
- Núcleo se mantiene agnóstico: recibe `Point[]`, no sabe de MediaPipe.

### D6. Testing del núcleo
- Fixtures JSON con arrays de puntos falsos que simulan salida de MediaPipe.
- Tests verifican: `buildSkeleton()` con puntos válidos, confidence bajo produce `null` en manos, índices semánticos apuntan al punto correcto del array raw.

---

## Fase 1.B — Cámara y MediaPipe

### D7. Carga de MediaPipe

*Actualizada en D24: se migra de `@mediapipe/holistic` (legacy) a `@mediapipe/tasks-vision` con composición de tres landmarkers. Los detalles vigentes viven en D24. Este bloque se conserva como registro histórico del punto de partida.*

- (Original) Paquete `@mediapipe/holistic` desde npm.
- (Original) Assets `.wasm` y `.tflite` descargados desde CDN de Google al vuelo.
- **Deuda técnica documentada:** apps sin internet fallarán en primer arranque. Revisitar en 1.0.0 para ofrecer opción de auto-hospedar. (Sigue vigente bajo D24, ahora con URLs distintas.)

### D8. Umbral de confidence para manos
- Si confianza promedio de los 21 puntos de una mano < **0.5**, la mano se reporta como `null`.
- Configurable internamente en Fase 1, no expuesto en API pública.
- Ajustable en Fase 2 según datos reales del demo.

### D9. Sistema de coordenadas y flag `mirror`
- Cuando `mirror: true`, el volteo se aplica a los **puntos entregados al usuario**, no solo al video visualmente.
- Concretamente: `x_final = 1 - x_original` (en coordenadas normalizadas) antes de entregar el frame.
- Razón: es el comportamiento menos sorprendente. Evita el bug clásico "el esqueleto sale al revés" cuando el desarrollador dibuja encima del video espejado.

### D10. Loop de captura
- `requestVideoFrameCallback` cuando esté disponible.
- Fallback a `requestAnimationFrame`.
- Razón: un frame procesado por cada frame real de video, sin desperdicio en pantallas de alta refresh rate.

---

## Fase 1.C — Demo y publicación

### D11. Sistema de eventos interno
- `EventEmitter` propio y minimalista en `src/core/events.ts` (~30 líneas).
- **No usar** `EventTarget` del DOM (rompe agnosticidad del núcleo) ni `EventEmitter` de Node.
- Tipado con generics para autocompletado por nombre de evento.

### D12. Stack del demo
- Vanilla HTML + TypeScript + Vite.
- Sin React, Vue ni otros frameworks.
- Razón: demuestra que Karada funciona framework-agnóstico.

### D13. Nombre del paquete NPM
- Nombre confirmado: `karada`.
- Verificado disponible en NPM (404 en `https://www.npmjs.com/package/karada` al momento de este cierre).

### D14. README v0.1.0 — contenido mínimo
1. Título + tagline de una línea.
2. Badges (npm version, license, tamaño).
3. GIF del demo funcionando.
4. Instalación (`npm install karada`).
5. Ejemplo mínimo (~20 líneas).
6. Enlace a documentación (README expandido en Fase 2).
7. Aviso de licencia PolyForm + aviso de MediaPipe (Apache 2.0).

**Excluido de v0.1.0:** roadmap público, comparativas, guía de contribución.

### D15. Estrategia de versionado en Fase 1
- 1.A cierra sin publicar (código local).
- 1.B cierra sin publicar (código local + demo local funcionando).
- 1.C publica `0.1.0` en NPM.
- Sin versiones `0.0.x` intermedias públicas.

---

## Preguntas abiertas movidas a fases posteriores
- Elección de filtro de suavizado → Fase 2.C.
- Estrategia de migración a monorepo → Fase 4.A.
- Modelo alternativo a MediaPipe → Fase 5.A.

---

## Decisiones tomadas durante la implementación de 1.A (D16–D20)

### D16. Refinamiento de iris → malla de 478 puntos (aprobado por Diego)
- D4 pide `leftIris`/`rightIris`, pero los iris **no existen** en los 468 puntos base de MediaPipe Face Mesh: solo aparecen con el refinamiento de iris activo (`refineFaceLandmarks`), que sube la malla a **478 puntos** (468 base + 10 de iris).
- Índices: `rightIris` = 468, `leftIris` = 473 (centros).
- Consecuencia: `FaceLandmarks.raw` tiene longitud **478**, no 468.
- **Acción pendiente:** actualizar el brief §8 (que aún dice `raw` length = 468) en sus dos ubicaciones (conocimiento del Proyecto + `CLAUDE.md`).
- El adaptador web (1.B) debe activar el refinamiento de iris.

### D17. Contrato de cuerpo: nombres semánticos, sin array raw

- `BodyLandmarks` **no expone `raw: Point[]`**. Se descartó la simetría con `FaceLandmarks` por diseño.
- Razón: de los 33 puntos que devuelve MediaPipe Pose, 21 son duplicados de cara y manos (ya expuestos con más detalle en sus regiones), y solo 4 son únicos: talones y puntas de pie.
- Esos 4 se agregan al subset nombrado: `leftHeel`, `rightHeel`, `leftFootIndex`, `rightFootIndex`.
- Subset de cuerpo pasa de 12 a 16 landmarks. Reflejado en brief §8.
- Índices oficiales de MediaPipe Pose: `leftHeel = 29`, `rightHeel = 30`, `leftFootIndex = 31`, `rightFootIndex = 32`.

### D18. `buildSkeleton()` devuelve `Skeleton | null`

*Actualizada en D30: la clase pública `Karada` aplica un comportamiento "stale" sobre `getFrame()` para el caso de uso de dibujado. El contrato del núcleo (que `buildSkeleton` puede retornar `null`) se mantiene intacto; solo se refina qué hace la API pública con ese `null`.*

- Los tipos exigen `face` y `body` siempre presentes, pero cuando no hay persona no existen. En vez de inventar puntos vacíos, la ausencia de persona se representa devolviendo `null`.
- "No hay persona" = `face` o `pose` vacíos en la entrada cruda.
- Implica que `Karada.getFrame()` también será `Skeleton | null`.
- Alimenta el futuro evento `personLost` (Fase 2).
- Efecto sobre el evento `frame`: resuelto en D21.

### D19. Convención de lados anatómica
- `left`/`right` en todos los landmarks nombrados = lado **anatómico del sujeto**, no el lado de la imagen. El flag `mirror` (D9) solo voltea coordenadas, nunca renombra puntos.
- Los ~10 índices de contorno/orejas/sien son elecciones de diseño (la malla no cubre orejas/sienes reales); documentados en `landmarks.ts`.

### D20. TypeScript fijado a la línea 5.x
- `npm install` trajo TypeScript 7.0.2 (port nativo), cuya API rompe la generación de `.d.ts` de tsup (vía `rollup-plugin-dts`).
- Se fija `typescript@^5` (5.9.3). Soporta todos los flags de D2 y produce ESM+CJS+dts sin errores.
- Revisitar cuando tsup/rollup-plugin-dts soporten TS 7.

### Nota de implementación: `on`/`off` funcionales en el stub
- La clase `Karada` de 1.A es un stub, pero `on`/`off` ya delegan en el emisor interno (operación pura, sin cámara). Solo `start`/`stop`/`getFrame` lanzan error hasta 1.B. Permite registrar listeners antes de `start()`.

### D21. Comportamiento del evento `frame`
- `frame` se emite **solo cuando hay `Skeleton` real**. No se emite con `null`.
- Firma pública: `(skeleton: Skeleton) => void`.
- `buildSkeleton` en el núcleo sigue retornando `Skeleton | null` (D18); el emisor de eventos filtra los `null`.
- Razón: el estado "sin persona" será cubierto en Fase 2 por los eventos derivados `personDetected` y `personLost`. Emitir `null` en `frame` obligaría a chequeos defensivos que serán redundantes.
- Decisión reversible: agregar `null` al union en el futuro es cambio compatible; quitarlo no lo sería.

---

## Decisiones tomadas al cerrar Fase 1.A y abrir Fase 1.B (D22–D25)

### D22. Alcance visual de Fase 1.B
- 1.B cierra con página HTML mínima que muestra el video de la cámara y loguea el `Skeleton` recibido. **No dibuja landmarks en canvas.**
- Ese dibujo pertenece a 1.C (demo pulido).
- Para no saturar la consola, el log del skeleton se throttlea a 1/segundo, y el último frame se expone en `window.__lastSkeleton` para inspección manual desde DevTools.

### D23. Ubicación de la página de prueba de 1.B
- La página vive en **`scratch/`** en la raíz del repo (por ejemplo `scratch/1b-smoke.html` + su `main.ts`).
- No en `demo/`: `demo/` está reservado para el demo pulido de 1.C y mezclar ambos confunde intención.
- `scratch/` queda commiteado en git como referencia para pruebas de humo futuras (patrón que se repetirá en 1.B de Fase 3 con video grabado).
- El paquete NPM se protege con `"files": ["dist", "README.md", "LICENSE", "NOTICE"]` en `package.json`. Whitelist explícita: solo eso se publica. `scratch/`, `src/`, `tests/`, `demo/`, `docs/` quedan fuera del tarball automáticamente.

### D24. Migración a `@mediapipe/tasks-vision` con composición de tres landmarkers
- **D7 queda superada.** Se reemplaza el paquete `@mediapipe/holistic` (legacy según Google) por `@mediapipe/tasks-vision` (>=0.10.35).
- Dentro de Tasks, se descarta `HolisticLandmarker` unificado y se adopta **composición**: `FaceLandmarker` + `PoseLandmarker` + `HandLandmarker` ejecutándose en paralelo por cada frame.
- **Razón principal:** `HolisticLandmarker` unificado entrega solo 468 face landmarks (sin iris), incompatible con D16 (478 con iris en índices 468/473). `FaceLandmarker` standalone sí entrega los 478.
- **Razones secundarias:**
  - Alinea con `KaradaOptions.track`: apagar `face`/`body`/`hands` en la config no carga el landmarker correspondiente. Ahorro real de RAM/CPU cuando el usuario lo pide.
  - `quality: 'fast' | 'balanced' | 'accurate'` puede mapear a variantes distintas por landmarker (por ejemplo, pose lite vs heavy), imposible con el unificado.
  - Sustituir un modelo en Fase 5 (por ejemplo, cambiar pose por YOLO) se hace sin tocar los otros dos.
- **Costos aceptados:** ~3× RAM/CPU respecto al unificado, tres bundles `.task` a descargar en primer arranque. Mitigación por parte del usuario: apagar módulos vía `track` y usar `quality: 'fast'` en hardware débil.
- **Índices que se preservan sin cambios:**
  - Face 478, iris en 468/473 (D16).
  - Pose 33, `leftHeel = 29`, `rightHeel = 30`, `leftFootIndex = 31`, `rightFootIndex = 32` (D17).
  - Hand 21 por mano, topología estándar (wrist=0, thumb 1–4, index 5–8, middle 9–12, ring 13–16, pinky 17–20).
- **Assets:** `FilesetResolver.forVisionTasks(wasmUrl)` + `Landmarker.createFromModelPath(fileset, taskUrl)`. Wasm desde jsdelivr, modelos `.task` desde `storage.googleapis.com/mediapipe-models/…`. La deuda técnica de "sin internet no arranca en primer uso" documentada en D7 se mantiene igual, con nuevas URLs. Revisitar en 1.0.0.
- **Puerta de escape:** si en 1.C se mide que la composición es inviable en hardware objetivo, se puede introducir un adaptador alternativo con `HolisticLandmarker` unificado y aceptar renunciar a iris ahí; el contrato público del núcleo no cambia.

### D25. Detalle de timestamp en el loop de detección
- Confirmación de la interpretación de D10: `requestVideoFrameCallback` dispara → se llama `detectForVideo(video, timestamp)` de cada landmarker → resultados síncronos → `buildSkeleton` → si retorna `Skeleton`, se emite `frame`.
- `requestVideoFrameCallback` entrega `metadata.mediaTime` en segundos; `detectForVideo` espera timestamp en **microsegundos monotónicamente crecientes**. Conversión oficial: `Math.round(metadata.mediaTime * 1_000_000)`.
- En composición (D24), los tres landmarkers reciben el **mismo timestamp** por frame. Sincronía garantizada sin lógica adicional.
- Fallback a `requestAnimationFrame` (definido en D10): usar `performance.now() * 1000` como timestamp, con la misma restricción de monotonicidad.

---

## Decisiones tomadas durante la implementación de 1.B (D26–D30)

### D26. `tsconfig` para 1.B: `lib: ["ES2022", "DOM"]` y `stripInternal`
- El adaptador web toca APIs del navegador (`getUserMedia`, `HTMLVideoElement`, `requestVideoFrameCallback`), por lo que el tsconfig raíz agrega `DOM` a `lib`. Sin eso el adaptador no compila.
- La agnosticidad del núcleo (§4 del brief) **no** se sostiene por el `lib` de TypeScript. Se sostiene por el grep-check acordado en Fase 1.A: ningún archivo bajo `src/core/` puede importar MediaPipe ni APIs de plataforma. El check corre en el pipeline de verificación de cada sub-fase.
- Se activa `stripInternal: true` para que los símbolos marcados con `/** @internal */` no aparezcan en los `.d.ts` públicos. Da margen para exponer helpers dentro del paquete sin comprometerlos como superficie API estable.
- Revisitar en Fase 4.A: al migrar a monorepo, `@karada/core` tendrá su propio tsconfig sin `DOM`, forzando la agnosticidad a nivel de tipos. Mientras vivamos en un solo paquete, el grep-check es la garantía.

### D27. Handedness: `SWAP_HANDEDNESS = false` en el adaptador web
- MediaPipe Tasks asume que la imagen de entrada representa la escena vista por el sujeto (no espejada). El razonamiento inicial fue: como se pasa el frame crudo del `<video>`, hay que invertir la etiqueta `Handedness` para respetar D19 (nombres = lado anatómico del sujeto).
- **Verificado empíricamente:** con `SWAP_HANDEDNESS = true`, levantar la mano derecha anatómica producía `leftHand` con datos y `rightHand` en `null`. El swap estaba causando la inversión, no corrigiéndola.
- Causa: el stream de cámara `user` que llega al `<video>` ya viene espejado desde la captura. MediaPipe recibe una imagen ya espejada y su etiqueta interna coincide con el lado anatómico sin necesidad de invertir.
- **Decisión:** `SWAP_HANDEDNESS = false` en `src/adapters/web/mediapipe.ts`.
- **Ojo para Fase 3:** cuando el input sea video grabado (`.mp4`) o imagen estática, la imagen probablemente NO estará espejada, y la lógica del swap deberá reconsiderarse por fuente de input. El adaptador debería exponer el criterio de swap por fuente y no como constante global. Marcar como deuda técnica para 3.A.

### D28. Semántica del campo `Point.confidence` en Fase 1.B
Contrato público del campo `confidence` en cada región del `Skeleton`:

- **`face.*.confidence` = `1` constante.** MediaPipe FaceLandmarker no entrega score por landmark facial. Se usa `1` como valor neutro para no romper el tipo `Point`. Un consumidor que necesite un score global de detección de cara deberá esperar a que Karada lo exponga aparte (Fase 2.C candidato).
- **`body.*.confidence` = `visibility` real de MediaPipe Pose** (`landmark.visibility`, rango 0–1). Es el valor más útil disponible y refleja tanto oclusión como confianza del modelo.
- **`hand.*.confidence` = score de handedness de la mano completa** (mismo valor para los 21 puntos de esa mano). Este es el score que alimenta la puerta de D8 (umbral 0.5 para reportar mano como `null`).

Consecuencia deseable: un consumidor puede filtrar puntos poco confiables uniformemente con `if (p.confidence < X)` sin conocer la región, aunque la resolución de la señal difiere. Documentar en el README de 1.C.

### D29. Scripts de npm: `dev` = Vite, `build:watch` = tsup watch
- `npm run dev` levanta el **servidor de desarrollo con Vite** apuntando a `scratch/` (y en 1.C a `demo/`). Es el flujo diario para probar la librería en vivo con cámara real.
- `npm run build` sigue siendo `tsup` una sola vez (ESM + CJS + tipos).
- `npm run build:watch` = `tsup --watch`, para casos raros donde se quiera regenerar el bundle mientras se edita (por ejemplo, si un consumidor externo referencia `dist/` directamente).
- Razón: durante desarrollo interactivo nadie consume `dist/`. Vite compila TypeScript al vuelo y sirve fuentes originales, lo cual es mucho más rápido que reconstruir todo el bundle por cada cambio.
- Se conservan ambos porque cumplen roles distintos: Vite es el sandbox de prueba, tsup es la fábrica del paquete distribuible.

### D30. `getFrame()` conserva el último `Skeleton` válido (stale)
*Actualiza D18: la implicación "`Karada.getFrame()` también será `Skeleton | null`" se refina aquí.*

- Comportamiento adoptado en 1.B: `getFrame()` devuelve el último `Skeleton` no-nulo que la librería haya producido. Solo devuelve `null` **antes de la primera detección** (durante la carga inicial o si nunca se detectó persona desde `start()`).
- No devuelve `null` cuando desaparece la persona a mitad de sesión: sigue devolviendo el último `Skeleton` conocido.
- **Razón:** para el caso de uso principal (dibujado del esqueleto en canvas) es lo que menos parpadea. Un frame perdido aislado no borra el dibujo. La lógica reactiva ("¿hay persona ahora mismo?") es un caso distinto y merece su canal propio.
- **Fuente autoritativa del estado "hay/no hay persona"**: los eventos derivados `personDetected` y `personLost` de Fase 2.A. Consumidores que necesiten reaccionar a la ausencia deben suscribirse a `personLost`, no hacer polling de `getFrame() === null`.
- **Efecto sobre D18:** `buildSkeleton()` en el núcleo sigue retornando `Skeleton | null` (contrato del núcleo intacto). La clase pública `Karada` es la que aplica el "stale": el emisor de eventos filtra los `null` de `frame` (D21) y `getFrame()` filtra los `null` conservando el anterior.
- Decisión reversible: cambiar `getFrame()` a devolver `null` cuando no hay persona en el frame actual sería breaking en apps que asumen el comportamiento stale para dibujar. Si en Fase 2 medimos que la API es confusa, se puede introducir un método adicional (por ejemplo, `getLatestFrame()` vs `getCurrentFrame()`) sin romper el existente.

---

## Sobre este documento

Este archivo funciona como **registro vivo**: cuando una decisión posterior modifica una anterior, la anterior se edita para reflejar el estado actual, marcada con una nota "Actualizada en DXX". La historia cronológica completa vive en el historial de git.
