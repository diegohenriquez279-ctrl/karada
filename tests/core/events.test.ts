import { describe, expect, it, vi } from 'vitest';

import { TypedEventEmitter } from '../../src/core/events';

// Mapa de eventos de prueba para ejercitar el tipado genérico.
type TestEvents = {
  ping: void;
  data: { value: number };
  side: 'left' | 'right';
};

describe('TypedEventEmitter', () => {
  it('emit llama al listener con el payload correcto', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('data', listener);
    emitter.emit('data', { value: 42 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 42 });
  });

  it('emit devuelve false si no hay listeners y true si los hay', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    expect(emitter.emit('ping', undefined)).toBe(false);

    emitter.on('ping', () => {});
    expect(emitter.emit('ping', undefined)).toBe(true);
  });

  it('off remueve solo el listener indicado, no los demás', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();

    emitter.on('side', a);
    emitter.on('side', b);
    emitter.off('side', a);

    emitter.emit('side', 'left');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('left');
  });

  it('off sobre un listener no registrado es seguro (no lanza)', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    expect(() => emitter.off('ping', () => {})).not.toThrow();
  });

  it('los eventos son independientes entre sí', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const onData = vi.fn();
    const onSide = vi.fn();

    emitter.on('data', onData);
    emitter.on('side', onSide);
    emitter.emit('data', { value: 1 });

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onSide).not.toHaveBeenCalled();
  });

  it('un listener puede desuscribirse durante el emit sin romper la iteración', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const second = vi.fn();
    const first = vi.fn(() => emitter.off('ping', first));

    emitter.on('ping', first);
    emitter.on('ping', second);

    expect(() => emitter.emit('ping', undefined)).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
