import { VideoMetadata } from './index';

declare global {
  interface Window {
    netflix: {
      appContext: {
        state: {
          playerApp: {
            getAPI: () => {
              videoPlayer: {
                getAllPlayerSessionIds: () => string[];
                getVideoPlayerBySessionId: (id: string) => {
                  getCurrentTime: () => number;
                  isPlaying: () => boolean;
                  pause: () => void;
                  seek: (time: number) => void;
                  play: () => void;
                  getMovieId: () => number;
                };
              };
              getVideoMetadataByVideoId: (
                videoId: string | number
              ) => VideoMetadata;
            };
          };
        };
      };
    };
  }
}
