/**
 * Emisor de eventos propio, minimalista y agnóstico (decisión D11).
 *
 * No usamos `EventTarget` (del DOM, rompería la agnosticidad del núcleo)
 * ni el `EventEmitter` de Node (ataría la librería a Node). Este es un
 * reemplazo de ~30 líneas, tipado con generics para que el nombre del
 * evento y el tipo de su payload se validen y autocompleten.
 *
 * `TEvents` es un mapa `nombreDeEvento -> tipoDePayload` (ver `KaradaEvents`).
 */

type Listener<TPayload> = (payload: TPayload) => void;

export class TypedEventEmitter<TEvents extends Record<string, unknown>> {
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
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): boolean {
    const set = this.listeners[event];
    if (set === undefined || set.size === 0) return false;
    // Copia defensiva: permite que un listener se desuscriba durante el emit.
    for (const listener of [...set]) listener(payload);
    return true;
  }
}
