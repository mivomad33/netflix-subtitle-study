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

`reader-dev.html` and the in-memory store are only built in development and are not part of the `npm run build` output. The entry points are [dev.tsx](src/pages/Reader/dev.tsx) and [seed.ts](src/pages/Reader/dev/seed.ts).

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
- The dev in-memory store is not in `build`.
- No `.pem` file or backup JSON is tracked in git.

### Performance measurement

Run this while the dev server is running. It uses the Playwright installed in `~/.cache/design-tools` (override with `DESIGN_TOOLS_DIR`).

```bash
node scripts/perf/measure.mjs
```

[measure.mjs](scripts/perf/measure.mjs) measures three times on `reader-dev.html?seed=perf`: previewing a 2,000,000-character text (3 seconds or less), opening a 200,000-character chapter (1 second or less), and searching 5,000 notes (0.5 seconds or less).

## CI

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs `npm ci`, type checks, ESLint, tests, the build, and `check:build` in order on every push and pull request. The Node version is pinned in [.nvmrc](.nvmrc) (24).

## Stored data

Data is stored in two places.

### Extension storage

Highlights, notes, and books are stored in the extension's own storage, `chrome.storage.local`. The `unlimitedStorage` permission lifts the size limit. This data survives clearing Netflix site data but is removed when the extension is uninstalled, which is why the book reader has backup export and import ([backup.ts](src/pages/Reader/logic/backup.ts)). Key names are in [keys.ts](src/shared/storage/keys.ts), the read and write code is in [repo.ts](src/shared/storage/repo.ts), and the memo format is in [types.ts](src/shared/memo/types.ts).

- `memo:{id}`: One note. Each note has its own key, so two tabs saving different notes never overwrite each other. Netflix notes and book notes share one format. Each stores the source text (a sentence or a paragraph), the position within it, and the selected text, so it is reattached only where the source text is the same.
- `book:{id}`: Book information (title, author, chapter list, and so on)
- `bookch:{bookId}:{chapterId}`: The text of one chapter (an array of paragraphs)
- `pos:{bookId}`: The last reading position in a book (chapter and paragraph)
- `reader:settings`: Book reader settings (font size)
- `meta:legacyMigration`: Progress and completion marker for moving old notes

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
- Toolbar popup: [Popup.tsx](src/pages/Popup/Popup.tsx)
- Checklist: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- Dashboard: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- Overlay subtitles: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)

## Design baseline

New extension pages (book reader, memo collection, popup) follow the [design baseline](docs/design.md) taken from the study panel's look. Read it first before changing colors, fonts, buttons, or the look of highlights and notes. The document is in Korean.
