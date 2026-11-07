export interface VideoMetadata {
  _metadataObject: {
    video: {
      id: string;
      artwork: { url: string }[];
      title: string;
      seasons: {
        seq: number;
        episodes: { id: number; seq: number; title: string }[];
      }[];
    };
  };
}

export interface PageChecklist {
  preStudy: boolean;       // 사전 학습
  noSubtitles: boolean;    // 무자막 시청
  scriptAnalysis: boolean; // 스크립트 해석
  shadowing: boolean;      // 쉐도잉
  speaking: boolean;       // 회화 (Gemini Live)
}

export interface VideoChecklists {
  [pageIndex: number]: PageChecklist;
}

export interface MultiRoundChecklists {
  currentActiveRound: number;
  rounds: {
    [round: number]: {
      [pageIndex: number]: PageChecklist;
    };
  };
}



// 영어 대사의 일부에 단 하이라이트. note가 비어 있으면 하이라이트만 있는 것이다.
export interface SentenceAnnotation {
  id: string;
  sentenceStartMs: number; // 붙어 있는 문장의 시작 시간
  sentenceText: string;    // 붙어 있는 문장의 영어 원문
  start: number;           // 문장 원문 안의 시작 위치(포함)
  end: number;             // 문장 원문 안의 끝 위치(제외)
  quote: string;           // 고른 글
  note: string;            // 메모
  createdAt: number;
  updatedAt: number;
}
