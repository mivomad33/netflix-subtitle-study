import React, { useState, useEffect, useCallback, useRef } from 'react';
import './StudyDashboardModal.css';
import { migrateChecklists } from './utils/checklistMigrator';
import { getStoreClient } from './utils/storeClient';
import { ExtensionPage } from '../../shared/bridge/protocol';
import { StudiedVideoRecord } from '../../shared/bridge/netflixRecords';
import { PageChecklist } from '../../types';
import { reportStorageError, storeRead, storeWrite, useStoreEvent, useStudyAuth } from './utils/studyStore';
import { LoginNotice, StorageErrorNotice, WaitingNotice } from './components/StudyNotices';

interface StudiedVideo extends StudiedVideoRecord {
  completedPages: number;
  currentActiveRound: number;
}

interface StudyDashboardModalProps {
  onClose: () => void;
}

const isPageDone = (page: PageChecklist | undefined) =>
  !!page && page.preStudy && page.noSubtitles && page.scriptAnalysis && page.shadowing && page.speaking;

// 공부한 영상 하나의 진행 정도. 그 영상의 체크리스트를 따로 읽는다.
async function withProgress(video: StudiedVideoRecord): Promise<StudiedVideo> {
  const stored = await storeRead<unknown>({ op: 'checklist.get', videoId: video.videoId });
  const checklists = migrateChecklists(stored ?? null);
  const activeRound = checklists.currentActiveRound;
  const activeRoundData = checklists.rounds[activeRound] || {};
  let completedPages = 0;
  for (let i = 0; i < video.totalPages; i++) {
    if (isPageDone(activeRoundData[i])) completedPages++;
  }
  return { ...video, completedPages, currentActiveRound: activeRound };
}

const StudyDashboardModal: React.FC<StudyDashboardModalProps> = ({ onClose }) => {
  const auth = useStudyAuth();
  const [videos, setVideos] = useState<StudiedVideo[] | null>(null);
  const loadSeq = useRef(0);

  // 로그인했을 때만 공부한 영상 목록과 영상마다 체크리스트를 읽는다(4.1-2).
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    storeRead<StudiedVideoRecord[]>({ op: 'studied.list' })
      .then((list) => Promise.all(list.map(withProgress)))
      .then((list) => {
        if (seq !== loadSeq.current) return;
        // 최신 학습 순으로 정렬
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        setVideos(list);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setVideos((prev) => prev ?? []);
        reportStorageError(e, load);
      });
  }, []);

  useEffect(() => {
    setVideos(null);
    if (auth === 'in') load();
    else loadSeq.current++;
  }, [auth, load]);

  // 다른 곳에서 공부한 영상이나 체크리스트가 바뀌면 다시 읽는다(4.2-3).
  useStoreEvent((event) => {
    if (auth !== 'in' || event.event !== 'changed') return;
    if (event.scope === 'studied' || event.scope === 'checklist' || event.scope === 'all') load();
  });

  // 확장 프로그램 화면은 넷플릭스 페이지에서 바로 열 수 없어 content script에 부탁한다.
  const openExtensionPage = (page: ExtensionPage) => {
    getStoreClient()
      .call({ op: 'page.open', page })
      .catch((e) => console.error('[NF-STUDY] Failed to open page:', e));
  };

  const handleDeleteVideo = (videoId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      !window.confirm(
        '이 영상의 모든 학습 기록과 진척 상황을 정말로 삭제하시겠습니까?'
      )
    ) {
      return;
    }

    // 화면에서 먼저 지우고, 공부한 영상 기록과 그 영상의 체크리스트를 지운다. 메모는 남긴다.
    setVideos((prev) => (prev ?? []).filter((video) => video.videoId !== videoId));
    storeWrite({ op: 'studied.delete', videoId });
    storeWrite({ op: 'checklist.delete', videoId });
  };

  return (
    <div className="dashboard-overlay" onClick={onClose}>
      <div className="dashboard-content" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-header">
          <h2>📊 나의 학습 대시보드</h2>
          <div className="dashboard-links">
            <button type="button" className="dashboard-link-btn" onClick={() => openExtensionPage('memos')}>
              메모 모아 보기
            </button>
            <button type="button" className="dashboard-link-btn" onClick={() => openExtensionPage('reader')}>
              원서 리더
            </button>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="dashboard-notices">
          <StorageErrorNotice tone="dark" />
          {auth !== 'in' && <LoginNotice auth={auth} tone="dark" />}
          {auth === 'in' && videos === null && <WaitingNotice text="학습 기록을 불러오는 중…" tone="dark" />}
        </div>

        {auth !== 'in' || videos === null ? null : videos.length === 0 ? (
          <div className="empty-dashboard">
            <p>아직 학습 중인 영상이 없습니다.</p>
            <p className="sub-text">넷플릭스 영상을 재생하고 학습 창(StudyPanel)에서 체크리스트 단계를 채우면 자동으로 대시보드에 기록됩니다!</p>
          </div>
        ) : (
          <div className="video-grid">
            {videos.map((video) => {
              const percent = video.totalPages > 0 
                ? Math.round((video.completedPages / video.totalPages) * 100) 
                : 0;

              return (
                <div key={video.videoId} className="video-card">
                  <div className="card-cover">
                    <img src={video.cover} alt={video.title} />
                    <button
                      className="delete-card-btn"
                      onClick={(e) => handleDeleteVideo(video.videoId, e)}
                      title="학습 기록 삭제"
                    >
                      &times;
                    </button>
                    <span className="percent-badge">{percent}% 완료</span>
                  </div>
                  <div className="card-details">
                    <h3 className="video-title">{video.title}</h3>
                    <p className="episode-title">
                      시즌 {video.seasonSeq} - {video.epSeq}화: {video.epTitle || '제목 없음'}
                    </p>
                    <div className="round-badge-container">
                      {video.currentActiveRound > 1 && (
                        <span className="round-badge completed">
                          🏆 {video.currentActiveRound - 1}회 완독
                        </span>
                      )}
                      <span className="round-badge active">
                        🔥 {video.currentActiveRound}회차 진행 중
                      </span>
                    </div>
                    <div className="progress-container">
                      <div className="progress-bar-wrapper">
                        <div className="progress-bar" style={{ width: `${percent}%` }}></div>
                      </div>
                      <span className="progress-text">
                        {video.completedPages} / {video.totalPages} 페이지 완료
                      </span>
                    </div>
                    <a
                      href={`/watch/${video.videoId}`}
                      className="continue-btn"
                    >
                      이어보기 ➡️
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyDashboardModal;
