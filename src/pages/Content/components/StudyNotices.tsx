import React from 'react';
import { isRetryable, storageErrorMessage } from '../../../shared/ui/storageErrors';
import {
  AuthState,
  dismissStorageNotice,
  openLoginPage,
  retryStorageNotice,
  useStudyStore,
} from '../utils/studyStore';
import './StudyNotices.css';

type Tone = 'light' | 'dark';

// 저장이 필요한 자리(체크리스트, 메모, 대시보드)에 보이는 로그인 안내.
// 로그인 상태를 아직 모르면 대기 표시를 보인다(4.4-4). 넷플릭스에서는 로그인하지 않고 확장 프로그램 화면을 연다(4.1-2).
export const LoginNotice: React.FC<{ auth: AuthState; tone?: Tone }> = ({ auth, tone = 'light' }) => {
  if (auth === 'in') return null;
  if (auth === 'unknown') return <WaitingNotice text="로그인 상태를 확인하는 중…" tone={tone} />;
  return (
    <div className={`study-notice study-notice-${tone}`} role="note">
      <span className="study-notice-text">
        로그인하면 메모·체크리스트·학습 기록이 저장됩니다. 지금은 자막 학습 기능만 기본 설정으로 쓸 수 있습니다.
      </span>
      <button type="button" className="study-notice-btn study-notice-btn-primary" onClick={openLoginPage}>
        로그인 화면 열기
      </button>
    </div>
  );
};

export const WaitingNotice: React.FC<{ text: string; tone?: Tone }> = ({ text, tone = 'light' }) => (
  <div className={`study-notice study-notice-${tone} study-notice-waiting`} role="status">
    <span className="study-spinner" aria-hidden="true" />
    <span className="study-notice-text">{text}</span>
  </div>
);

// 저장·읽기 실패 안내. 오류 종류마다 정해 둔 문구만 보이고 원래 오류 문구는 보이지 않는다(4.4-3).
export const StorageErrorNotice: React.FC<{ tone?: Tone }> = ({ tone = 'light' }) => {
  const { notice } = useStudyStore();
  if (!notice) return null;
  const relogin = notice.code === 'unauthenticated' || notice.code === 'permission-denied';
  return (
    <div className={`study-notice study-notice-${tone} study-notice-error`} role="alert" data-code={notice.code}>
      <span className="study-notice-text">{storageErrorMessage(notice.code)}</span>
      <div className="study-notice-actions">
        {isRetryable(notice.code) && notice.retry && (
          <button type="button" className="study-notice-btn study-notice-btn-primary" onClick={retryStorageNotice}>
            다시 시도
          </button>
        )}
        {relogin && (
          <button type="button" className="study-notice-btn" onClick={openLoginPage}>
            로그인 화면 열기
          </button>
        )}
        <button type="button" className="study-notice-btn" onClick={dismissStorageNotice}>
          닫기
        </button>
      </div>
    </div>
  );
};
