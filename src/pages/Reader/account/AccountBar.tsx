import React, { useEffect, useState } from 'react';
import { AuthClient } from '../../../shared/auth/types';
import { toStorageErrorCode } from '../../../shared/storage/errors';
import { USAGE_LIMIT_BYTES } from '../../../shared/storage/firestoreLayout';
import { storageErrorMessage } from '../../../shared/ui/storageErrors';
import { useReaderEnv } from '../env';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { downloadBackup } from '../components/BackupControls';
import { useAuthState } from './AuthGate';
import { PolicyLinks } from './PolicyLinks';

const MB = 1024 * 1024;
export const formatUsage = (bytes: number) =>
  `사용량 ${(Math.min(bytes, USAGE_LIMIT_BYTES * 10) / MB).toFixed(1)} MB / ${USAGE_LIMIT_BYTES / MB} MB`;

// 저장량(4.4-1). 데이터가 바뀌면 잠시 뒤 다시 센다.
function useUsage(auth: AuthClient) {
  const { area } = useReaderEnv();
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      auth
        .usage()
        .then((n) => {
          if (!cancelled) setBytes(n);
        })
        .catch(() => {
          // 사용량은 저장소 오류 안내가 따로 알린다.
        });
    load();
    const unsubscribe = area.onChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [auth, area]);
  return bytes;
}

type Dialog = 'signOut' | 'delete' | null;

// 머리글의 계정 표시: 이메일, 사용량, 로그아웃, 탈퇴(4.1-1, 4.4-1, 4.6-1).
export const AccountBar: React.FC<{ auth: AuthClient }> = ({ auth }) => {
  const { area } = useReaderEnv();
  const state = useAuthState(auth);
  const usage = useUsage(auth);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupNote, setBackupNote] = useState<string | null>(null);

  const open = (next: Dialog) => {
    setError(null);
    setBackupNote(null);
    setDialog(next);
  };
  const close = () => {
    if (!busy) setDialog(null);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      // 성공하면 로그인 화면으로 바뀌어 이 화면은 사라진다.
    } catch (e) {
      setError(storageErrorMessage(toStorageErrorCode(e)));
      setBusy(false);
    }
  };

  const exportFirst = async () => {
    setBackupNote(null);
    try {
      const { filename } = await downloadBackup(area);
      setBackupNote(`${filename}로 내보냈습니다.`);
    } catch (e) {
      setBackupNote(`내보내지 못했습니다. ${storageErrorMessage(toStorageErrorCode(e))}`);
    }
  };

  const email = state.status === 'signedIn' ? state.email : '';
  const full = usage !== null && usage >= USAGE_LIMIT_BYTES;

  return (
    <div className="nfr-account">
      <span className="nfr-account-email" title="로그인한 계정">
        {email}
      </span>
      <span className={`nfr-account-usage ${full ? 'full' : ''}`} aria-live="polite">
        {usage === null ? '사용량 확인 중…' : formatUsage(usage)}
        {full && ' · 가득 참'}
      </span>
      <button type="button" className="nfr-btn" onClick={() => open('signOut')}>
        로그아웃
      </button>
      <button type="button" className="nfr-btn nfr-btn-danger" onClick={() => open('delete')}>
        탈퇴
      </button>

      <ConfirmDialog
        open={dialog === 'signOut'}
        title="로그아웃할까요?"
        onClose={close}
        actions={
          <>
            <button type="button" className="nfr-btn" onClick={close} disabled={busy} autoFocus>
              취소
            </button>
            <button
              type="button"
              className="nfr-btn nfr-btn-primary"
              onClick={() => run(() => auth.signOut())}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? '로그아웃하는 중입니다…' : '로그아웃'}
            </button>
          </>
        }
      >
        <p>데이터는 계정에 남아 다시 로그인하면 보입니다. 이 PC에 남은 임시 사본은 지웁니다.</p>
        {error && (
          <p className="nfr-dialog-error" role="alert">
            {error}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="탈퇴하고 모든 데이터를 지울까요?"
        onClose={close}
        actions={
          <>
            <button type="button" className="nfr-btn" onClick={close} disabled={busy} autoFocus>
              취소
            </button>
            <button
              type="button"
              className="nfr-btn nfr-btn-danger"
              onClick={() => run(() => auth.deleteAccount())}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? '지우는 중입니다…' : '탈퇴하고 모두 지우기'}
            </button>
          </>
        }
      >
        <p>
          <strong>{email}</strong> 계정의 책과 본문, 메모, 읽던 위치, 학습 완료, 설정, 넷플릭스 학습 기록을 모두 지우고
          로그인 계정도 지웁니다. 지운 데이터는 되살릴 수 없습니다.
        </p>
        <p>남기고 싶은 것이 있으면 먼저 백업 파일을 받아 두세요.</p>
        <p>
          <button type="button" className="nfr-btn" onClick={exportFirst} disabled={busy}>
            백업 내보내기
          </button>
          {backupNote && (
            <span className="nfr-dialog-note" role="status">
              {' '}
              {backupNote}
            </span>
          )}
        </p>
        {error && (
          <p className="nfr-dialog-error" role="alert">
            {error}
          </p>
        )}
        <PolicyLinks />
      </ConfirmDialog>
    </div>
  );
};
