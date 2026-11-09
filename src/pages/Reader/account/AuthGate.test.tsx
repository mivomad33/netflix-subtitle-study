import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBook } from '../../../shared/storage/repo';
import { StorageArea, createMemoryArea } from '../../../shared/storage/storageArea';
import { StorageError, StorageErrorCode } from '../../../shared/storage/errors';
import { AuthState, SignedOutNotice } from '../../../shared/auth/types';
import { ReaderEnvProvider } from '../env';
import App from '../App';
import { AuthGate } from './AuthGate';
import { FakeAuth, createFakeAuth } from '../dev/fakeAuth';

const PRIVACY = 'https://nf-subtitle-study-21cae.web.app/privacy/';
const COPYRIGHT = 'https://nf-subtitle-study-21cae.web.app/copyright/';

const seed = (area: StorageArea) =>
  saveBook(area, { id: 'bk1', title: 'Garden Notes', author: '', createdAt: 1, updatedAt: 1 }, [
    { id: 'c1', title: 'Gate', paragraphs: ['The garden gate creaked open.'] },
  ]);

// 저장소를 부른 횟수를 센다(로그아웃 상태에서는 0이어야 한다).
function countingArea(area: StorageArea) {
  const calls: string[] = [];
  const counted: StorageArea = {
    get(keys) {
      calls.push('get');
      return area.get(keys);
    },
    getKeys() {
      calls.push('getKeys');
      return area.getKeys();
    },
    set(items) {
      calls.push('set');
      return area.set(items);
    },
    remove(keys) {
      calls.push('remove');
      return area.remove(keys);
    },
    onChanged: (l) => area.onChanged(l),
  };
  return { area: counted, calls };
}

function renderGate(area: StorageArea, auth: FakeAuth) {
  window.location.hash = '#/';
  return render(
    <ReaderEnvProvider env={{ area, openTab: vi.fn() }}>
      <AuthGate auth={auth}>
        <App />
      </AuthGate>
    </ReaderEnvProvider>
  );
}

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

const signedOut = (notice?: SignedOutNotice): AuthState => (notice ? { status: 'signedOut', notice } : { status: 'signedOut' });

describe('sign-in screen', () => {
  it('4.1-1 signs in with the button and shows the account email', async () => {
    const memory = createMemoryArea();
    await seed(memory);
    const auth = createFakeAuth({ initial: signedOut(), email: 'reader@example.test', area: memory });
    renderGate(memory, auth);

    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));
    expect(await screen.findByText('reader@example.test')).toBeInTheDocument();
    expect(await screen.findByText('Garden Notes')).toBeInTheDocument();
    expect(auth.calls).toEqual(['signIn']);
  });

  it('4.1-2 does not read the store before sign-in and shows its data after', async () => {
    const memory = createMemoryArea();
    await seed(memory);
    const { area, calls } = countingArea(memory);
    const auth = createFakeAuth({ initial: signedOut(), area: memory });
    renderGate(area, auth);

    expect(screen.getByRole('heading', { name: '로그인하세요' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
    expect(screen.queryByText('Garden Notes')).toBeNull();

    act(() => auth.setState({ status: 'signedIn', email: 'a@example.test' }));
    expect(await screen.findByText('Garden Notes')).toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('4.1-3 goes back to the sign-in screen with a notice when the sign-in expires', async () => {
    const memory = createMemoryArea();
    await seed(memory);
    const auth = createFakeAuth({ area: memory });
    renderGate(memory, auth);
    expect(await screen.findByText('Garden Notes')).toBeInTheDocument();

    act(() => auth.setState(signedOut('expired')));
    expect(screen.getByRole('status')).toHaveTextContent('로그인이 만료되었거나');
    expect(screen.queryByText('Garden Notes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Google로 로그인' })).toBeInTheDocument();
  });

  it('4.1-5 says the sign-in was cancelled without an error when the window is closed', async () => {
    const auth = createFakeAuth({ initial: signedOut() });
    auth.nextSignIn = 'cancelled';
    renderGate(createMemoryArea(), auth);

    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));
    expect(await screen.findByText('로그인을 취소했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Google로 로그인' })).toBeEnabled();
  });

  it('4.4-4 shows a waiting state while checking the sign-in and while the window is open', async () => {
    const auth = createFakeAuth({ initial: { status: 'loading' }, delayMs: 50 });
    renderGate(createMemoryArea(), auth);
    expect(screen.getByRole('status')).toHaveTextContent('로그인 상태를 확인하는 중입니다');

    act(() => auth.setState(signedOut()));
    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));
    expect(screen.getByRole('button', { name: '로그인하는 중입니다…' })).toBeDisabled();
    expect(screen.getByText('열린 Google 로그인 창에서 계정을 고르세요.')).toBeInTheDocument();
  });

  it('4.10-5 says the Firebase settings are missing instead of offering sign-in', () => {
    renderGate(createMemoryArea(), createFakeAuth({ initial: { status: 'unconfigured' } }));
    expect(screen.getByRole('heading', { name: 'Firebase 설정이 없습니다' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google로 로그인' })).toBeNull();
  });

  it('4.8-4 links to the privacy policy and copyright notice', () => {
    renderGate(createMemoryArea(), createFakeAuth({ initial: signedOut() }));
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', PRIVACY);
    expect(screen.getByRole('link', { name: '저작권 안내' })).toHaveAttribute('href', COPYRIGHT);
  });
});

describe('account bar', () => {
  it('4.1-4 signs out only after confirming', async () => {
    const memory = createMemoryArea();
    const auth = createFakeAuth({ area: memory });
    renderGate(memory, auth);

    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    const dialog = screen.getByRole('dialog', { name: '로그아웃할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(auth.calls).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByText(/로그아웃했습니다/)).toBeInTheDocument();
    expect(auth.calls).toEqual(['signOut']);
  });

  it('4.6-1 deletes the account only after a confirmation that offers a backup and the policy links', async () => {
    const memory = createMemoryArea();
    await seed(memory);
    const auth = createFakeAuth({ area: memory, email: 'leaving@example.test' });
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    renderGate(memory, auth);

    fireEvent.click(await screen.findByRole('button', { name: '탈퇴' }));
    const dialog = screen.getByRole('dialog', { name: '탈퇴하고 모든 데이터를 지울까요?' });
    expect(dialog).toHaveTextContent('되살릴 수 없습니다');
    expect(dialog).toHaveTextContent('leaving@example.test');
    expect(within(dialog).getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', PRIVACY);
    expect(auth.calls).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: '백업 내보내기' }));
    expect(await within(dialog).findByText(/내보냈습니다/)).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalled();
    expect(auth.calls).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: '탈퇴하고 모두 지우기' }));
    expect(await screen.findByText(/탈퇴했습니다/)).toBeInTheDocument();
    expect(auth.calls).toEqual(['deleteAccount']);
    expect(await memory.getKeys()).toEqual([]);
  });

  it('4.6-1 keeps the account when the deletion fails and says why', async () => {
    const memory = createMemoryArea();
    const auth = createFakeAuth({
      area: memory,
      onDeleteAccount: async () => {
        throw new StorageError('unavailable');
      },
    });
    renderGate(memory, auth);
    fireEvent.click(await screen.findByRole('button', { name: '탈퇴' }));
    fireEvent.click(screen.getByRole('button', { name: '탈퇴하고 모두 지우기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('인터넷에 연결되지 않아');
    expect(auth.getState().status).toBe('signedIn');
  });

  it('4.4-1 shows the usage against the 20 MB limit and marks it full at the limit', async () => {
    const auth = createFakeAuth({ usage: async () => 3.25 * 1024 * 1024 });
    renderGate(createMemoryArea(), auth);
    expect(await screen.findByText('사용량 3.3 MB / 20 MB')).toBeInTheDocument();

    const full = createFakeAuth({ usage: async () => 20 * 1024 * 1024 });
    renderGate(createMemoryArea(), full);
    expect(await screen.findByText(/사용량 20.0 MB \/ 20 MB · 가득 참/)).toBeInTheDocument();
  });
});

describe('storage error notices', () => {
  // 실패할 때 원래 문구에 uid가 든 오류를 낸다. 화면에는 그 문구가 보이면 안 된다.
  const failingArea = (code: StorageErrorCode): StorageArea => {
    const fail = async (): Promise<never> => {
      throw Object.assign(new Error('users/uid-SECRET-123/kv/memos-1 failed'), { code });
    };
    return { get: fail, getKeys: fail, set: fail, remove: fail, onChanged: () => () => {} };
  };

  const cases: [StorageErrorCode, RegExp, boolean][] = [
    ['resource-exhausted', /오늘 무료 사용량을 다 썼습니다.*태평양 시간 자정/, true],
    ['quota-exceeded', /저장 공간 20MB를 다 썼습니다/, false],
    ['unavailable', /인터넷에 연결되지 않아/, true],
    ['permission-denied', /권한이 없습니다/, false],
    ['unauthenticated', /로그인이 만료되었습니다/, false],
  ];

  it.each(cases)('4.2-6 4.4-2 4.4-3 shows its own notice for %s', async (code, text, retry) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderGate(failingArea(code), createFakeAuth({ usage: async () => 0 }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert.textContent).not.toContain('uid-SECRET-123');
    expect(within(alert).queryByRole('button', { name: '다시 시도' }) !== null).toBe(retry);
    for (const [other, otherText] of cases) {
      if (other !== code) expect(alert.textContent).not.toMatch(otherText);
    }
  });

  it('4.4-2 reads the store again after "다시 시도"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const memory = createMemoryArea();
    await seed(memory);
    let failing = true;
    const area: StorageArea = {
      get: (keys) => (failing ? Promise.reject(new StorageError('resource-exhausted')) : memory.get(keys)),
      getKeys: () => (failing ? Promise.reject(new StorageError('resource-exhausted')) : memory.getKeys()),
      set: (items) => memory.set(items),
      remove: (keys) => memory.remove(keys),
      onChanged: (l) => memory.onChanged(l),
    };
    renderGate(area, createFakeAuth({ usage: async () => 0 }));
    const alert = await screen.findByRole('alert');
    failing = false;
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('Garden Notes')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
