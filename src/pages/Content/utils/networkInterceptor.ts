// Network Interceptor for netflix-subtitle-study
// Intercepts Netflix manifest responses and fetches English/Korean subtitles.

import {
  buildMediaInfo,
  getSubtitles,
  extractValidSubtitles,
  alignSubtitles,
  processExportSubtitles,
} from './subtitleHelper';
import { STORAGE_KEYS } from '../constants/storageKeys';

export const exportDataMap = new Map<string, any>();

export function initNetworkInterceptor(
  getVideoId: () => string | number | null,
  getIsNetflixWatchPage: () => boolean,
  onSubtitlesLoaded: (exportData: any, movieId: string) => void
): void {
  const originalJSONParse = JSON.parse;
  const originalJSONStringify = JSON.stringify;

  JSON.parse = function () {
    let parsedResponse = originalJSONParse.apply(this, arguments as any);

    if (
      parsedResponse &&
      parsedResponse.result &&
      (parsedResponse.result.textTracks || parsedResponse.result.timedtexttracks) &&
      !exportDataMap.get(parsedResponse.result.movieId)
    ) {
      try {
        console.log(
          '[NF-STUDY] Match exact! Intercepted manifest JSON with textTracks/timedtexttracks. movieId:',
          parsedResponse.result.movieId
        );

        let correctedManifest = originalJSONParse(
          JSON.stringify(parsedResponse.result)
        );

        const manifest = correctedManifest;
        const mediaInfo = buildMediaInfo(manifest);
        console.log('[NF-STUDY] Built mediaInfo:', {
          movieId: mediaInfo.movieId,
          tracksCount: mediaInfo.textTracks?.length
        });

        const enTextTrack = mediaInfo.textTracks.find(
          (track) => track.langCode_N === 'en'
        );
        const koTextTrack = mediaInfo.textTracks.find(
          (track) => track.langCode_N === 'ko'
        );
        
        console.log('[NF-STUDY] Text tracks check:', {
          enTrack: enTextTrack ? `found (downloadableId: ${enTextTrack.downloadableId})` : 'NOT found',
          koTrack: koTextTrack ? `found (downloadableId: ${koTextTrack.downloadableId})` : 'NOT found'
        });

        if (!enTextTrack?.downloadableId || !koTextTrack?.downloadableId) {
          console.warn('[NF-STUDY] Missing english or korean track downloadableId in manifest.', {
            enTextTrack,
            koTextTrack
          });
          console.warn('NF: trackInit: No text tracks found!');
        } else {
          console.log('[NF-STUDY] Starting subtitles fetch for en & ko.');
          Promise.all([
            getSubtitles(manifest, mediaInfo.movieId, enTextTrack.downloadableId),
            getSubtitles(manifest, mediaInfo.movieId, koTextTrack.downloadableId),
          ])
            .then(([enSubtitles, koSubtitles]) => {
              console.log('[NF-STUDY] Subtitles fetch finished.', {
                enSuccess: !!enSubtitles,
                koSuccess: !!koSubtitles
              });
              const enValidSubtitles = extractValidSubtitles(enSubtitles);
              const koValidSubtitles = extractValidSubtitles(koSubtitles);
              console.log('[NF-STUDY] Extracted valid subtitles.', {
                enValidCount: enValidSubtitles.length,
                koValidCount: koValidSubtitles.length
              });

              const aligned = alignSubtitles(enValidSubtitles, koValidSubtitles);
              console.log('[NF-STUDY] Subtitles alignment finished. printSubs count:', aligned.printSubs?.length);

              const exportData = {
                hTranslations: aligned,
                subtitles: enValidSubtitles,
              };

              return processExportSubtitles(exportData);
            })
            .then((exportData) => {
              console.log('[NF-STUDY] Finished processing export subtitles. Count:', exportData?.length);
              exportDataMap.set(mediaInfo.movieId, exportData);
              const videoId = getVideoId();
              const isWatch = getIsNetflixWatchPage();
              console.log('[NF-STUDY] State check after processing:', {
                currentVideoId: videoId,
                manifestMovieId: mediaInfo.movieId,
                isWatchPage: isWatch
              });
              if (
                isWatch &&
                (!videoId || videoId.toString() === mediaInfo.movieId)
              ) {
                console.log('[NF-STUDY] Triggering onSubtitlesLoaded callback.');
                onSubtitlesLoaded(exportData, mediaInfo.movieId);
              }
            })
            .catch((err) => {
              console.error('[NF-STUDY] Error in subtitles processing chain:', err);
            });
        }
      } catch (error) {
        console.error('[NF-STUDY] patchInManifest error! ', error);
      }
    }

    return parsedResponse;
  };

  JSON.stringify = function (data) {
    if (data === undefined) {
      return originalJSONStringify.apply(this, arguments as any);
    }

    let transformedData = originalJSONParse(
      originalJSONStringify.apply(this, arguments as any)
    );
    let modified = false;

    if (
      transformedData &&
      transformedData.params &&
      transformedData.params.supportsPartialHydration !== undefined
    ) {
      transformedData.params.supportsPartialHydration = true;
      transformedData.params.showAllSubDubTracks = true;
      if (localStorage.getItem(STORAGE_KEYS.LINGO_ACTIVE) === JSON.stringify(true)) {
        const preferredTextLocale = localStorage.getItem(
          STORAGE_KEYS.PREFERRED_TEXT_LOCALE
        );
        if (preferredTextLocale) {
          transformedData.params.preferredTextLocale = preferredTextLocale;
        }
      }
      modified = true;
      console.log('[NF-STUDY] JSON.stringify patch: supportsPartialHydration enabled.');
    }

    if (
      transformedData &&
      transformedData.params &&
      transformedData.params.profiles
    ) {
      transformedData.params.profiles.push('webvtt-lssdh-ios8');
      modified = true;
    }

    return modified
      ? originalJSONStringify(transformedData)
      : originalJSONStringify.apply(this, arguments as any);
  };
}
