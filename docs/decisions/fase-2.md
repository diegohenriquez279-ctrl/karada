# Decisiones — Fase 2

Documento de decisiones cerradas para la Fase 2 (sub-fases A, B y C).
Toda decisión aquí es vinculante para implementación. Cambios requieren chat de decisiones nuevo.

---

## Fase 2.A — Eventos derivados

### D41. Debounce persona: asimétrico y basado en tiempo real
- `personDetected` dispara al **primer Skeleton válido**, sin debounce (0 ms).
- `personLost` dispara tras **500 ms de ausencia continua** (todos los frames `null` durante esa ventana), medido con `performance.now()`, no en frames.
- Razón de medir en tiempo y no en frames: a 30 FPS 500 ms ≈ 15 frames, a 10 FPS ≈ 5 frames. Un conteo fijo daría latencias impredecibles en hardware débil (a 10 FPS, 15 frames = 1.5s, se siente roto).
- Valor por defecto 500 ms; configurable por el consumidor en rango razonable 300–600 ms.
- El loop de detección sigue corriendo en frames nulos para actualizar el timestamp de "último visto" y evaluar el timeout.
- Razón asimétrica: aparición inmediata (dos modelos independientes que se disparan a la vez sobre ruido es muy improbable); pérdida con gracia (oclusiones y falsos negativos son frecuentes en hardware débil).

### D42. Debounce manos: criterios distintos por naturaleza del evento
- `handAppeared(side)` dispara tras **2 frames consecutivos** con esa mano por encima del umbral 0.5 de handedness (D8).
- `handLost(side)` dispara tras **~300 ms de ausencia continua** de esa mano (default 300 ms), medido en tiempo con `performance.now()`.
- Razón de criterios distintos: aparición contada en frames (2) para filtrar el falso positivo puntual de palm-detection con mínima latencia; pérdida medida en tiempo para tolerar dropouts del tracker sin dejar "manos fantasma" dibujadas.
- Debounce de manos más corto que el de persona porque las manos entran y salen del encuadre legítimamente y con más frecuencia.
- Ambos parámetros expuestos como opciones de configuración con esos defaults.

### D43. Payloads con discriminador estable primero, datos ricos después
Firma pública de cada evento derivado:

- `personDetected(skeleton: Skeleton)` — emite el primer Skeleton válido.
- `personLost(info: { lastSkeleton: Skeleton, timestamp: number })` — emite el último Skeleton conocido y el timestamp del último frame válido.
- `handAppeared(side: 'left'|'right', hand: HandLandmarks)` — string primero (discriminador estable), landmarks después.
- `handLost(side: 'left'|'right', info: { lastPosition: HandLandmarks, timestamp: number })` — string primero, última posición y timestamp después.

Razón del orden: en JS/TS, agregar argumentos a un `emit` es no-breaking (listeners que no los leen los ignoran); quitar o cambiar el primer argumento sí rompe. Poner el discriminador estable primero permite ampliar el objeto de payload indefinidamente en el futuro.

### D44. `getFrame()` mantiene comportamiento stale (D30); accessors nuevos para polling
*Extiende D30 y D18 sin modificarlos.*

- `getFrame()` sigue devolviendo el último Skeleton válido cuando la persona desaparece (comportamiento stale de D30 intacto). `personLost` es el canal reactivo puro.
- Se agregan dos accessors nuevos para consumidores que hacen polling y necesitan la verdad del momento:
  - `isPresent(): boolean` — indica si hay persona detectada ahora mismo (sin considerar stale).
  - `getLastSeen(): number` — timestamp del último frame válido.
- Razón: canvas (danza, probador virtual) necesita stale para no parpadear en dropouts de 1-2 frames; lógica reactiva (contador de reps, pausar sesión) necesita señal binaria correcta. Dos audiencias, dos canales.
- Decisión puramente aditiva; no toca `getFrame()` ni contratos previos.

### D45. Orden de emisión: eventos de estado antes que `frame`
Dentro de un mismo tick de procesamiento, emitir en este orden:

1. Eventos de estado derivados: `personDetected` / `personLost` / `handAppeared` / `handLost`.
2. `frame` (solo si hay Skeleton válido).

Regla mnemónica: **"estado antes que datos"**. Convención estándar del ecosistema (sockets emiten `connect` antes de `data`; streams emiten `ready` antes de eventos de trabajo).

- `personLost` ocurre en un tick sin Skeleton válido, ese tick no emite `frame`.
- `handLost` puede ocurrir en un tick con persona presente; se emite `handLost` y después `frame` (que ya refleja la mano en `null`), de modo que el consumidor actualiza estado y dibuja coherentemente.
- El orden de emisión es contrato observable, por lo que **cambiarlo después sería semi-breaking**. Se fija ahora y se documenta.

---

## Fase 2.B — Ciclo de vida y errores

### D46. `pause()` y `resume()`: apagar de verdad, congelar reloj
- **Loop y cámara:** `pause()` cancela el `requestVideoFrameCallback` en curso **y** setea `videoTrack.enabled = false` (apaga la luz física de la cámara, deja de procesar frames, libera CPU/GPU sin liberar la cámara ni descargar los modelos). `resume()` setea `videoTrack.enabled = true` y re-suscribe el rVFC. Los modelos ya están en memoria; resume es instantáneo (<50 ms típicamente).
- **`getFrame()` durante pause:** mantiene stale (consistente con D30/D44). Es exactamente el caso donde el consumidor quiere "congelar" el dibujo en canvas.
- **Eventos derivados congelados, incluyendo el reloj de debounce:** al pausar, se congela el timestamp de "último visto" (guardar delta al momento de pause). No se disparan `personLost`/`handLost` durante la pausa aunque expire el debounce por reloj real. En `resume()` se re-referencian los timestamps al `performance.now()` del momento de resume, sumando el delta guardado.
- Razón: fitness/danza pausan para descansar; congelar reloj evita que al reanudar tras 5 minutos se dispare `personLost` inmediato. Que la luz de la cámara se apague es expectativa razonable de privacidad (equivalente a "mute" en Zoom).

### D47. `maxFPS`: rango, validación y método `setMaxFPS`
*Extiende D40 con la formalización pendiente.*

- **Rango válido:** `undefined` (sin límite, default) o número entero/decimal entre `1` y `120` inclusive.
- **Fuera de rango** (`≤ 0`, `> 120`, `NaN`, `Infinity`): throw `KaradaError` de tipo `'invalid-options'` en el constructor. Sin clamp silencioso.
- **Método nuevo:** `Karada.prototype.setMaxFPS(value: number | undefined): void` para cambio en runtime, con la misma validación. Habilita "modo bajo consumo" sin recargar modelos.
- **Interacción con debounce de eventos derivados:** cero problema. En D41/D42 se decidió medir en tiempo real con `performance.now()`, no en frames procesados. Si `maxFPS = 10`, los debounces de 300/500 ms siguen midiéndose correctamente en ms.
- **Interacción con `pause`/`resume`:** al reanudar, `maxFPS` sigue aplicándose sin cambios. El delta de tiempo se resetea al primer frame post-resume.
- Techo de 120: MediaPipe raro pasa de 60 FPS incluso en PC potente, pero permite pantallas de alta refresh sin cortar. Piso de 1: mínimo que tiene sentido para tracking (menos es slideshow).

### D48. `Karada.isSupported()`: sync, objeto detallado
Método estático **síncrono** que retorna objeto detallado, no boolean.

```typescript
Karada.isSupported(): {
  supported: boolean;       // true si TODOS los required están OK
  missing: string[];        // features required faltantes (vacía si supported)
  warnings: string[];       // features opcionales faltantes (rendimiento degradado)
}
```

**Chequeos required (bloquean):**
- `navigator.mediaDevices?.getUserMedia` presente.
- `WebAssembly` presente (test con módulo mínimo).
- Contexto seguro (`window.isSecureContext === true`).

**Chequeos opcionales (warning):**
- **WebAssembly SIMD** (test con `WebAssembly.validate` sobre módulo v128). Sin SIMD → warning "performance degradada" (MediaPipe cae de ~40 FPS a ~15 FPS sin SIMD).
- **`HTMLVideoElement.prototype.requestVideoFrameCallback`** presente. Sin él → warning "usando fallback a requestAnimationFrame".

Razón de retornar objeto en vez de boolean: permite mensajes específicos ("Necesitás Safari 16.4+" en vez de "no soportado"). El costo es trivial. Consumidor puede hacer `if (Karada.isSupported().supported)` si ignora detalles.

**Contexto PWA:** en PWA instalada, `isSecureContext` sigue siendo `true` por definición. No hay chequeo especial.

### D49. `Karada.checkPermission()`: async, usa Permissions API con fallback a `'unknown'`
Método estático async que retorna string estándar del union.

```typescript
Karada.checkPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'>
```

**Implementación:**
1. Si `navigator.permissions?.query` existe, intentar `query({ name: 'camera' as PermissionName })`.
2. Si tira error (Safari no soporta 'camera' históricamente): retornar `'unknown'`.
3. Si no existe `navigator.permissions`: retornar `'unknown'`.
4. **Nunca hacer `getUserMedia` de prueba.** Dispararía el prompt de permiso, exactamente el efecto que queríamos evitar.

**Semántica de `'unknown'`:** "no podemos saber sin pedir permiso; probá instanciar Karada normalmente y manejá el resultado". Es honesto, no engaña.

**Contexto PWA (documentar en JSDoc):** en PWA de iOS el permiso de cámara **no persiste entre sesiones** — se re-pregunta cada vez que se abre la app. No es bug de Karada, es limitación de iOS. El JSDoc debe advertirlo.

Razón de incluir `'unknown'` desde el arranque: agregar valores a un union es breaking (rompe consumidores con `switch` exhaustivo). `'unknown'` cubre todos los casos futuros de "no se pudo determinar".

### D50. Union `KaradaErrorType`: agregar `'invalid-options'` e `'invalid-state'`
*Extiende D34.*

Union completo tras 2.B (7 tipos):

```typescript
type KaradaErrorType =
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-in-use'
  | 'model-load-failed'
  | 'not-supported'
  | 'invalid-options'     // NUEVO en 2.B
  | 'invalid-state';      // NUEVO en 2.B
```

**Nuevos tipos y cuándo se disparan:**
- `'invalid-options'`: `maxFPS` fuera de rango en constructor o `setMaxFPS`; futuras opciones inválidas.
- `'invalid-state'`: operaciones en estado incorrecto — `pause()` sin `start()`, `resume()` sin `pause()`, `start()` cuando ya está corriendo. Un solo tipo cubre las 3 situaciones; el `message` da el detalle. Simpler que 3 tipos separados.

**Descartado:** `'aborted'` (para start cancelado por stop durante init). Caso raro; se maneja internamente sin exponerlo como tipo público.

Razón: agregar valores al union es no-breaking; quitarlos sí lo es. Conservador ahora, agregar después si aparece necesidad real.

---

## Fase 2.C — Suavizado y documentación

### D51. Filtro One-Euro con presets + config avanzada por región
- **Filtro elegido:** One-Euro Filter (Casiez, Roussel, Vogel, 2012). Único filtro implementado.
- **Descartados:** EMA (lag notable en movimiento rápido, se descarta como default aunque sea más barato) y Kalman (overkill para landmarks, mejor para trayectorias predecibles).
- **Razón:** MediaPipe internamente usa One-Euro en su LandmarksSmoothingCalculator oficial. Es el estándar de la industria para landmarks humanos (VIBE, MMHuman3D, Kalidokit). Overhead trivial incluso en móvil gama baja (~50k operaciones/segundo para 553 puntos × 3 ejes × 30 FPS).

**API pública:**

```typescript
interface KaradaOptions {
  smoothing?:
    | boolean                       // true = 'normal', false = 'off'
    | 'off' | 'light' | 'normal' | 'aggressive'
    | SmoothingConfig;              // config avanzada por región
}

interface SmoothingConfig {
  face?:  { minCutoff: number; beta: number } | boolean;
  body?:  { minCutoff: number; beta: number } | boolean;
  hands?: { minCutoff: number; beta: number } | boolean;
}
```

**Default:** `smoothing: 'normal'` (encendido por default, valor "normal").

**Presets con parámetros por región** (puntos de partida basados en literatura; ajustar empíricamente en runtime check):

| Preset | Face (mc, β) | Body (mc, β) | Hands (mc, β) |
|---|---|---|---|
| `'off'` | sin filtro | sin filtro | sin filtro |
| `'light'` | 1.0, 1.5 | 1.0, 1.0 | 1.5, 1.5 |
| `'normal'` | 0.5, 2.0 | 0.5, 1.5 | 1.0, 2.0 |
| `'aggressive'` | 0.1, 5.0 | 0.1, 3.0 | 0.5, 4.0 |

**`dCutoff`** queda hardcoded a `1.0` (valor recomendado por el paper original). No se expone en la API pública para mantener superficie simple.

**Ámbito de aplicación:**
- Se aplica **antes** de construir el subset nombrado (D4). El filtro procesa el array `raw` completo de face y los 33 puntos de pose y los 21×2 de manos. El subset nombrado se calcula sobre puntos ya filtrados.
- Se aplica sobre **coordenadas normalizadas** (`x, y, z ∈ [0,1]`). Las coordenadas en píxeles se derivan después.

**Confidence:** el filtro **ignora confidence**. Razón: la cara tiene confidence constante 1 (D28); ponderar por confidence solo funcionaría para body/hands, creando comportamiento asimétrico confuso. Para el jitter típico (alta frecuencia, baja amplitud), confidence no ayuda.

**Interacción con `personLost`:** el filtro se **resetea** (se descarta el estado previo) cuando dispara `personLost`. Sin reset, el primer frame post-reaparición estaría suavizado hacia una posición vieja e irrelevante.

**Reversibilidad:** ampliar presets es no-breaking. Cambiar parámetros de presets existentes es semi-breaking (comportamiento observable cambia). La estructura `{minCutoff, beta}` de `SmoothingConfig` queda como los dos parámetros canónicos.

### D52. README expandido + JSDoc completo en inglés
*Extiende D37.*

**Estructura del README expandido (11 secciones, orden fijo):**

1. **Hero:** título, tagline, GIF del demo (existente).
2. **Live demo:** link a GitHub Pages (existente).
3. **Why Karada:** 3-4 bullets — qué problema resuelve, para quién, qué la hace distinta.
4. **Quick Start:** snippet de 15-20 líneas copy-paste que funciona (HTML mínimo + JS).
5. **Casos de uso:** 4 subsecciones cortas (danza, fitness, probador virtual, fisio), cada una con snippet de 10-15 líneas mostrando el patrón típico.
6. **Configuration:** tabla de `KaradaOptions` con default, tipo, descripción. Tabla, no prosa.
7. **Events:** tabla de los 7 eventos (`ready`, `frame`, `error`, `personDetected`, `personLost`, `handAppeared`, `handLost`) con payload y cuándo se disparan.
8. **Error handling:** los 7 tipos de error de D50, cuándo aparecen, cómo manejarlos.
9. **Performance on low-end hardware:** sección propia (encaja con filosofía del proyecto). Recomendaciones concretas: `track:{face:false}` (~30% ahorro CPU), `quality:'fast'`, `maxFPS:15`, `smoothing:'off'`, escuchar `personLost` para pausar dibujado. Sin benchmarks numéricos (varían por dispositivo); solo recomendaciones cualitativas.
10. **Installation:** nota condicional "Not yet published to NPM (coming in Phase 3). Clone the repo to try locally". Se convierte en `npm install karada` cuando se publique.
11. **License & credits:** PolyForm Noncommercial 1.0.0 + aviso MediaPipe Apache 2.0 (existente).

**Snippets por caso de uso:** 10-15 líneas de JS, enfocados en el patrón único de cada caso, no HTML+CSS completo. El demo desplegado cumple la función de "ejemplo completo".

**No crear demos separados por caso de uso en 2.C** — trabajo desproporcionado. Considerar en Fase 3.B con publicación NPM.

**JSDoc completo:**
- Cobertura: clase `Karada` y todos sus métodos; todas las opciones de `KaradaOptions`; todos los tipos exportados (`Skeleton`, `Point`, `FaceLandmarks`, `BodyLandmarks`, `HandLandmarks`, `KaradaError`, `KaradaErrorType`, `SmoothingConfig`); todos los eventos con firma tipada.
- **`@example` en:** métodos principales (`start`, `stop`, `pause`, `resume`, `getFrame`, `on`, `off`, `setMaxFPS`) y en la clase `Karada`. No en tipos ni getters triviales (`isPresent`, `getLastSeen`).
- **Idioma:** **inglés**. Razones: convención universal del ecosistema TS/JS; ambición internacional del proyecto; el JSDoc aparece en el editor de cualquier desarrollador del mundo. El README puede tener traducción futura (Fase 3+); JSDoc conviene estable en inglés.

### D53. Cierre de 2.C: filtro + docs + build limpio + toggle en demo + tests; sin tag de versión
*Reemplaza la meta original de 2.C ("publicar karada@0.2.0"), invalidada por D31.*

**Componentes de cierre:**

1. **Filtro implementado:** D51 completo (One-Euro con 4 presets + `SmoothingConfig`, aplicado en el pipeline correcto, reset en `personLost`).
2. **Documentación:** D52 completo (README expandido con 11 secciones + JSDoc completo en inglés).
3. **Verificación de build:** mismo criterio que 1.C — `npm run build` produce `dist/` limpio (ESM + CJS + dts); `npm pack --dry-run` genera tarball válido con whitelist de `"files"` (D23). El paquete queda listo para publicar en Fase 3.B.
4. **Actualización del demo desplegado:** agregar toggle visible en la UI "Smoothing: off | light | normal | aggressive". Permite al visitante experimentar el efecto del filtro en vivo — la mejor demostración del feature. Se re-despliega a GitHub Pages al cierre de 2.C.
5. **Tests unitarios del filtro:** estrategia fixture-based (sin cámara real):
   - **Convergencia:** input constante → output converge al valor (delta pequeño tras N frames).
   - **Suavizado:** input con ruido gaussiano de σ conocida → varianza output < varianza input × factor esperado por preset.
   - **Responsividad:** step function → tiempo para llegar a 90% dentro de rango por preset.
   - **Reset:** llamar `.reset()` → siguiente frame no arrastra estado previo.

**Sin tag de versión:**
- No se crea tag `v0.2.0-pre` ni similar. Los tags de git corresponden a releases reales; un tag "pre" abre puerta a confusión.
- Cuando llegue Fase 3.B y se publique, ahí sí se hace `git tag` al momento del `npm publish`.

**Verificación de 2.C:** demo desplegado con toggle funcional en GitHub Pages; `npm run build` limpio; `npm pack --dry-run` válido; todos los tests unitarios del filtro pasan.

---

## Sobre este documento

Este archivo funciona como **registro vivo**, igual que `fase-1.md`: cuando una decisión posterior modifica una anterior, la anterior se edita para reflejar el estado actual, marcada con una nota "Actualizada en DXX". La historia cronológica completa vive en el historial de git.
