import { describe, expect, it, vi } from 'vitest';
import { attachPort, ServerPort } from './server';
import { TEST_ENV, createFakeBackend, fakeWorker } from '../../test/fakeBackend';
import { EXT_PORT, NETFLIX_PORT } from '../../shared/rpc/protocol';
import { createPortClient } from '../../shared/rpc/portClient';
import { putMemo } from '../../shared/storage/repo';
import { bookMemo, netflixMemo } from '../../shared/storage/testFixtures';

const tick = () => new Promise((r) => setTimeout(r, 20));

function fakePort(name: string, sender: ServerPort['sender']) {
  const sent: unknown[] = [];
  const listeners: ((m: unknown) => void)[] = [];
  const port: ServerPort = {
    name,
    sender,
    postMessage: (m) => sent.push(JSON.parse(JSON.stringify(m))),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: { addListener: () => {} },
  };
  return { port, sent, send: (m: unknown) => listeners.forEach((l) => l(m)) };
}

describe('service worker ports', () => {
  it('serves the whole store and account state to extension pages', async () => {
    const backend = createFakeBackend();
    await putMemo(backend.memory, bookMemo({ id: 'b1' }));
    const worker = fakeWorker(backend);
    const client = createPortClient({ connect: worker.connect(EXT_PORT, TEST_ENV.extensionOrigin) });
    expect(await client.request('auth.state')).toEqual({ status: 'signedIn', email: 'tester@example.test' });
    expect(await client.request('area.get', { keys: ['memo:b1'] })).toEqual({ 'memo:b1': bookMemo({ id: 'b1' }) });
    client.close();
  });

  it('4.3-1 gives the Netflix port only Netflix operations', async () => {
    const backend = createFakeBackend();
    await putMemo(backend.memory, bookMemo({ id: 'b1', note: 'book secret' }));
    await putMemo(backend.memory, netflixMemo({ id: 'n1' }));
    const worker = fakeWorker(backend);
    const client = createPortClient({ connect: worker.connect(NETFLIX_PORT, 'https://www.netflix.com'), timeoutMs: 200 });
    expect(await client.request('bridge', { op: 'memos.list', videoId: 'v1' })).toHaveLength(1);
    // 확장 프로그램 화면의 작업은 넷플릭스 포트에서 답하지 않는다.
    for (const method of ['area.get', 'area.snapshot', 'auth.state', 'account.delete', 'auth.signOut']) {
      await expect(client.request(method, { keys: ['memo:b1'] })).rejects.toMatchObject({ code: 'unavailable' });
    }
    await expect(client.request('bridge', { op: 'area.get', keys: ['memo:b1'] })).rejects.toMatchObject({ code: 'invalid' });
    client.close();
  });

  it('4.3-2 tells the Netflix port only whether the user is signed in', async () => {
    const backend = createFakeBackend({}, { status: 'signedOut' });
    const { port, sent } = fakePort(NETFLIX_PORT, { id: TEST_ENV.extensionId, url: 'https://www.netflix.com/watch/1' });
    attachPort(backend, TEST_ENV, port);
    backend.setState({ status: 'signedIn', email: 'private@example.test' });
    await tick();
    expect(sent).toEqual([
      { channel: 'NF_STUDY_STORE_EVENT', event: 'auth', signedIn: false },
      { channel: 'NF_STUDY_STORE_EVENT', event: 'auth', signedIn: true },
    ]);
    expect(JSON.stringify(sent)).not.toContain('private@example.test');
  });

  it('refuses ports from other origins or with unknown names', () => {
    const backend = createFakeBackend();
    const cases: [string, ServerPort['sender']][] = [
      [EXT_PORT, { id: TEST_ENV.extensionId, url: 'https://www.netflix.com/watch/1' }],
      [NETFLIX_PORT, { id: TEST_ENV.extensionId, url: 'https://evil.example/' }],
      [NETFLIX_PORT, { id: 'other-extension', url: 'https://www.netflix.com/' }],
      ['other', { id: TEST_ENV.extensionId, url: `${TEST_ENV.extensionOrigin}/reader.html` }],
    ];
    for (const [name, sender] of cases) {
      const { port, sent } = fakePort(name, sender);
      attachPort(backend, TEST_ENV, port);
      expect(port.disconnect).toHaveBeenCalled();
      expect(sent).toEqual([]);
    }
  });
});
