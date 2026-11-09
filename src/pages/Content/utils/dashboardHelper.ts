// Dashboard helper for netflix-subtitle-study

import { VideoMetadata } from '../../../types';
import { MAX_STUDIED_COVER, MAX_STUDIED_TITLE, StudiedVideoRecord } from '../../../shared/bridge/netflixRecords';
import { storeWrite } from './studyStore';

export interface VideoInfo {
  title: string;
  seasonSeq?: number;
  episodeSeq?: number;
  episodeTitle?: string;
}

// 넷플릭스 플레이어 정보에서 영상 제목과 (시리즈면) 시즌·회차를 읽는다. 읽을 수 없으면 null.
export const getVideoInfo = (videoId: string | number): VideoInfo | null => {
  try {
    const metadata = window.netflix?.appContext?.state?.playerApp
      ?.getAPI()
      ?.getVideoMetadataByVideoId(videoId) as VideoMetadata | undefined;
    const video = metadata?._metadataObject?.video;
    if (!video?.title) return null;
    for (const season of video.seasons || []) {
      const episode = season.episodes?.find((ep) => ep.id.toString() === videoId.toString());
      if (episode) {
        return {
          title: video.title,
          seasonSeq: season.seq,
          episodeSeq: episode.seq,
          episodeTitle: episode.title,
        };
      }
    }
    return { title: video.title };
  } catch (e) {
    console.error('[NF-STUDY] Failed to read video info:', e);
    return null;
  }
};

// 공부한 영상 목록(대시보드)에 이 영상을 남긴다. 영상마다 기록 하나라서 그 영상의 것만 쓴다.
// 로그인하지 않았으면 아무것도 쓰지 않는다. 저장 실패는 저장 오류 안내로 보인다.
export const registerVideoMetadata = async (videoId: string | number, totalTabs: number): Promise<void> => {
  console.log('[NF-STUDY] registerVideoMetadata called. videoId:', videoId);
  try {
    if (!window.netflix?.appContext?.state?.playerApp) {
      console.warn(
        '[NF-STUDY] window.netflix.appContext.state.playerApp is not available. Skipping registerVideoMetadata.'
      );
      return;
    }
    const videoMetadata = window.netflix.appContext.state.playerApp
      .getAPI()
      .getVideoMetadataByVideoId(videoId) as VideoMetadata;

    console.log('[NF-STUDY] Retrieved videoMetadata:', videoMetadata);

    let currentSeason = null;
    let currentEpisode = null;

    if (videoMetadata?._metadataObject?.video?.seasons) {
      console.log(
        '[NF-STUDY] Video is a TV show (seasons found). Searching for current episode.'
      );
      for (const season of videoMetadata._metadataObject.video.seasons) {
        const episode = season.episodes.find(
          (ep) => ep.id.toString() === videoId.toString()
        );
        if (episode) {
          currentSeason = season;
          currentEpisode = episode;
          console.log(
            '[NF-STUDY] Found active episode. Season seq:',
            season.seq,
            'Episode seq:',
            episode.seq
          );
          break;
        }
      }
    } else {
      console.log(
        '[NF-STUDY] Video seasons object is not present. Treating as single movie/doc.'
      );
    }

    const title =
      videoMetadata?._metadataObject?.video?.title || '알 수 없는 영상';
    const artworkArr = videoMetadata?._metadataObject?.video?.artwork;
    const cover =
      artworkArr && artworkArr.length > 0 ? artworkArr[0].url : '';
    const epTitle = currentEpisode ? currentEpisode.title : '';
    const epSeq = currentEpisode ? currentEpisode.seq : 1;
    const seasonSeq = currentSeason ? currentSeason.seq : 1;

    // 저장소의 길이 상한(netflixRecords)을 넘지 않게 자른다.
    const record: StudiedVideoRecord = {
      videoId: videoId.toString(),
      title: title.slice(0, MAX_STUDIED_TITLE),
      cover: cover.length <= MAX_STUDIED_COVER ? cover : '',
      epTitle: (epTitle || '').slice(0, MAX_STUDIED_TITLE),
      epSeq: Number(epSeq) || 1,
      seasonSeq: Number(seasonSeq) || 1,
      totalPages: totalTabs,
      updatedAt: Date.now(),
    };
    await storeWrite({ op: 'studied.put', video: record });
  } catch (e) {
    console.error(
      '[NF-STUDY] Failed to register studied video metadata. Error:',
      e
    );
  }
};
