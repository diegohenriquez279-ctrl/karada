/**
 * Loop de captura (D10 + D25). Llama a `onFrame` una vez por frame real de
 * video, con un timestamp en microsegundos monotónicamente crecientes
 * (requisito de `detectForVideo`, que rechaza timestamps no crecientes).
 *
 * Prefiere `requestVideoFrameCallback` (un tick por frame decodificado, sin
 * desperdicio en pantallas de alta tasa de refresco). Si no existe, cae a
 * `requestAnimationFrame`.
 */

export function startLoop(
  video: HTMLVideoElement,
  onFrame: (timestampMicros: number) => void,
): () => void {
  let stopped = false;
  let lastTimestamp = -1;

  // Fuerza monotonicidad estricta: si el nuevo timestamp no supera al anterior,
  // se le suma 1 µs. detectForVideo rechaza timestamps <= al previo.
  const emit = (micros: number): void => {
    const timestamp = micros <= lastTimestamp ? lastTimestamp + 1 : micros;
    lastTimestamp = timestamp;
    onFrame(timestamp);
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    let handle = 0;
    const callback: VideoFrameRequestCallback = (_now, metadata) => {
      if (stopped) return;
      // metadata.mediaTime viene en segundos → microsegundos (D25).
      emit(Math.round(metadata.mediaTime * 1_000_000));
      handle = video.requestVideoFrameCallback(callback);
    };
    handle = video.requestVideoFrameCallback(callback);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback?.(handle);
    };
  }

  // Fallback: requestAnimationFrame con performance.now() (ms → µs).
  let rafHandle = 0;
  const tick = (): void => {
    if (stopped) return;
    emit(Math.round(performance.now() * 1000));
    rafHandle = requestAnimationFrame(tick);
  };
  rafHandle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(rafHandle);
  };
}
