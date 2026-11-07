import React, { useRef, useState } from 'react';
import { useReaderEnv } from '../env';
import { exportBackup, mergeBackup, parseBackup } from '../logic/backup';

// 공통 저장소 전체를 JSON 파일 하나로 내보내고, 내보낸 파일을 지금 데이터와 합친다.
export const BackupControls: React.FC<{ onImported: () => void }> = ({ onImported }) => {
  const { area } = useReaderEnv();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setMessage(null);
    try {
      const { filename, json, counts } = await exportBackup(area);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ kind: 'info', text: `책 ${counts.books}권, 메모 ${counts.memos}개를 ${filename}로 내보냈습니다.` });
    } catch (e) {
      console.error('[NF-STUDY] Backup export failed:', e);
      setMessage({ kind: 'error', text: '내보내지 못했습니다. 다시 시도해 주세요.' });
    }
  };

  const handleFile = async (file: File) => {
    setMessage(null);
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setMessage({ kind: 'error', text: `가져오지 못했습니다. ${parsed.error} 데이터는 바뀌지 않았습니다.` });
      return;
    }
    const { books, memos } = parsed.counts;
    if (!window.confirm(`백업 파일의 책 ${books}권, 메모 ${memos}개를 지금 데이터와 합칩니다. 같은 항목은 더 최근에 고친 쪽이 남습니다. 계속할까요?`)) {
      return;
    }
    setBusy(true);
    try {
      await mergeBackup(area, parsed.backup);
      setMessage({ kind: 'info', text: `책 ${books}권, 메모 ${memos}개를 합쳤습니다.` });
      onImported();
    } catch (e) {
      console.error('[NF-STUDY] Backup import failed:', e);
      setMessage({ kind: 'error', text: '저장하지 못했습니다. 데이터는 바뀌지 않았습니다.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfr-backup">
      <button type="button" className="nfr-btn" onClick={handleExport}>
        백업 내보내기
      </button>
      <button type="button" className="nfr-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? '합치는 중입니다…' : '백업 가져오기'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="백업 파일 고르기"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      {message && (
        <div className={`nfr-backup-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
          <button type="button" className="nfr-icon-btn" aria-label="안내 닫기" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};
