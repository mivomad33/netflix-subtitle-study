import React, { useState, useEffect } from 'react';
import './StudyDashboardModal.css';
import { STORAGE_KEYS } from './constants/storageKeys';
import { migrateChecklists } from './utils/checklistMigrator';
import { getStoreClient } from './utils/storeClient';
import { ExtensionPage } from '../../shared/bridge/protocol';

interface StudiedVideo {
  videoId: string;
  title: string;
  cover: string;
  epTitle: string;
  epSeq: number;
  seasonSeq: number;
  totalPages: number;
  updatedAt: number;
  completedPages: number;
  currentActiveRound: number;
}

interface StudyDashboardModalProps {
  onClose: () => void;
}

const StudyDashboardModal: React.FC<StudyDashboardModalProps> = ({ onClose }) => {
  const [videos, setVideos] = useState<StudiedVideo[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS);
      const studiedVideos = saved ? JSON.parse(saved) : {};

      const list = Object.values(studiedVideos).map((video: any) => {
        // 개별 체크리스트 완료 수 파싱
        const checklistSaved = localStorage.getItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}${video.videoId}`);
        const parsedChecklists = checklistSaved ? JSON.parse(checklistSaved) : null;
        const checklists = migrateChecklists(parsedChecklists);

        const activeRound = checklists.currentActiveRound;
        const activeRoundData = checklists.rounds[activeRound] || {};

        let completedPagesCount = 0;
        for (let i = 0; i < video.totalPages; i++) {
          const pageData = activeRoundData[i];
          if (
            pageData &&
            pageData.preStudy &&
            pageData.noSubtitles &&
            pageData.scriptAnalysis &&
            pageData.shadowing &&
            pageData.speaking
          ) {
            completedPagesCount++;
          }
        }

        return {
          ...video,
          completedPages: completedPagesCount,
          currentActiveRound: activeRound,
        } as StudiedVideo;
      });

      // 최신 학습 순으로 정렬
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setVideos(list);
    } catch (e) {
      console.error('Failed to load studied videos:', e);
    }
  }, []);

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

    try {
      // 1. 레지스트리에서 삭제
      const saved = localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS);
      const studiedVideos = saved ? JSON.parse(saved) : {};
      delete studiedVideos[videoId];
      localStorage.setItem(STORAGE_KEYS.STUDIED_VIDEOS, JSON.stringify(studiedVideos));

      // 2. 체크리스트 삭제
      localStorage.removeItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}${videoId}`);

      // 3. 상태 갱신
      setVideos((prev) => prev.filter((video) => video.videoId !== videoId));
    } catch (e) {
      console.error('Failed to delete studied video:', e);
      alert('학습 기록 삭제 중 오류가 발생했습니다.');
    }
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

        {videos.length === 0 ? (
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
