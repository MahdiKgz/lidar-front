import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeDatasets } from './events';
class Source extends EventTarget {
  static instance: Source;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { super(); Source.instance = this; }
  emit(type: string, value: unknown) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) })); }
}
afterEach(() => vi.unstubAllGlobals());
describe('dataset events connection', () => {
  it('syncs on reconnect, delivers updates/progress and closes on cleanup', () => {
    vi.stubGlobal('EventSource', Source);
    const handlers = { sync: vi.fn(), update: vi.fn(), remove: vi.fn(), progress: vi.fn(), connection: vi.fn() };
    const close = subscribeDatasets(handlers); const source = Source.instance;
    expect(source.url).toContain('/datasets/events');
    source.emit('connected', {}); source.onerror?.(); source.emit('connected', {});
    expect(handlers.sync).toHaveBeenCalledTimes(2);
    expect(handlers.connection.mock.calls).toEqual([[true],[false],[true]]);
    source.emit('dataset-updated', { id: 'd', status: 'READY' });
    expect(handlers.update).toHaveBeenCalledWith({ id: 'd', status: 'READY' });
    source.emit('dataset-progress', { id: 'd', progress: 70 });
    expect(handlers.progress).toHaveBeenCalledWith('d',70);
    source.emit('dataset-deleted', { id: 'd' }); expect(handlers.remove).toHaveBeenCalledWith('d');
    close(); expect(source.close).toHaveBeenCalledOnce();
  });
  it('ignores malformed update data', () => {
    vi.stubGlobal('EventSource', Source);
    const handlers = { sync: vi.fn(), update: vi.fn(), remove: vi.fn(), progress: vi.fn(), connection: vi.fn() };
    const close = subscribeDatasets(handlers);
    Source.instance.emit('dataset-updated', { status: 'READY' }); expect(handlers.update).not.toHaveBeenCalled(); close();
  });
});
