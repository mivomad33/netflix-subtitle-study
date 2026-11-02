import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudyDashboardModal from './StudyDashboardModal';
import { STORAGE_KEYS } from './constants/storageKeys';

describe('StudyDashboardModal Component', () => {
  const mockClose = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders empty message when no studied videos exist in localStorage', () => {
    render(<StudyDashboardModal onClose={mockClose} />);

    expect(screen.getByText('아직 학습 중인 영상이 없습니다.')).toBeInTheDocument();
  });

  it('renders studied video card list correctly from localStorage registry', () => {
    const mockVideos = {
      '12345': {
        videoId: '12345',
        title: 'Stranger Things',
        cover: 'http://example.com/cover.jpg',
        epTitle: 'Chapter One',
        epSeq: 1,
        seasonSeq: 1,
        totalPages: 10,
        updatedAt: Date.now(),
      },
    };
    localStorage.setItem(STORAGE_KEYS.STUDIED_VIDEOS, JSON.stringify(mockVideos));

    // 페이지 체크리스트 일부 채워두기 (진척도 파싱 검증)
    const mockChecklist = {
      '0': { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
      '1': { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
    };
    localStorage.setItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}12345`, JSON.stringify(mockChecklist));

    render(<StudyDashboardModal onClose={mockClose} />);

    expect(screen.getByText('Stranger Things')).toBeInTheDocument();
    expect(screen.getByText('시즌 1 - 1화: Chapter One')).toBeInTheDocument();
    expect(screen.getByText('2 / 10 페이지 완료')).toBeInTheDocument();
    expect(screen.getByText('20% 완료')).toBeInTheDocument(); // 2 / 10 = 20%
  });

  it('deletes studied video when delete button is clicked and confirmed', async () => {
    const mockVideos = {
      '12345': {
        videoId: '12345',
        title: 'Stranger Things',
        cover: 'http://example.com/cover.jpg',
        epTitle: 'Chapter One',
        epSeq: 1,
        seasonSeq: 1,
        totalPages: 10,
        updatedAt: Date.now(),
      },
    };
    localStorage.setItem(STORAGE_KEYS.STUDIED_VIDEOS, JSON.stringify(mockVideos));
    localStorage.setItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}12345`, JSON.stringify({}));

    // window.confirm Mocking
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<StudyDashboardModal onClose={mockClose} />);

    expect(screen.getByText('Stranger Things')).toBeInTheDocument();

    const deleteBtn = screen.getByTitle('학습 기록 삭제');
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();

    // 화면에서 지워지고 스토리지도 비어 있는지 검증
    await waitFor(() => {
      expect(screen.queryByText('Stranger Things')).toBeNull();
    });

    const saved = localStorage.getItem(STORAGE_KEYS.STUDIED_VIDEOS);
    expect(JSON.parse(saved!)).toEqual({});
    expect(localStorage.getItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}12345`)).toBeNull();
  });

  it('renders studied video card with multi-round information correctly', () => {
    const mockVideos = {
      '67890': {
        videoId: '67890',
        title: 'Breaking Bad',
        cover: 'http://example.com/cover2.jpg',
        epTitle: 'Pilot',
        epSeq: 1,
        seasonSeq: 1,
        totalPages: 5,
        updatedAt: Date.now(),
      },
    };
    localStorage.setItem(STORAGE_KEYS.STUDIED_VIDEOS, JSON.stringify(mockVideos));

    const mockMultiRoundChecklist = {
      currentActiveRound: 2,
      rounds: {
        1: {
          0: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
          1: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
          2: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
          3: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
          4: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
        },
        2: {
          0: { preStudy: true, noSubtitles: true, scriptAnalysis: true, shadowing: true, speaking: true },
        }
      }
    };
    localStorage.setItem(`${STORAGE_KEYS.CHECKLIST_PREFIX}67890`, JSON.stringify(mockMultiRoundChecklist));

    render(<StudyDashboardModal onClose={mockClose} />);

    expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    expect(screen.getByText('🏆 1회 완독')).toBeInTheDocument();
    expect(screen.getByText('🔥 2회차 진행 중')).toBeInTheDocument();
    expect(screen.getByText('1 / 5 페이지 완료')).toBeInTheDocument();
  });
});
