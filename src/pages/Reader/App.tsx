import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StorageErrorCode } from '../../shared/storage/errors';
import { Route, parseRoute, routeHash } from './route';
import { BookList } from './components/BookList';
import { BookImport } from './components/BookImport';
import { BookReader } from './components/BookReader';
import { BookEditor } from './components/BookEditor';
import { ChapterEditor } from './components/ChapterEditor';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LeaveGuardProvider } from './leaveGuard';
import { MemoCollection } from './components/MemoCollection';
import { BackupControls } from './components/BackupControls';
import { StorageErrorNotice } from './components/StorageErrorNotice';
import { ReaderEnvProvider, useReaderEnv } from './env';
import { reportingArea } from './logic/reportingArea';
import { useAuthClient } from './account/AuthGate';
import { AccountBar } from './account/AccountBar';
import './Reader.css';

// block이 참을 돌려주면 그 이동을 막고 주소를 지금 화면의 것으로 되돌린다.
export function useHashRoute(
  block?: (next: Route) => boolean
): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash)
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const blockRef = useRef(block);
  blockRef.current = block;
  useEffect(() => {
    const handle = () => {
      const next = parseRoute(window.location.hash);
      const current = routeHash(routeRef.current);
      if (routeHash(next) !== current && blockRef.current?.(next)) {
        window.location.hash = current;
        return;
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);
  const navigate = useCallback((next: Route) => {
    const hash = routeHash(next);
    if (window.location.hash === hash) setRoute(next);
    else window.location.hash = hash;
  }, []);
  return [route, navigate];
}

const App: React.FC = () => {
  // 저장하지 않은 수정이 있으면 다른 화면으로 가기 전에 확인받는다.
  const dirty = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<Route | null>(null);
  const [route, navigate] = useHashRoute((next) => {
    if (!dirty.current) return false;
    setPendingLeave(next);
    return true;
  });
  // 모든 화면이 저장소를 다시 읽게 한다. 저장하지 않은 수정이 있는 화면은 다시 만들지 않는다
  // (고친 글이 사라진다). 그 화면은 저장할 때 저장소의 지금 값과 맞춰 본다.
  const reload = useCallback(() => {
    if (!dirty.current) setDataVersion((v) => v + 1);
  }, []);
  // 탭을 닫거나 새로 고칠 때는 브라우저가 묻게 한다.
  useEffect(() => {
    const handle = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, []);
  const leaveGuard = useMemo(
    () => ({
      setDirty(value: boolean) {
        dirty.current = value;
      },
    }),
    []
  );
  // 백업을 가져오거나 오류 뒤 다시 시도하면 모든 화면이 저장소를 다시 읽게 한다.
  const [dataVersion, setDataVersion] = useState(0);
  const env = useReaderEnv();
  const auth = useAuthClient();
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(
    null
  );
  const appEnv = useMemo(
    () => ({ ...env, area: reportingArea(env.area, setStorageError) }),
    [env]
  );

  useEffect(() => {
    document.title =
      route.name === 'memos'
        ? '메모 모아 보기'
        : route.name === 'import'
        ? '책 등록'
        : route.name === 'edit' || route.name === 'editChapter'
        ? '책 편집'
        : '원서 리더';
  }, [route.name]);

  const isMemos = route.name === 'memos';
  return (
    <ReaderEnvProvider env={appEnv}>
      <LeaveGuardProvider value={leaveGuard}>
      <div className="nfr-app">
        <header className="nfr-header">
          <nav className="nfr-nav" aria-label="화면">
            <a
              className={`nfr-nav-link ${!isMemos ? 'active' : ''}`}
              href="#/"
              aria-current={!isMemos ? 'page' : undefined}
            >
              원서 리더
            </a>
            <a
              className={`nfr-nav-link ${isMemos ? 'active' : ''}`}
              href="#/memos"
              aria-current={isMemos ? 'page' : undefined}
            >
              메모 모아 보기
            </a>
          </nav>
          <BackupControls onImported={reload} />
          {auth && <AccountBar auth={auth} />}
        </header>
        {storageError && (
          <StorageErrorNotice
            code={storageError}
            onClose={() => setStorageError(null)}
            onRetry={() => {
              setStorageError(null);
              reload();
            }}
          />
        )}
        <main className="nfr-main" key={dataVersion}>
          {route.name === 'books' && <BookList navigate={navigate} />}
          {route.name === 'import' && <BookImport navigate={navigate} />}
          {route.name === 'book' && (
            <BookReader
              key={`${route.bookId}:${route.chapterId ?? ''}:${
                route.memoId ?? ''
              }`}
              bookId={route.bookId}
              initialChapterId={route.chapterId}
              initialMemoId={route.memoId}
              navigate={navigate}
            />
          )}
          {route.name === 'edit' && (
            <BookEditor key={route.bookId} bookId={route.bookId} navigate={navigate} />
          )}
          {route.name === 'editChapter' && (
            <ChapterEditor
              key={`${route.bookId}:${route.chapterId}`}
              bookId={route.bookId}
              chapterId={route.chapterId}
              from={route.from}
              navigate={navigate}
            />
          )}
          {route.name === 'memos' && <MemoCollection navigate={navigate} />}
        </main>
        <ConfirmDialog
          open={pendingLeave !== null}
          title="저장하지 않은 수정이 있습니다"
          onClose={() => setPendingLeave(null)}
          actions={
            <>
              <button type="button" className="nfr-btn" autoFocus onClick={() => setPendingLeave(null)}>
                계속 고치기
              </button>
              <button
                type="button"
                className="nfr-btn nfr-btn-danger"
                onClick={() => {
                  const next = pendingLeave;
                  dirty.current = false;
                  setPendingLeave(null);
                  if (next) navigate(next);
                }}
              >
                저장하지 않고 나가기
              </button>
            </>
          }
        >
          <p>지금 나가면 고친 내용이 사라집니다. 나갈까요?</p>
        </ConfirmDialog>
      </div>
      </LeaveGuardProvider>
    </ReaderEnvProvider>
  );
};

export default App;
