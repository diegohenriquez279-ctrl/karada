# Decisiones — Fase 2

Documento de decisiones cerradas para la Fase 2 (sub-fases A, B y C).
Toda decisión aquí es vinculante para implementación. Cambios requieren chat de decisiones nuevo.

Fase 2 aún no comenzada. Este archivo se irá llenando conforme se cierren chats de decisiones e implementación de 2.A, 2.B y 2.C.

## Referencia rápida a las sub-fases (según brief §11)

- **2.A — Eventos derivados:** `personDetected`, `personLost`, `handAppeared`, `handLost`. Lógica de detección de cambios entre frames.
- **2.B — Ciclo de vida y errores:** `pause()`, `resume()`, `maxFPS`, `Karada.isSupported()`, `Karada.checkPermission()`, tipos de error tipados con union.
- **2.C — Suavizado y documentación:** filtro opcional de suavizado (One-Euro candidato), documentación completa, publicación diferida a Fase 3.B (D31).

## Sobre este documento

Registro vivo: cuando una decisión posterior modifica una anterior, la anterior se edita para reflejar el estado actual, marcada con una nota "Actualizada en DXX". La historia cronológica completa vive en el historial de git.
