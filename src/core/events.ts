/**
 * Emisor de eventos propio, minimalista y agnóstico (decisión D11).
 *
 * No usamos `EventTarget` (del DOM, rompería la agnosticidad del núcleo)
 * ni el `EventEmitter` de Node (ataría la librería a Node). Este es un
 * reemplazo de ~40 líneas, tipado con generics para que el nombre del
 * evento y los tipos de sus argumentos se validen y autocompleten.
 *
 * `TEvents` es un mapa `nombreDeEvento -> tupla de argumentos` (ver
 * `KaradaEvents`). Se usa una tupla —y no un único payload— porque algunos
 * eventos derivados de Fase 2.A llevan dos argumentos (D43): por ejemplo
 * `handAppeared(side, hand)`, con el discriminador `side` primero.
 */

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

export class TypedEventEmitter<TEvents extends Record<string, unknown[]>> {
  // Un Set por evento: evita listeners duplicados y hace O(1) el `off`.
  private readonly listeners: {
    [K in keyof TEvents]?: Set<Listener<TEvents[K]>>;
  } = {};

  /** Suscribe un listener a un evento. Devuelve `this` para encadenar. */
  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): this {
    (this.listeners[event] ??= new Set()).add(listener);
    return this;
  }

  /** Elimina un listener concreto. Los demás listeners del evento siguen vivos. */
  off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): this {
    this.listeners[event]?.delete(listener);
    return this;
  }

  /** Emite un evento a todos sus listeners. Devuelve `true` si había alguno. */
  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): boolean {
    const set = this.listeners[event];
    if (set === undefined || set.size === 0) return false;
    // Copia defensiva: permite que un listener se desuscriba durante el emit.
    for (const listener of [...set]) listener(...args);
    return true;
  }
}
