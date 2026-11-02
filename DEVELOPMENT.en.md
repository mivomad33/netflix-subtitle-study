[한국어](DEVELOPMENT.md) | **English**

# Development guide

[Back to README](README.en.md)

## Dev server

```bash
npm install
npm start
```

Webpack Dev Server starts and keeps the `build` folder up to date as you edit. Load the `build` folder from `chrome://extensions/` in Chrome.

## Build

```bash
npm run build
```

This writes the output to the `build` folder and a release archive to the `zip` folder.

## Checks and tests

```bash
npm run typecheck
npm run lint
npm run test:run
```

Use `npm test` to rerun tests as you edit files.

## Stored data

Study data lives in the `localStorage` of the Netflix page. Key names are collected in [storageKeys.ts](src/pages/Content/constants/storageKeys.ts).

- `NF_studied_videos`: Metadata for studied videos (ID, title, cover image, total pages, update time, and so on)
- `NF_checklist_{videoId}`: Five-step checklist for each round and page of a video
- `NF_itemsPerPage_{videoId}`: Lines per page for a video
- `NF_isEnglishVisible`, `NF_isKoreanVisible`: Subtitle visibility
- `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`: Playback settings
- `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_studyPanelWidthRatio`, `NF_fontSize`: Display settings
- `NF_lingoActive`, `NF_preferredTextLocale`: Values used for subtitle handling

## Key files

- Subtitle interception and alignment: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- Study panel: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- Checklist: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- Dashboard: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- Overlay subtitles: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)
