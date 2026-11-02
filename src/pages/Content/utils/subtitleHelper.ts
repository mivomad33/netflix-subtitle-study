// Subtitle Helper for netflix-subtitle-study
// Ported from index.jsx without changing any logic

export interface TextTrackData {
  hydrated: boolean;
  downloadableId?: string;
  langCode_N: string;
  type: string;
  id: string;
  hashAlgo?: string;
  hashValue?: string;
  size?: number;
  newTrackId: string;
  name: string;
}

export interface AudioTrackData {
  hydrated: boolean;
  id: string;
  langCode_N: string;
  isNative: boolean;
  type: string;
  downloadableId?: string;
  bitrate: number;
  newTrackId: string;
  name: string;
}

export interface MediaInfo {
  source: string;
  movieId: string;
  packageId: any;
  originalAudioLangCode_N: string | null;
  originalAudioLangCode_G: string | null;
  textTracks: TextTrackData[];
  duration_ms: number;
  viewableType: string;
  titles: Record<string, any>;
  audioTracks: AudioTrackData[];
}

export interface SubtitleItem {
  begin: number;
  end: number;
  text: string;
}

export interface AlignedSubtitleResult {
  raw: any[];
  subs: Record<number, string>;
  alignInfo: Record<number, [number, number, number][]>;
  printSubs: [string, string][];
  printIndexes: {
    sourceIndexes: number[];
    translationIndexes: number[];
  }[];
}

export function buildMediaInfo(manifest: any): MediaInfo {
  // 기본 원어(audio) 언어 코드 초기화
  let originalAudioLanguageNative: string | null = null;
  let originalAudioLanguageGlobal: string | null = null;

  const audioTracks = manifest.audioTracks || manifest.audio_tracks || [];
  const textTracks = manifest.textTracks || manifest.timedtexttracks || [];

  console.log('[NF-STUDY] buildMediaInfo input counts:', {
    audioTracksCount: audioTracks.length,
    textTracksCount: textTracks.length
  });

  // audioTracks에서 native 트랙의 언어 정보를 가져옴
  for (let audioTrack of audioTracks) {
    if (audioTrack.isNative === true) {
      const language = audioTrack.language;
      if (language) {
        originalAudioLanguageNative = language;
      }
    }
  }

  // textTracks에서 forcedNarrative와 noneTrack이 아닌 트랙들을 파싱
  let textTracksData: TextTrackData[] = [];
  for (let textTrack of textTracks) {
    if (
      textTrack.isForcedNarrative === false &&
      textTrack.isNoneTrack === false
    ) {
      const trackMetadata = buildTrackMetadata(textTrack);
      textTracksData.push(trackMetadata);
    }
  }

  // audioTracks의 상세 정보를 구성
  let audioTracksData: AudioTrackData[] = [];
  for (let audioTrack of audioTracks) {
    if (audioTrack.hydrated === true) {
      // 우선순위: 128 > 96 > 64 비트레이트 스트림 선택
      const streams = audioTrack.streams || [];
      let selectedStream =
        streams.filter((stream: any) => stream.bitrate === 128)[0] ||
        streams.filter((stream: any) => stream.bitrate === 96)[0] ||
        streams.filter((stream: any) => stream.bitrate === 64)[0];
      if (!selectedStream) {
        console.warn('[NF-STUDY] Missing selectedStream for hydrated audioTrack:', audioTrack.id);
        continue;
      }

      audioTracksData.push({
        hydrated: audioTrack.hydrated,
        id: audioTrack.id,
        langCode_N: audioTrack.language,
        isNative: audioTrack.isNative,
        type: audioTrack.rawTrackType,
        downloadableId: selectedStream.downloadableId || selectedStream.downloadable_id,
        bitrate: selectedStream.bitrate,
        newTrackId: audioTrack.newTrackId || audioTrack.new_track_id,
        name: audioTrack.languageDescription,
      });
    } else {
      // hydrated 상태가 아닐 경우, 사용 가능한 비트레이트 목록에서 선택
      const bitrates = audioTrack.bitrates || [];
      const selectedBitrate = bitrates.includes(128)
        ? 128
        : bitrates.includes(96)
        ? 96
        : bitrates.includes(64)
        ? 64
        : bitrates[bitrates.length - 1];
      audioTracksData.push({
        hydrated: audioTrack.hydrated,
        id: audioTrack.id,
        langCode_N: audioTrack.language,
        isNative: audioTrack.isNative,
        type: audioTrack.rawTrackType,
        bitrate: selectedBitrate,
        newTrackId: audioTrack.newTrackId || audioTrack.new_track_id,
        name: audioTrack.languageDescription,
      });
    }
  }

  // 기본 타이틀 정보를 구성 (예: 지역 코드에 따른 타이틀)
  let titles = {};

  return {
    source: 'NETFLIX',
    movieId: manifest.movieId.toString(),
    packageId: manifest.packageId,
    originalAudioLangCode_N: originalAudioLanguageNative,
    originalAudioLangCode_G: originalAudioLanguageGlobal,
    textTracks: textTracksData,
    duration_ms: manifest.duration,
    viewableType: manifest.viewableType,
    titles: titles,
    audioTracks: audioTracksData,
  };
}

export function buildTrackMetadata(track: any): TextTrackData {
  if (track.hydrated === true) {
    const downloadableIdKey = track.downloadableIds ? 'downloadableIds' : 'downloadable_ids';
    let ttDownloadablesKey = 'downloadables';
    if (!(ttDownloadablesKey in track)) {
      ttDownloadablesKey = track.ttDownloadables ? 'ttDownloadables' : 'tt_downloadables';
    }
    
    const downloadableId = track[downloadableIdKey]?.['webvtt-lssdh-ios8'];
    const downloadablesInfo = track[ttDownloadablesKey]?.['webvtt-lssdh-ios8'] || {};

    return {
      hydrated: true,
      downloadableId: downloadableId,
      langCode_N: track.language,
      type: track.rawTrackType,
      id: track.id,
      hashAlgo: downloadablesInfo.hashAlgo || downloadablesInfo.hash_algo,
      hashValue: downloadablesInfo.hashValue || downloadablesInfo.hash_value,
      size: downloadablesInfo.size,
      newTrackId: track.newTrackId || track.new_track_id,
      name: track.languageDescription,
    };
  } else {
    return {
      hydrated: false,
      langCode_N: track.language,
      type: track.rawTrackType,
      id: track.id,
      newTrackId: track.newTrackId || track.new_track_id,
      name: track.languageDescription,
    };
  }
}

export async function getSubtitles(manifest: any, videoId: string | number, trackId: string): Promise<any> {
  const textTracks = manifest.textTracks || manifest.timedtexttracks;
  if (!manifest || !textTracks) {
    console.log("[NF-STUDY] ERROR: getSubs2, couldn't retrieve manifest or textTracks.");
    return null;
  }

  // 유효한 텍스트 트랙 필터링 (isNoneTrack가 false인 경우)
  const validTextTracks = textTracks.filter(
    (track: any) => !track.isNoneTrack
  );
  let selectedTextTrack: any = null;

  // 전달받은 trackId와 일치하는 트랙 검색
  for (let idx = 0; idx < validTextTracks.length; idx++) {
    const textTrack = validTextTracks[idx];
    const downloadableIdKey = textTrack.downloadableIds ? 'downloadableIds' : 'downloadable_ids';
    const currentTrackId = textTrack[downloadableIdKey]?.['webvtt-lssdh-ios8'];

    if (currentTrackId === trackId) {
      if (textTrack.isForcedNarrative !== true) {
        selectedTextTrack = textTrack;
        break;
      }
      console.log(
        `[NF-STUDY] NOTE: getSubs2, text track language: ${textTrack.language}, ` +
          `isForcedNarrative: ${textTrack.isForcedNarrative}.`
      );
      return null;
    }
  }

  if (!selectedTextTrack) {
    console.log(
      `[NF-STUDY] NOTE: getSubs2, couldn't locate textTrack with ID ${trackId} in manifest!`
    );
    return null;
  }

  // 트랙 메타데이터 생성 (buildTrackMetadata는 외부에서 정의)
  const trackMetadata = buildTrackMetadata(selectedTextTrack);
  if (trackMetadata.hydrated === false) {
    console.warn('[NF-STUDY] getSubs2: Selected track is not hydrated.');
    return null;
  }

  let ttDownloadablesKey = 'downloadables';
  if (!(ttDownloadablesKey in selectedTextTrack)) {
    ttDownloadablesKey = selectedTextTrack.ttDownloadables ? 'ttDownloadables' : 'tt_downloadables';
  }

  // 다운로드 URL 목록 구성
  let downloadUrls: string[] | null = null;
  const downloadableInfo = selectedTextTrack[ttDownloadablesKey]?.['webvtt-lssdh-ios8'] || {};
  
  if ('downloadUrls' in downloadableInfo && downloadableInfo.downloadUrls) {
    downloadUrls = Object.values(downloadableInfo.downloadUrls);
  } else if ('urls' in downloadableInfo && downloadableInfo.urls) {
    downloadUrls = downloadableInfo.urls.map((urlObj: any) => urlObj.url);
  } else {
    console.warn('[NF-STUDY] getSubs2: No downloadUrls or urls inside downloadableInfo.', downloadableInfo);
    return null;
  }

  if (!downloadUrls || downloadUrls.length === 0) {
    return null;
  }

  // ajax 요청 및 결과 후처리
  return fetch(downloadUrls[0])
    .then((response) => response.text())
    .then((rawSubtitleData) => {
      console.log('NF: INFO: getSubs2: fetched Subs.');
      if (!rawSubtitleData) {
        return null;
      }

      let parsedSubtitles;
      try {
        // 자막 파싱: subtitleParser.parse는 외부 라이브러리 함수, 옵션으로 invalid caption 무시
        parsedSubtitles = (function (rawData) {
          const captions = parseCaptions(rawData, {
            skipInvalidCaptions: true,
          }).map((caption: any) => {
            // settings에서 line 정보를 추출
            const linePosition = (function (settings) {
              if (typeof settings !== 'string') return null;
              const match = settings.match(/line:(\d+(\.\d+)?)/);
              if (match && match[1]) {
                const lineVal = parseFloat(match[1]);
                return isNaN(lineVal) ? null : lineVal;
              }
              return null;
            })(caption.settings ?? '');

            return {
              start: caption.start,
              end: caption.end,
              text: caption.text,
              linePosition: linePosition,
            };
          });

          // 시작 시간 순, 그리고 linePosition이 있을 경우 그 순서로 정렬
          captions.sort((a, b) => {
            if (a.start < b.start) return -1;
            if (a.start > b.start) return 1;
            if (a.linePosition !== null && b.linePosition !== null) {
              return a.linePosition - b.linePosition;
            }
            return 0;
          });

          // 동일 시작 시간의 캡션 병합
          const mergedCaptions: [number, number, string][] = [];
          for (let i = 0; i < captions.length; i++) {
            const caption = captions[i];
            if (
              caption.start === undefined ||
              caption.start < 0 ||
              caption.end === undefined ||
              caption.text === undefined ||
              caption.text === ''
            ) {
              console.log('NF: Issue parsing subtitle:');
              console.log(caption);
              continue;
            }
            let processedText = '';
            if (caption.text) {
              processedText = caption.text.replace(/<[^>]*>?/gm, '');
              processedText = processedText
                .split('&amp;')
                .join('&')
                .split('&lt;')
                .join('<')
                .split('&gt;')
                .join('>')
                .split('&quot;')
                .join('"')
                .split('&apos;')
                .join("'")
                .split('&lrm;')
                .join('‎')
                .split('&rlm;')
                .join('‏');
            }
            // 병합: 이전 캡션의 시작 시간이 같으면 텍스트만 추가
            if (
              mergedCaptions.length &&
              caption.start === mergedCaptions[mergedCaptions.length - 1][0]
            ) {
              mergedCaptions[mergedCaptions.length - 1][2] +=
                ' ' + processedText;
            } else {
              mergedCaptions.push([caption.start, caption.end, processedText]);
            }
          }
          return mergedCaptions;
        })(rawSubtitleData);
      } catch (parseError) {
        return null;
      }

      if (parsedSubtitles) {
        console.log('NF: INFO: getSubs2: Subs parsed OK.');
        const subtitlesResult = {
          parsedSubs: parsedSubtitles,
          rawSubs: rawSubtitleData,
          metadata: trackMetadata,
        };

        return subtitlesResult;
      } else {
        return null;
      }
    });
}

// 문자열이 존재하며, 알파벳 또는 숫자 문자가 전혀 포함되어 있지 않은 경우 true 반환
function isNonAlphanumericOnly(str: string): boolean {
  return Boolean(str && str.trim().length > 0) && !/[\p{L}\p{N}]/u.test(str);
}

// 자막 텍스트가 대괄호로 감싸진 경우나, 알파벳/숫자가 전혀 없는 경우 false 반환
function isValidSubtitleText(subEntry: SubtitleItem): boolean {
  // 텍스트가 [로 시작하고 ]로 끝나면 부적합한 텍스트로 간주
  const text = subEntry.text;
  return (
    (!text.startsWith('[') || !text.endsWith(']')) &&
    !isNonAlphanumericOnly(text)
  );
}

// 주어진 객체의 parsedSubs 배열을 적절한 객체 배열로 변환하고, 유효한 자막 텍스트만 필터링하여 반환
export function extractValidSubtitles(data: any): SubtitleItem[] {
  return data.parsedSubs
    .map((sub: any) => ({
      begin: sub[0],
      end: sub[1],
      text: sub[2],
    }))
    .filter(isValidSubtitleText);
}

export function alignSubtitles(sourceSubs: SubtitleItem[], translationSubs: SubtitleItem[]): AlignedSubtitleResult {
  // 최종 출력할 프린트용 자막과 인덱스 배열 초기화
  let printSubs: [string, string][] = [];
  let printIndexes: { sourceIndexes: number[]; translationIndexes: number[] }[] = [];

  function similarityScore(e: SubtitleItem, t: SubtitleItem): number {
    return Math.min(t.end, e.end) - Math.max(t.begin, e.begin);
  }

  // 주어진 translationSegment와 sourceSegments 배열 간의 유사도 기반 인덱스 매칭을 구하는 헬퍼 함수
  function getAlignedIndicesForTranslation(translationSegment: SubtitleItem, sourceSegments: SubtitleItem[]): number[] {
    const alignedIndices: number[] = [];
    let maxScore = 0;
    let bestMatchIndex = -1;

    // sourceSegments 각각과 유사도 비교하여 최고 점수의 인덱스 찾기
    for (let i = 0; i < sourceSegments.length; i++) {
      const score = similarityScore(translationSegment, sourceSegments[i]);
      if (score > maxScore) {
        maxScore = score;
        bestMatchIndex = i;
      }
    }
    if (bestMatchIndex !== -1) {
      alignedIndices.push(bestMatchIndex);
    }
    // 일정 점수 이상 또는 점수 대비 길이 비율이 높은 경우 해당 인덱스를 추가
    for (let i = 0; i < sourceSegments.length; i++) {
      const segment = sourceSegments[i];
      const score = similarityScore(translationSegment, segment);
      const duration = segment.end - segment.begin;
      if (score > 500 || score / duration > 0.8) {
        if (!alignedIndices.includes(i)) {
          alignedIndices.push(i);
        }
      }
    }
    return alignedIndices;
  }

  // alignedTranslationSubs: 각 source 자막 인덱스별로 연결된 번역 텍스트를 저장
  // sourceToTranslationMap: 각 source 자막 인덱스별로 번역 자막 인덱스 배열을 저장
  const alignedTranslationSubs: Record<number, string> = {};
  const sourceToTranslationMap: Record<number, number[]> = {};
  // unmatchedTranslationIndices: source와 매칭되지 않은 번역 자막의 인덱스 (사용되지 않은 번역)
  const unmatchedTranslationIndices: number[] = [];
  // multipleTranslationIndices: 하나의 번역 자막이 여러 source에 매핑된 경우 해당 source 인덱스
  const multipleTranslationIndices: number[] = [];
  // alignmentIndicesPerTranslation: 각 번역 자막에 대해 계산된 source 인덱스 배열
  const alignmentIndicesPerTranslation: number[][] = [];

  // 각 번역 자막에 대해 source 자막과의 정렬 인덱스를 계산
  for (
    let translationIndex = 0;
    translationIndex < translationSubs.length;
    translationIndex++
  ) {
    const alignedIndices = getAlignedIndicesForTranslation(
      translationSubs[translationIndex],
      sourceSubs
    );
    alignmentIndicesPerTranslation.push(alignedIndices);

    // 기본 번역 타입은 UNKNOWN이며, 여러 source와 매칭되는 경우 타입 변경
    let translationType = 'UNKNOWN';
    if (alignedIndices.length !== 0) {
      if (alignedIndices.length > 1) {
        translationType = 'ONE_TRANSLATION_TO_MULTIPLE';
      }
      // 해당 번역 자막의 텍스트를 각 매칭된 source 자막에 연결
      for (const sourceIndex of alignedIndices) {
        if (sourceToTranslationMap[sourceIndex] === undefined) {
          sourceToTranslationMap[sourceIndex] = [translationIndex];
          alignedTranslationSubs[sourceIndex] =
            translationSubs[translationIndex].text;
        } else {
          sourceToTranslationMap[sourceIndex].push(translationIndex);
          alignedTranslationSubs[sourceIndex] =
            alignedTranslationSubs[sourceIndex] +
            ' ' +
            translationSubs[translationIndex].text;
        }
        if (translationType === 'ONE_TRANSLATION_TO_MULTIPLE') {
          multipleTranslationIndices.push(sourceIndex);
        }
      }
    } else {
      unmatchedTranslationIndices.push(translationIndex);
    }
  }

  // 추가 정렬 정보를 담을 객체: 각 source 인덱스별로 [번역 인덱스, 정렬 후 위치, 매칭 개수] 정보를 저장
  const alignmentExtraInfo: Record<number, [number, number, number][]> = {};
  const sortedSourceIndices = Object.keys(sourceToTranslationMap)
    .map((key) => parseInt(key, 10))
    .sort((a, b) => a - b);

  for (let idx = 0; idx < sortedSourceIndices.length; idx++) {
    const sourceIndex = sortedSourceIndices[idx];
    alignmentExtraInfo[sourceIndex] = [];
    if (sourceToTranslationMap[sourceIndex].length === 1) {
      const translationIndex = sourceToTranslationMap[sourceIndex][0];
      const alignedIndices = alignmentIndicesPerTranslation[translationIndex];
      if (alignedIndices.indexOf(sourceIndex) !== -1) {
        const sortedIndices = alignedIndices.slice().sort((a, b) => a - b);
        alignmentExtraInfo[sourceIndex].push([
          translationIndex,
          sortedIndices.indexOf(sourceIndex),
          sortedIndices.length,
        ]);
      }
    } else if (sourceToTranslationMap[sourceIndex].length > 1) {
      for (const translationIndex of sourceToTranslationMap[sourceIndex]) {
        const alignedIndices = alignmentIndicesPerTranslation[translationIndex];
        if (alignedIndices.indexOf(sourceIndex) !== -1) {
          const sortedIndices = alignedIndices.slice().sort((a, b) => a - b);
          alignmentExtraInfo[sourceIndex].push([
            translationIndex,
            sortedIndices.indexOf(sourceIndex),
            sortedIndices.length,
          ]);
        }
      }
    }
  }

  // 헬퍼 함수: 두 배열이 동일한지 비교
  function arraysEqual(arr1: number[], arr2: number[]): boolean {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }

  // 최종 출력용 배열 재설정
  printSubs = [];
  printIndexes = [];

  // 현재 블록에 누적된 source, translation 자막 및 인덱스를 임시로 저장
  let previousMapping: number[] = [];
  let currentSourceText = '';
  let currentTranslationText = '';
  let currentSourceIndexes: number[] = [];
  let currentTranslationIndexes: number[] = [];

  // sourceToTranslationMap of key(=source index)를 정렬하여 순회
  const sortedAlignedSourceIndices = Object.keys(sourceToTranslationMap)
    .map((key) => parseInt(key, 10))
    .sort((a, b) => a - b);

  for (const sourceIndex of sortedAlignedSourceIndices) {
    const translationIndices = sourceToTranslationMap[sourceIndex];

    if (arraysEqual(previousMapping, translationIndices)) {
      // 이전 mapping과 동일하면 현재 블록에 계속 누적
      if (currentSourceText.length > 0) {
        currentSourceText += ' ';
      }
      currentSourceText += sourceSubs[sourceIndex].text;
      currentSourceIndexes.push(sourceIndex);
    } else {
      // 매핑이 달라지면 기존 블록을 출력 배열에 저장 후 초기화
      if (currentSourceText.length > 0 || currentTranslationText.length > 0) {
        printSubs.push([
          currentSourceText.replace(/\n/g, ' '),
          currentTranslationText.replace(/\n/g, ' '),
        ]);
        printIndexes.push({
          sourceIndexes: currentSourceIndexes,
          translationIndexes: currentTranslationIndexes,
        });
      }
      currentSourceText = '';
      currentSourceIndexes = [];
      currentTranslationText = '';
      currentTranslationIndexes = [];

      currentSourceText += sourceSubs[sourceIndex].text;
      currentSourceIndexes.push(sourceIndex);
      for (const translationIndex of translationIndices) {
        if (currentTranslationText.length > 0) {
          currentTranslationText += ' ';
        }
        currentTranslationText += translationSubs[translationIndex].text;
        currentTranslationIndexes.push(translationIndex);
      }
    }
    previousMapping = translationIndices;
  }

  // 남아있는 블록이 있다면 출력 배열에 추가
  if (currentSourceText.length > 0 || currentTranslationText.length > 0) {
    printSubs.push([
      currentSourceText.replace(/\n/g, ' '),
      currentTranslationText.replace(/\n/g, ' '),
    ]);
    printIndexes.push({
      sourceIndexes: currentSourceIndexes,
      translationIndexes: currentTranslationIndexes,
    });
  }

  return {
    raw: translationSubs,
    subs: alignedTranslationSubs,
    alignInfo: alignmentExtraInfo,
    printSubs: printSubs,
    printIndexes: printIndexes,
  };
}

export async function processExportSubtitles(exportData: any): Promise<any[]> {
  // 최종 인쇄용 자막 데이터 배열
  const printSubtitles: any[] = [];

  let printIndexes: any[],
    machineTranslations: any = null;

  // hTranslations(인간 번역)이 있으면 해당 인덱스 배열 사용, 없으면 기본 매핑 생성
  printIndexes = exportData.hTranslations
    ? exportData.hTranslations.printIndexes
    : exportData.subtitles.map((subtitle: any, index: number) => ({
        sourceIndexes: [index],
        translationIndexes: [],
      }));

  // printIndexes 배열을 순회하며 최종 인쇄용 자막 데이터를 생성
  for (let mapping of printIndexes) {
    // 첫 번째 source 자막의 시작 시간과 마지막 자막의 종료 시간 설정
    const startTime = exportData.subtitles[mapping.sourceIndexes[0]].begin;
    const endTime = exportData.subtitles[mapping.sourceIndexes[mapping.sourceIndexes.length - 1]].end;
    printSubtitles.push({
      startTime_ms: startTime,
      endTime_ms: endTime,
      text: mapping.sourceIndexes
        .map((index: number) => exportData.subtitles[index].text)
        .join(' '),
      mTranslation: machineTranslations
        ? mapping.sourceIndexes
            .map((index: number) => machineTranslations[index] || '')
            .join(' ')
        : null,
      hTranslation: exportData.hTranslations
        ? mapping.translationIndexes
            .map((index: number) => exportData.hTranslations?.raw[index]?.text || '')
            .join(' ')
        : null,
    });
  }

  return printSubtitles;
}

export function parseCaptions(inputString: string, options: any): any[] {
  if (!inputString) return [];

  // 기본 옵션 설정
  options = options || {
    skipInvalidCaptions: false,
    errorHandler: null,
    skipContiguousErrors: true,
  };

  // 입력 문자열 정규화: 앞뒤 공백 제거, 끝에 개행 추가,
  // Windows 개행(\r\n)을 Unix 개행(\n)으로 변경,
  // 연속된 3개 이상의 개행은 2개로 변경,
  // WEBVTT 헤더 제거 후 개행을 기준으로 분리
  const lines = inputString
    .trim()
    .concat('\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^WEBVTT.*\n{2}/, '')
    .split('\n');

  // 이전 줄이 정상적으로 처리되었는지 추적하는 플래그
  let previousLineSucceeded = true;

  // 초기 캡션 객체를 담은 배열로 reduce 시작 (최초 객체는 빈 객체)
  return lines.reduce(
    (parsedCues: any[], currentLine: string, lineIndex: number) => {
      // 현재 처리 중인 캡션 객체 (배열의 마지막 요소)
      let currentCue = parsedCues[parsedCues.length - 1];

      try {
        // 현재 캡션에 index가 없고, 현재 줄이 숫자로만 구성되어 있다면
        // 해당 줄을 캡션의 index로 설정
        if (!currentCue.index && /^\d+$/.test(currentLine)) {
          currentCue.index = parseInt(currentLine, 10);
          return parsedCues;
        }

        // 아직 시작 시간(start)이 파싱되지 않았다면, 현재 줄을 타이밍 정보로 파싱
        if (!currentCue.hasOwnProperty('start')) {
          Object.assign(currentCue, parseCueTiming(currentLine));
          return parsedCues;
        }

        // 빈 줄인 경우 현재 캡션의 index를 제거하고(불필요 정보)
        // 마지막 줄이 아니라면 새로운 캡션 객체를 추가하여 다음 캡션을 시작
        if (currentLine === '') {
          delete currentCue.index;
          if (lineIndex !== lines.length - 1) {
            parsedCues.push({});
          }
        } else {
          // 현재 줄이 일반 텍스트인 경우 기존 텍스트가 있으면 줄바꿈 후 추가, 아니면 그대로 설정
          currentCue.text = currentCue.text
            ? currentCue.text + '\n' + currentLine
            : currentLine;
        }

        // 정상 처리 완료 플래그 설정
        previousLineSucceeded = true;
      } catch (error) {
        // 옵션에 따라 에러 발생 시 처리 방식 결정
        if (!options.skipInvalidCaptions) throw error;

        // 이전 줄 처리 실패 상태가 아니라면 에러 핸들러 호출(연속된 에러 건너뛰기 옵션 고려)
        if (!previousLineSucceeded && options.skipContiguousErrors) {
          // 연속된 에러 건너뛰기: 별도 처리 없음
        } else if (typeof options.errorHandler === 'function') {
          options.errorHandler({
            index: lineIndex,
            row: currentLine,
            error: error,
          });
        }
        // 에러 발생 시 플래그 업데이트 및 현재 캡션 초기화
        previousLineSucceeded = false;
        parsedCues[parsedCues.length - 1] = {};
      }

      return parsedCues;
    },
    [{}]
  );
}

export function parseCueTiming(cueTimingStr: string): { start: number; end: number; settings?: string } {
  const timePattern =
    /^((?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3}) --> ((?:\d{2,}:)?\d{2}:\d{2}[,.]\d{3})(?: (.*))?$/;
  const match = timePattern.exec(cueTimingStr);
  if (!match) {
    throw new Error('Invalid cue timing format: ' + cueTimingStr);
  }

  // match[1]: 시작 타임스탬프, match[2]: 종료 타임스탬프, match[3]: (옵션) 추가 설정값
  const cueTiming: { start: number; end: number; settings?: string } = {
    start: parseTimeString(match[1]),
    end: parseTimeString(match[2]),
  };

  if (match[3]) {
    cueTiming.settings = match[3];
  }

  return cueTiming;
}

export function parseTimeString(timeStr: any): number {
  // 만약 입력값이 숫자라면 그대로 반환 (이미 밀리초 단위일 가능성이 있음)
  if (!isNaN(timeStr)) return timeStr as number;

  // SRT 또는 VTT 형식의 시간 문자열 매칭: [시간(선택)]:분:초[콤마 또는 점]밀리초
  const timeRegex = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})$/;
  const match = timeStr.match(timeRegex);
  if (!match) {
    throw new Error('Invalid SRT or VTT time format: "' + timeStr + '"');
  }

  // 각 시간 단위를 밀리초로 변환
  // match[1]: 시간 (옵션), match[2]: 분, match[3]: 초, match[4]: 밀리초
  const hoursInMs = match[1] ? 3600000 * parseInt(match[1], 10) : 0;
  const minutesInMs = 60000 * parseInt(match[2], 10);
  const secondsInMs = 1000 * parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return hoursInMs + minutesInMs + secondsInMs + milliseconds;
}
