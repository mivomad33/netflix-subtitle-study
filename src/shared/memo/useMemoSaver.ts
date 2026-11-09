import { useEffect, useMemo, useRef } from 'react';
import { Memo } from './types';
import { MemoSaver, createMemoSaver } from './memoSaver';

// 화면에서 쓰는 메모 저장 묶기. 화면을 닫거나 페이지를 떠날 때 기다리던 저장을 바로 한다.
export function useMemoSaver(write: (memo: Memo) => void): MemoSaver {
  const writeRef = useRef(write);
  writeRef.current = write;
  const saver = useMemo(() => createMemoSaver((memo) => writeRef.current(memo)), []);
  useEffect(() => {
    const flush = () => saver.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      saver.flush();
    };
  }, [saver]);
  return saver;
}
