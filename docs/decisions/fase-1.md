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

### D4. Subset de landmarks de cara nombrados (32 puntos)

Organización semántica del subset accesible por nombre. El array `raw: Point[]` con los 468 puntos sigue siempre disponible.

- **Nariz (3):** `noseTip`, `noseBridge`, `noseBottom`
- **Ojos (8):** `leftEyeInner`, `leftEyeOuter`, `leftEyeTop`, `leftEyeBottom`, `rightEyeInner`, `rightEyeOuter`, `rightEyeTop`, `rightEyeBottom`
- **Cejas (4):** `leftEyebrowInner`, `leftEyebrowOuter`, `rightEyebrowInner`, `rightEyebrowOuter`
- **Boca (6):** `mouthLeft`, `mouthRight`, `upperLipTop`, `upperLipBottom`, `lowerLipTop`, `lowerLipBottom`
- **Contorno (7):** `chin`, `leftJaw`, `rightJaw`, `foreheadCenter`, `leftCheek`, `rightCheek`, `leftTemple`
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
- Paquete `@mediapipe/holistic` desde npm.
- Assets `.wasm` y `.tflite` descargados desde CDN de Google al vuelo.
- **Deuda técnica documentada:** apps sin internet fallarán en primer arranque. Revisitar en 1.0.0 para ofrecer opción de auto-hospedar.

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

### D17. `BodyLandmarks` expone `raw` (33 puntos) además de las 12 nombradas
- Por consistencia con la cara ("nada se oculta"): se nombran las 12 articulaciones mayores y se expone `raw: Point[]` con los 33 puntos de MediaPipe Pose.
- Alternativa descartada: nombrar los 33 puntos (superficie pública más grande y rígida).

### D18. `buildSkeleton()` devuelve `Skeleton | null`
- Los tipos exigen `face` y `body` siempre presentes, pero cuando no hay persona no existen. En vez de inventar puntos vacíos, la ausencia de persona se representa devolviendo `null`.
- "No hay persona" = `face` o `pose` vacíos en la entrada cruda.
- Implica que `Karada.getFrame()` también será `Skeleton | null`.
- Alimenta el futuro evento `personLost` (Fase 2).

### D19. Convención de lados anatómica
- `left`/`right` en todos los landmarks nombrados = lado **anatómico del sujeto**, no el lado de la imagen. El flag `mirror` (D9) solo voltea coordenadas, nunca renombra puntos.
- Los ~10 índices de contorno/orejas/sien son elecciones de diseño (la malla no cubre orejas/sienes reales); documentados en `landmarks.ts`.

### D20. TypeScript fijado a la línea 5.x
- `npm install` trajo TypeScript 7.0.2 (port nativo), cuya API rompe la generación de `.d.ts` de tsup (vía `rollup-plugin-dts`).
- Se fija `typescript@^5` (5.9.3). Soporta todos los flags de D2 y produce ESM+CJS+dts sin errores.
- Revisitar cuando tsup/rollup-plugin-dts soporten TS 7.

### Nota de implementación: `on`/`off` funcionales en el stub
- La clase `Karada` de 1.A es un stub, pero `on`/`off` ya delegan en el emisor interno (operación pura, sin cámara). Solo `start`/`stop`/`getFrame` lanzan error hasta 1.B. Permite registrar listeners antes de `start()`.
