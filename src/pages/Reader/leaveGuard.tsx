import { createContext, useContext } from 'react';

// 저장하지 않은 수정이 있는 화면이 앱에 알린다. 알린 동안 앱은 다른 화면으로 가기 전에 확인받는다(book-edit 4.3-11).
export interface LeaveGuard {
  setDirty(dirty: boolean): void;
}

const LeaveGuardContext = createContext<LeaveGuard>({ setDirty() {} });

export const LeaveGuardProvider = LeaveGuardContext.Provider;

export const useLeaveGuard = () => useContext(LeaveGuardContext);
