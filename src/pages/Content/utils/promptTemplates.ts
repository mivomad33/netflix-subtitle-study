// Prompt templates & clipboard copy utility for netflix-subtitle-study

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

export const copyStudyPrompt = (
  currentPageSentences: { text: string; hTranslation: string; startTime_ms: number }[],
  onSuccess: () => void
) => {
  const formattedSentences = currentPageSentences
    .map((sentence) => {
      const timeStr = formatTime(sentence.startTime_ms);
      return `[${timeStr}] ${sentence.text} / ${sentence.hTranslation}`;
    })
    .join('\n');

  const promptText = `너는 전문적인 영어 학습 멘토야.
내가 영어-한글 자막을 제공하면 분석해서, 학습자가 영상을 보기 전에 반드시 익혀야 할 내용을 정리해줘.

1. 필수 학습 표현
2. 바로 써먹는 패턴
3. 핵심 단어 리스트

--------------------------------------------------
[대본 목록]
${formattedSentences}`;

  navigator.clipboard
    .writeText(promptText)
    .then(onSuccess)
    .catch((err) => {
      console.error('Failed to copy prompt:', err);
      alert('프롬프트 복사에 실패했습니다.');
    });
};

export const copySpeakingPrompt = (
  currentPageSentences: { text: string; hTranslation: string; startTime_ms: number }[],
  onSuccess: () => void
) => {
  const formattedSentences = currentPageSentences
    .map((sentence) => {
      const timeStr = formatTime(sentence.startTime_ms);
      return `[${timeStr}] ${sentence.text} / ${sentence.hTranslation}`;
    })
    .join('\n');

  const promptText = `너는 전문적인 영어 학습 멘토야.
내가 영어-한글 자막을 제공하면 분석해서, 이 자료를 바탕으로 영작 학습을 목적으로 짦은 영어 다이얼로그를 생성해줘
영어 버전과 한국어 번역 버전을 별도로 출력해줘
보기좋게 적절히 줄바꿈해야 해

--------------------------------------------------
[대본 목록]
${formattedSentences}`;

  navigator.clipboard
    .writeText(promptText)
    .then(onSuccess)
    .catch((err) => {
      console.error('Failed to copy speaking prompt:', err);
      alert('영작 프롬프트 복사에 실패했습니다.');
    });
};
