import React, { useCallback, useEffect, useState } from 'react';
import { Route, parseRoute, routeHash } from './route';
import { BookList } from './components/BookList';
import { BookImport } from './components/BookImport';
import { BookReader } from './components/BookReader';
import { MemoCollection } from './components/MemoCollection';
import { BackupControls } from './components/BackupControls';
import './Reader.css';

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const handle = () => setRoute(parseRoute(window.location.hash));
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
  const [route, navigate] = useHashRoute();
  // 백업을 가져오면 모든 화면이 저장소를 다시 읽게 한다.
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    document.title =
      route.name === 'memos' ? '메모 모아 보기' : route.name === 'import' ? '책 등록' : '원서 리더';
  }, [route.name]);

  const isMemos = route.name === 'memos';
  return (
    <div className="nfr-app">
      <header className="nfr-header">
        <nav className="nfr-nav" aria-label="화면">
          <a className={`nfr-nav-link ${!isMemos ? 'active' : ''}`} href="#/" aria-current={!isMemos ? 'page' : undefined}>
            원서 리더
          </a>
          <a className={`nfr-nav-link ${isMemos ? 'active' : ''}`} href="#/memos" aria-current={isMemos ? 'page' : undefined}>
            메모 모아 보기
          </a>
        </nav>
        <BackupControls onImported={() => setDataVersion((v) => v + 1)} />
      </header>
      <main className="nfr-main" key={dataVersion}>
        {route.name === 'books' && <BookList navigate={navigate} />}
        {route.name === 'import' && <BookImport navigate={navigate} />}
        {route.name === 'book' && (
          <BookReader
            key={`${route.bookId}:${route.chapterId ?? ''}:${route.memoId ?? ''}`}
            bookId={route.bookId}
            initialChapterId={route.chapterId}
            initialMemoId={route.memoId}
            navigate={navigate}
          />
        )}
        {route.name === 'memos' && <MemoCollection navigate={navigate} />}
      </main>
    </div>
  );
};

export default App;
