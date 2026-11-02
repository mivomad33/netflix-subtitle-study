import { MultiRoundChecklists } from '../../../types';

/**
 * 기존 단일 회차 형식의 체크리스트 데이터를 신규 다회차(N회독) 형식으로 안전하게 마이그레이션합니다.
 * @param savedData 로컬스토리지에서 파싱한 원본 데이터
 */
export const migrateChecklists = (savedData: any): MultiRoundChecklists => {
  if (!savedData) {
    return {
      currentActiveRound: 1,
      rounds: {
        1: {}
      }
    };
  }

  // 'rounds' 필드가 없는 경우 구버전 단일 회차 데이터로 판단하여 마이그레이션 진행
  if (typeof savedData === 'object' && !savedData.rounds) {
    return {
      currentActiveRound: 1,
      rounds: {
        1: savedData
      }
    };
  }

  const currentActiveRound = Number(savedData.currentActiveRound) || 1;
  const rounds = savedData.rounds || { 1: {} };

  // 최소한 1회차 데이터 구조는 보장되도록 설정
  if (!rounds[1]) {
    rounds[1] = {};
  }

  return {
    currentActiveRound,
    rounds
  };
};
