/**
 * Tests de los eventos derivados de Fase 2.A (D41–D45).
 *
 * Estrategia (recomendada por el prompt de implementación):
 *  - La lógica vive en la función pura `processTick` (`src/core/derived-events.ts`),
 *    que recibe el reloj como argumento. Se testea de forma 100% determinista,
 *    sin cámara, sin `performance.now` real y sin timers.
 *  - El orden de emisión "estado antes que datos" (D45) y los accessors
 *    (`isPresent`/`getLastSeen`) se testean a nivel de la clase `Karada` vía el
 *    método `@internal ingest(...)`, que inyecta un `Skeleton` sin cámara.
 *
 * `@mediapipe/tasks-vision` se mockea porque importar `Karada` arrastra el
 * adaptador web (que lo importa). El mock evita cargar la dependencia pesada en
 * el entorno `node` de Vitest; nunca se llama `start()`, así que los stubs no se
 * usan de verdad.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@mediapipe/tasks-vision', () => ({
  FaceLandmarker: class {},
  PoseLandmarker: class {},
  HandLandmarker: class {},
  FilesetResolver: class {},
}));

import {
  createInitialState,
  processTick,
  type DerivedEmission,
  type DerivedEventsConfig,
  type DerivedEventsState,
} from '../../src/core/derived-events';
import { buildSkeleton, type RawFrame } from '../../src/core/skeleton';
import { Karada } from '../../src/karada';
import type { Skeleton } from '../../src/core/types';

import validFrame from '../fixtures/valid-frame.json';

// --- Fixtures de Skeleton ---------------------------------------------------
// Se deriva un Skeleton real desde el fixture de 1.A (que tiene ambas manos) y
// se generan variantes cambiando solo la presencia de cada mano. Así no hay que
// escribir a mano las 478 filas de cara ni los 33 puntos de pose.

const FULL = buildSkeleton(validFrame as RawFrame)!;
if (FULL === null) throw new Error('fixture valid-frame debe producir un Skeleton');

/** Skeleton con persona presente y las manos indicadas (`true` = presente). */
function person(left: boolean, right: boolean): Skeleton {
  return {
    ...FULL,
    leftHand: left ? FULL.leftHand : null,
    rightHand: right ? FULL.rightHand : null,
  };
}

const DEFAULT_CONFIG: DerivedEventsConfig = {
  personLostDebounceMs: 500,
  handAppearedFrames: 2,
  handLostDebounceMs: 300,
};

/** Aplica un tick y devuelve emisiones + estado, encadenando el estado. */
function tick(
  skeleton: Skeleton | null,
  now: number,
  state: DerivedEventsState,
  config: DerivedEventsConfig = DEFAULT_CONFIG,
): { emissions: DerivedEmission[]; nextState: DerivedEventsState } {
  return processTick(skeleton, now, state, config);
}

function types(emissions: DerivedEmission[]): string[] {
  return emissions.map((e) => e.type);
}

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

describe('processTick — persona', () => {
  it('1. personDetected es inmediato con el primer Skeleton válido (0 ms)', () => {
    const { emissions, nextState } = tick(person(true, true), 0, createInitialState());

    expect(types(emissions)).toContain('personDetected');
    const detected = emissions.find((e) => e.type === 'personDetected');
    expect(detected).toMatchObject({ type: 'personDetected', skeleton: person(true, true) });
    expect(nextState.personPresent).toBe(true);
  });

  it('2. personLost dispara exactamente al alcanzar el debounce de 500 ms', () => {
    let state = createInitialState();
    ({ nextState: state } = tick(person(true, true), 1000, state)); // detectado en t=1000

    // Justo por debajo del umbral: aún no.
    const before = tick(null, 1000 + 499, state);
    expect(types(before.emissions)).not.toContain('personLost');
    expect(before.nextState.personPresent).toBe(true);

    // Exactamente en el umbral (elapsed === 500): sí.
    const at = tick(null, 1000 + 500, state);
    expect(types(at.emissions)).toContain('personLost');
    const lost = at.emissions.find((e) => e.type === 'personLost');
    expect(lost).toMatchObject({ timestamp: 1000 });
    expect(lost).toHaveProperty('lastSkeleton');
    expect(at.nextState.personPresent).toBe(false);
  });

  it('3. personLost NO dispara si la persona reaparece antes del debounce', () => {
    let state = createInitialState();
    ({ nextState: state } = tick(person(true, true), 1000, state));

    // Ausencia de 300 ms (< 500): sin personLost.
    let r = tick(null, 1300, state);
    expect(types(r.emissions)).not.toContain('personLost');
    state = r.nextState;

    // Reaparece: no re-emite personDetected (ya presente) ni personLost.
    r = tick(person(true, true), 1400, state);
    expect(types(r.emissions)).not.toContain('personLost');
    expect(types(r.emissions)).not.toContain('personDetected');
    expect(r.nextState.personPresent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Manos
// ---------------------------------------------------------------------------

describe('processTick — manos', () => {
  it('4. handAppeared dispara en el 2º frame consecutivo, no en el 1º', () => {
    let state = createInitialState();

    // Frame 1 con mano derecha: cuenta = 1 (< 2). Emite personDetected pero NO handAppeared.
    let r = tick(person(false, true), 1000, state);
    expect(types(r.emissions)).not.toContain('handAppeared');
    state = r.nextState;

    // Frame 2 consecutivo: cuenta = 2 (>= 2). handAppeared.
    r = tick(person(false, true), 1010, state);
    const appeared = r.emissions.find((e) => e.type === 'handAppeared');
    expect(appeared).toMatchObject({ type: 'handAppeared', side: 'right' });
    state = r.nextState;

    // Frame 3: ya presente, no re-emite.
    r = tick(person(false, true), 1020, state);
    expect(types(r.emissions)).not.toContain('handAppeared');
  });

  it('5. handAppeared se reinicia si la racha se rompe', () => {
    let state = createInitialState();

    // present (cuenta 1) → no emite
    let r = tick(person(false, true), 1000, state);
    expect(types(r.emissions)).not.toContain('handAppeared');
    state = r.nextState;

    // ausente → racha se rompe (cuenta 0). No handLost (nunca estuvo presente).
    r = tick(person(false, false), 1010, state);
    expect(types(r.emissions)).not.toContain('handAppeared');
    expect(types(r.emissions)).not.toContain('handLost');
    state = r.nextState;

    // present (cuenta 1) → todavía no
    r = tick(person(false, true), 1020, state);
    expect(types(r.emissions)).not.toContain('handAppeared');
    state = r.nextState;

    // present (cuenta 2) → ahora sí
    r = tick(person(false, true), 1030, state);
    expect(types(r.emissions)).toContain('handAppeared');
  });

  it('6. handLost dispara al alcanzar el debounce de 300 ms', () => {
    let state = createInitialState();
    // Establece la mano derecha como presente (2 frames).
    ({ nextState: state } = tick(person(false, true), 1000, state));
    ({ nextState: state } = tick(person(false, true), 1010, state)); // handAppeared; lastValid=1010

    // Mano ausente, persona presente: justo por debajo del umbral.
    const before = tick(person(false, false), 1010 + 299, state);
    expect(types(before.emissions)).not.toContain('handLost');

    // Exactamente en el umbral (elapsed === 300): sí.
    const at = tick(person(false, false), 1010 + 300, state);
    const lost = at.emissions.find((e) => e.type === 'handLost');
    expect(lost).toMatchObject({ type: 'handLost', side: 'right', timestamp: 1010 });
    expect(lost).toHaveProperty('lastPosition');
    expect(at.nextState.handPresent.right).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Interacción persona ↔ manos
// ---------------------------------------------------------------------------

describe('processTick — interacción', () => {
  it('7. personLost limpia el estado de manos y no emite handLost en ese tick', () => {
    let state = createInitialState();
    // Persona con ambas manos presentes y confirmadas (2 frames).
    ({ nextState: state } = tick(person(true, true), 1000, state));
    ({ nextState: state } = tick(person(true, true), 1010, state));
    expect(state.handPresent).toEqual({ left: true, right: true });

    // Persona desaparece hasta vencer el debounce de 500 ms.
    const r = tick(null, 1010 + 500, state);

    expect(types(r.emissions)).toContain('personLost');
    expect(types(r.emissions)).not.toContain('handLost');
    expect(r.nextState.personPresent).toBe(false);
    expect(r.nextState.handPresent).toEqual({ left: false, right: false });
    expect(r.nextState.handConsecutiveFrames).toEqual({ left: 0, right: 0 });
  });
});

// ---------------------------------------------------------------------------
// A nivel de clase Karada: orden de emisión, reset y accessors
// ---------------------------------------------------------------------------

describe('Karada — eventos derivados (clase)', () => {
  it('8. orden "estado antes que datos": handLost se emite antes que frame (D45)', () => {
    const karada = new Karada();
    const order: string[] = [];
    karada.on('handAppeared', () => order.push('handAppeared'));
    karada.on('handLost', () => order.push('handLost'));
    karada.on('frame', () => order.push('frame'));

    // Confirma la mano derecha (2 frames) → luego la pierde con la persona aún
    // presente, en un tick que también emite `frame`.
    karada.ingest(person(false, true), 1000);
    karada.ingest(person(false, true), 1010); // handAppeared + frame
    order.length = 0; // interesa solo el último tick

    karada.ingest(person(false, false), 1010 + 300); // handLost, luego frame

    expect(order).toEqual(['handLost', 'frame']);
  });

  it('9. tras stop(), una sesión nueva vuelve a emitir personDetected', () => {
    const karada = new Karada();
    const detected = vi.fn();
    karada.on('personDetected', detected);

    karada.ingest(person(true, true), 1000);
    expect(detected).toHaveBeenCalledTimes(1);
    expect(karada.isPresent()).toBe(true);

    // stop() resetea el estado derivado (igual que hace start() al arrancar).
    karada.stop();
    expect(karada.isPresent()).toBe(false);

    karada.ingest(person(true, true), 2000);
    expect(detected).toHaveBeenCalledTimes(2);
  });

  it('10. isPresent() y getLastSeen() reflejan cada transición', () => {
    const karada = new Karada();
    expect(karada.isPresent()).toBe(false);
    expect(karada.getLastSeen()).toBe(-1);

    karada.ingest(person(true, true), 1000);
    expect(karada.isPresent()).toBe(true);
    expect(karada.getLastSeen()).toBe(1000);

    // Ausencia por debajo del debounce: sigue "presente", lastSeen intacto.
    karada.ingest(null, 1200);
    expect(karada.isPresent()).toBe(true);
    expect(karada.getLastSeen()).toBe(1000);

    // Se vence el debounce → personLost: ya no presente, lastSeen sigue siendo
    // el último frame válido con persona.
    karada.ingest(null, 1600);
    expect(karada.isPresent()).toBe(false);
    expect(karada.getLastSeen()).toBe(1000);
  });
});
