[한국어](DEVELOPMENT.md) | **English**

# Development guide

[Back to README](README.en.md)

## Dev server

```bash
npm install
npm start
```

Webpack Dev Server starts and keeps the `build` folder up to date as you edit. Load the `build` folder from `chrome://extensions/` in Chrome.

### Viewing the book reader pages

With the dev server running, open `http://localhost:3000/reader-dev.html` to see the book reader, memo collection, and backup pages without loading the extension. This page uses an in-memory store instead of `chrome.*` and saves its contents to that page's `localStorage`.

- `?seed=demo`: Fills in books and notes using self-written sample text.
- `?seed=perf`: Fills in 20 books (one of them 2,000,000 characters) and 5,000 notes.
- In the browser console, `window.nfStudyDev` provides `reset()`, `seedDemo()`, and `seedPerf()`.
- Read aloud uses silent fake voices ([fakeSpeech.ts](src/pages/Reader/dev/fakeSpeech.ts)) by default. They send start and end signals timed by text length, so you can see the current-sentence highlight and auto scroll. Pick a voice set with `?voices=`; the choice is kept across reloads.
  - `device` (default): two English device voices, a Korean voice, and an online English voice
  - `online`: only a Korean device voice and an online English voice (reading needs online voices turned on)
  - `none`: no voices (shows the no-English-voice notice)
  - `unsupported`: like a browser without `speechSynthesis`
  - `real`: this browser's real voices
  - What the fake voices read is kept with timestamps in `window.nfStudyDev.speech.spoken`.

`reader-dev.html`, the in-memory store, and the fake voices are only built in development and are not part of the `npm run build` output. The entry points are [dev.tsx](src/pages/Reader/dev.tsx) and [seed.ts](src/pages/Reader/dev/seed.ts). The demo seed marks some chapters as studied, so books at 0%, partway, and 100% progress appear together.

## Build

```bash
npm run build
```

This writes the output to the `build` folder and a release archive to the `zip` folder.

The extension ID is fixed by `key` in [manifest.json](src/manifest.json) (`flhkacfjjpipfoicbnmednajnhebihmb`), so moving or reloading the `build` folder keeps the same `chrome.storage.local`.

## Checks and tests

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
npm run check:build
```

Use `npm test` to rerun tests as you edit files.

`npm run check:build` ([check-build.mjs](scripts/check-build.mjs)) checks the output after `npm run build`:

- The built manifest's permissions are exactly `storage` and `unlimitedStorage`, there are no `host_permissions`, `key` is present, and there is no `chrome_url_overrides`.
- The extension pages' bundles load no external scripts or styles and make no `fetch` or XHR calls.
- The dev in-memory store and fake voices are not in `build` (marker strings `NF_STUDY_DEV_STORAGE_SHIM` and `NF_STUDY_FAKE_SPEECH`).
- No `.pem` file or backup JSON is tracked in git.

### Performance measurement

Run this while the dev server is running. It uses the Playwright installed in `~/.cache/design-tools` (override with `DESIGN_TOOLS_DIR`).

```bash
node scripts/perf/measure.mjs
```

[measure.mjs](scripts/perf/measure.mjs) measures six times on `reader-dev.html?seed=perf`: previewing a 2,000,000-character text (3 seconds or less), opening a 200,000-character chapter (1 second or less), searching 5,000 notes (0.5 seconds or less), opening the book list with progress (1 second or less), opening the book list for the first time with 20 books in the older shape without chapter character counts (1 second or less), and the time from clicking "read from here" in a 200,000-character chapter to the first speech request (fake voices, 0.5 seconds or less).

## CI

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs `npm ci`, type checks, ESLint, tests, the build, and `check:build` in order on every push and pull request. The Node version is pinned in [.nvmrc](.nvmrc) (24).

## Stored data

Data is stored in two places.

### Extension storage

Highlights, notes, and books are stored in the extension's own storage, `chrome.storage.local`. The `unlimitedStorage` permission lifts the size limit. This data survives clearing Netflix site data but is removed when the extension is uninstalled, which is why the book reader has backup export and import ([backup.ts](src/pages/Reader/logic/backup.ts)). Key names are in [keys.ts](src/shared/storage/keys.ts), the read and write code is in [repo.ts](src/shared/storage/repo.ts), and the memo format is in [types.ts](src/shared/memo/types.ts).

- `memo:{id}`: One note. Each note has its own key, so two tabs saving different notes never overwrite each other. Netflix notes and book notes share one format. Each stores the source text (a sentence or a paragraph), the position within it, and the selected text, so it is reattached only where the source text is the same.
- `book:{id}`: Book information (title, author, chapter list, and so on). Each chapter has a character count `charCount`, so study progress is computed without reading the text. Books saved before this field existed (or imported from such a backup) get it filled once from their text the first time the book list or the reader opens them.
- `bookch:{bookId}:{chapterId}`: The text of one chapter (an array of paragraphs)
- `pos:{bookId}`: The last reading position in a book (chapter and paragraph)
- `done:{bookId}:{chapterId}`: Study completion of one chapter (`done`, `updatedAt`). Each chapter has its own key, so two tabs changing different chapters never overwrite each other. Clearing keeps the record as `done: false`, so a backup merge can pick whichever change came later for each chapter. Deleting the book removes these too.
- `reader:settings`: Book reader settings: font size (`fontSize`) and read-aloud settings (`voiceURI`, `rate`, `allowOnlineVoices`, `repeat`, `autoPause`)
- `meta:legacyMigration`: Progress and completion marker for moving old notes
- `meta:netflixUnplaced:{videoId}`: IDs of Netflix notes the study panel could not match to any line of that video. The memo collection uses it to show "위치를 찾지 못함" (location not found). The panel rewrites it each time it opens, so it is not part of backups.

### Netflix localStorage

Study records and settings stay in the `localStorage` of the Netflix page as before. Key names are collected in [storageKeys.ts](src/pages/Content/constants/storageKeys.ts).

- `NF_studied_videos`: Metadata for studied videos (ID, title, cover image, total pages, update time, and so on)
- `NF_checklist_{videoId}`: Five-step checklist for each round and page of a video
- `NF_itemsPerPage_{videoId}`: Lines per page for a video
- `NF_isEnglishVisible`, `NF_isKoreanVisible`: Subtitle visibility
- `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`: Playback settings
- `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_studyPanelWidthRatio`, `NF_fontSize`: Display settings
- `NF_lingoActive`, `NF_preferredTextLocale`: Values used for subtitle handling
- `NF_annotations_{videoId}`: Old highlights and notes. After they are moved to the extension's storage, these keys are neither read nor written, but they are left in place as the original copy.

### Moving old notes

When a Netflix page opens, `ensureLegacyMigration` in [storeClient.ts](src/pages/Content/utils/storeClient.ts) collects every `NF_annotations_*` value and sends it on, and [legacyMigration.ts](src/shared/storage/legacyMigration.ts) copies the notes into the extension's storage.

- If the video is in `NF_studied_videos`, its title, season, and episode are added to the note.
- The originals are never deleted or changed.
- A note whose id already exists is not overwritten, so running it again creates no duplicates. A video that was already moved is not moved again, so notes you deleted afterward do not come back.
- Each video is handled separately, so one broken JSON value does not block the others. If any video fails, the completion marker is not set and the move is retried the next time a Netflix page opens.

### Communication between the Netflix page and storage

The study script injected into the Netflix page cannot use `chrome.*` APIs, so it sends requests to the content script ([storeBridge.ts](src/pages/ContentLoader/storeBridge.ts)) with `window.postMessage`. The content script uses [protocol.ts](src/shared/bridge/protocol.ts) and [handler.ts](src/shared/bridge/handler.ts) to check that each message comes from the same window and origin, is a known operation, and touches only Netflix notes, then reads or writes storage. The dashboard's book reader and memo collection links also go through this channel, and the service worker ([index.ts](src/pages/Background/index.ts)) opens the tab.

## Key files

- Subtitle interception and alignment: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- Study panel: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- Highlights and notes (Netflix): [SentenceList.tsx](src/pages/Content/components/SentenceList.tsx), [useAnnotations.ts](src/pages/Content/hooks/useAnnotations.ts), [annotationHelper.ts](src/pages/Content/utils/annotationHelper.ts)
- Shared highlight and note UI: [annotationUi.tsx](src/shared/ui/annotationUi.tsx), [AnnotationEditor.tsx](src/shared/ui/AnnotationEditor.tsx), [annotations.css](src/shared/ui/annotations.css)
- Memo model and shared storage: [src/shared/memo/](src/shared/memo/), [src/shared/storage/](src/shared/storage/)
- Communication between the Netflix page and storage: [src/shared/bridge/](src/shared/bridge/), [storeBridge.ts](src/pages/ContentLoader/storeBridge.ts), [storeClient.ts](src/pages/Content/utils/storeClient.ts)
- Text cleanup and chapter splitting: [bookText.ts](src/shared/text/bookText.ts)
- Book reader, memo collection, backup: [src/pages/Reader/](src/pages/Reader/)
- Study progress: [progress.ts](src/pages/Reader/logic/progress.ts), [ProgressBar.tsx](src/pages/Reader/components/ProgressBar.tsx)
- Read aloud: [src/pages/Reader/tts/](src/pages/Reader/tts/) (sentence splitting, voice choice, and a speaker that avoids Chrome speech problems), [ReadAloud.tsx](src/pages/Reader/components/ReadAloud.tsx)
- Toolbar popup: [Popup.tsx](src/pages/Popup/Popup.tsx)
- Checklist: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- Dashboard: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- Overlay subtitles: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)

## Design baseline

New extension pages (book reader, memo collection, popup) follow the [design baseline](docs/design.md) taken from the study panel's look. Read it first before changing colors, fonts, buttons, or the look of highlights and notes. The document is in Korean.
