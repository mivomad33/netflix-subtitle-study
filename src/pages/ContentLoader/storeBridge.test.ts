import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeClient } from '../Content/utils/storeClient';
import { installStoreBridge } from './storeBridge';
import { getMemo, putMemo, getBook } from '../../shared/storage/repo';
import { bookMemo, netflixMemo } from '../../shared/storage/testFixtures';
import { BRIDGE_EVENT, BRIDGE_REQUEST, BridgeEvent } from '../../shared/bridge/protocol';
import { NETFLIX_PORT } from '../../shared/rpc/protocol';
import { TEST_ENV, createFakeBackend, fakeWorker } from '../../test/fakeBackend';

const NETFLIX = 'https://www.netflix.com';

describe('store bridge between the Netflix page and the service worker', () => {
  let uninstall: () => void = () => {};
  let events: BridgeEvent[] = [];

  // jsdom의 postMessage는 origin과 source를 채우지 않는다. 브라우저처럼 채워 보낸다.
  beforeEach(() => {
    events = [];
    vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
      if ((data as BridgeEvent)?.channel === BRIDGE_EVENT) events.push(data as BridgeEvent);
      setTimeout(() =>
        window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source: window }))
      );
    });
  });
  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
  });

  const install = (backend = createFakeBackend(), openPage = vi.fn()) => {
    const worker = fakeWorker(backend, { ...TEST_ENV, openPage });
    uninstall = installStoreBridge(window, worker.connect(NETFLIX_PORT, NETFLIX));
    return { backend, worker, openPage };
  };

  it('saves, lists, and deletes Netflix memos through window messages', async () => {
    const { backend, openPage } = install();
    const client = createBridgeClient(window, 2000);

    await client.call({ op: 'memos.put', memo: netflixMemo({ id: 'n1', sourceId: '77' }) });
    expect(await getMemo(backend.memory, 'n1')).not.toBeNull();
    expect(await client.call({ op: 'memos.list', videoId: '77' })).toHaveLength(1);

    await client.call({ op: 'page.open', page: 'memos' });
    expect(openPage).toHaveBeenCalledWith('memos');

    await client.call({ op: 'memos.delete', id: 'n1' });
    expect(await getMemo(backend.memory, 'n1')).toBeNull();
  });

  it('applies requests in the order they were sent even when storage answers slowly', async () => {
    const backend = createFakeBackend();
    const base = backend.memory;
    const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const get = base.get.bind(base);
    const set = base.set.bind(base);
    base.get = async (keys: string[]) => {
      const v = await get(keys);
      await slow(10);
      return v;
    };
    base.set = async (items: Record<string, unknown>) => {
      await slow(10);
      return set(items);
    };
    install(backend);
    const client = createBridgeClient(window, 2000);

    // 새 메모를 저장하자마자 지운다.
    const put = client.call({ op: 'memos.put', memo: netflixMemo({ id: 'n5' }) });
    const del = client.call({ op: 'memos.delete', id: 'n5' });
    await Promise.all([put, del]);

    expect(await getMemo(base, 'n5')).toBeNull();
  });

  it('ignores messages from other windows and requests outside the protocol', async () => {
    const backend = createFakeBackend({ 'book:bk1': { id: 'bk1' } });
    const area = backend.memory;
    await putMemo(area, bookMemo({ id: 'b1' }));
    await putMemo(area, netflixMemo({ id: 'n9' }));
    install(backend);
    const before = JSON.stringify(await area.get(await area.getKeys()));

    // 다른 창에서 온 메시지
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: BRIDGE_REQUEST, requestId: 'x', op: 'memos.delete', id: 'n9' },
        origin: window.location.origin,
        source: null,
      })
    );
    // 다른 출처에서 온 메시지
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: BRIDGE_REQUEST, requestId: 'y', op: 'memos.delete', id: 'n9' },
        origin: 'https://evil.example',
        source: window,
      })
    );
    const client = createBridgeClient(window, 2000);
    // 원서 메모는 넷플릭스 쪽에서 지울 수 없다.
    await expect(client.call({ op: 'memos.delete', id: 'b1' })).rejects.toThrow();
    // 프로토콜에 없는 요청은 답 없이 무시된다.
    window.postMessage(
      { channel: BRIDGE_REQUEST, requestId: 'z', op: 'storage.remove', keys: ['book:bk1'] },
      window.location.origin
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(JSON.stringify(await area.get(await area.getKeys()))).toBe(before);
    expect(await getBook(area, 'bk1')).not.toBeUndefined();
  });

  it('4.2-3 passes change notices to the page without values', async () => {
    const { backend } = install();
    const client = createBridgeClient(window, 2000);
    await client.call({ op: 'auth.status' });
    // 다른 기기에서 체크리스트와 넷플릭스 메모, 원서 메모가 바뀌었다.
    await backend.memory.set({ 'nf:checklist:v7': { currentActiveRound: 1, rounds: { 1: {} } } });
    await putMemo(backend.memory, netflixMemo({ id: 'n1', sourceId: 'v7', note: 'secret note' }));
    await putMemo(backend.memory, bookMemo({ id: 'b1', note: 'book note' }));
    await new Promise((r) => setTimeout(r, 30));
    const changed = events.filter((e) => e.event === 'changed');
    expect(changed).toEqual([
      { channel: BRIDGE_EVENT, event: 'changed', scope: 'checklist', videoId: 'v7' },
      { channel: BRIDGE_EVENT, event: 'changed', scope: 'memos', videoId: 'v7' },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/secret note|book note/);
  });

  it('4.2-3 reconnects after the service worker stops and asks the page to read again', async () => {
    const { backend, worker } = install();
    const client = createBridgeClient(window, 2000);
    await client.call({ op: 'auth.status' });
    const before = worker.connections;
    worker.stopWorker();
    await new Promise((r) => setTimeout(r, 30));
    expect(worker.connections).toBe(before + 1);
    expect(events).toContainEqual({ channel: BRIDGE_EVENT, event: 'changed', scope: 'all' });
    // 다시 붙은 뒤의 변경도 받는다.
    events = [];
    await backend.memory.set({ 'nf:checklist:v8': { currentActiveRound: 1, rounds: { 1: {} } } });
    await new Promise((r) => setTimeout(r, 30));
    expect(events).toContainEqual({ channel: BRIDGE_EVENT, event: 'changed', scope: 'checklist', videoId: 'v8' });
    expect(await client.call({ op: 'checklist.get', videoId: 'v8' })).toEqual({ currentActiveRound: 1, rounds: { 1: {} } });
  });

  it('4.3-2 tells the page only whether the user is signed in', async () => {
    const { backend } = install(createFakeBackend({}, { status: 'signedOut' }));
    const client = createBridgeClient(window, 2000);
    expect(await client.call({ op: 'auth.status' })).toEqual({ signedIn: false });
    backend.setState({ status: 'signedIn', email: 'someone@example.test' });
    await new Promise((r) => setTimeout(r, 30));
    expect(await client.call({ op: 'auth.status' })).toEqual({ signedIn: true });
    expect(events.filter((e) => e.event === 'auth').pop()).toEqual({ channel: BRIDGE_EVENT, event: 'auth', signedIn: true });
    expect(JSON.stringify(events)).not.toContain('someone@example.test');
  });
});
