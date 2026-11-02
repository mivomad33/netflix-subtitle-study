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


