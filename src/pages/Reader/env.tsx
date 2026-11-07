import React, { createContext, useContext } from 'react';
import { StorageArea } from '../../shared/storage/storageArea';

// 원서 리더·모아 보기 화면이 쓰는 바깥 기능. 확장 프로그램에서는 chrome.*, 개발 서버와 테스트에서는 대체를 넣는다.
export interface ReaderEnv {
  area: StorageArea;
  openTab: (url: string) => void;
}

const EnvContext = createContext<ReaderEnv | null>(null);

export const ReaderEnvProvider: React.FC<{ env: ReaderEnv; children: React.ReactNode }> = ({
  env,
  children,
}) => <EnvContext.Provider value={env}>{children}</EnvContext.Provider>;

export function useReaderEnv(): ReaderEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error('ReaderEnvProvider is missing');
  return env;
}
