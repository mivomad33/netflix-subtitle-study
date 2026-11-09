import React from 'react';
import { StorageErrorCode } from '../../../shared/storage/errors';
import { isRetryable, storageErrorMessage } from '../../../shared/ui/storageErrors';

// 저장소 오류 안내(4.4-2, 4.4-3). 종류별 문구만 보이고 원래 오류 문구는 보이지 않는다.
export const StorageErrorNotice: React.FC<{
  code: StorageErrorCode;
  onRetry: () => void;
  onClose: () => void;
}> = ({ code, onRetry, onClose }) => (
  <div className={`nfr-storage-error ${code}`} role="alert">
    <span>{storageErrorMessage(code)}</span>
    {isRetryable(code) && (
      <button type="button" className="nfr-btn" onClick={onRetry}>
        다시 시도
      </button>
    )}
    <button type="button" className="nfr-icon-btn" aria-label="안내 닫기" onClick={onClose}>
      ×
    </button>
  </div>
);
