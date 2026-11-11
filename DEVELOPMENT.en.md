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

With the dev server running, open `http://localhost:3000/reader-dev.html` to see the book reader, memo collection, and backup pages without loading the extension. Instead of the service worker and Firestore, this page uses an in-memory store and a signed-in fake user ([fakeAuth.ts](src/pages/Reader/dev/fakeAuth.ts)), and saves the store's contents to that page's `localStorage`.

- `?auth=signedOut`, `?auth=loading`, `?auth=unconfigured`, `?auth=expired`: Show the signed-out, checking sign-in, Firebase not configured, and sign-in expired screens.
- `?signin=cancelled`: Sign-in fails as if the sign-in window had been closed.
- `?usage=full`: Usage appears to have reached the 20 MB limit.
- `?seed=demo`: Fills in books and notes using self-written sample text.
- `?seed=perf`: Fills in 20 books (one of them 2,000,000 characters) and 5,000 notes. For the text editing measurements it also adds 200 notes attached to the 200,000-character chapter `ch7` of the 2,000,000-character book (`perf-0`).
- `?fail=write`: Every write to the store fails (reads still work). Use it to see the save error notices on the book edit page and in the text editor.
- In the browser console, `window.nfStudyDev` provides `reset()`, `seedDemo()`, and `seedPerf()`. `failWrites(true)` and `failWrites(false)` turn write failures on and off without reloading. `changeChapterElsewhere(bookId, chapterId)` adds a paragraph at the start of that chapter as if another tab had edited it.
- The book editing pages open directly by address. The book edit page is `#/book/<book id>/edit` and the text editor is `#/book/<book id>/edit/<chapter id>` (add `?from=reader` to return to the reader instead of the book edit page after saving or cancelling). With the demo seed, open `reader-dev.html#/book/demo-lighthouse/edit` or `reader-dev.html#/book/demo-lighthouse/edit/ch1`.
  - Save error: edit the text and save at `reader-dev.html?fail=write#/book/demo-lighthouse/edit/ch1`.
  - Concurrent change notice: open the text editor, edit the text, call `await window.nfStudyDev.changeChapterElsewhere('demo-lighthouse', 'ch1')` in the console, then save. Call it while the reader has that chapter open to watch the reader reread the new text.
- Read aloud uses silent fake voices ([fakeSpeech.ts](src/pages/Reader/dev/fakeSpeech.ts)) by default. They send start and end signals timed by text length, so you can see the current-sentence highlight and auto scroll. Pick a voice set with `?voices=`; the choice is kept across reloads.
  - `device` (default): two Natural voices, one Premium voice, and the `basic` voices (the first three and the online English voice are listed)
  - `basic`: two plain device voices, a novelty voice (Bubbles), a Korean voice, and an online English voice (the two plain voices and the online English voice are listed, with a note)
  - `none`: no voices (shows the no-English-voice notice)
  - `unsupported`: like a browser without `speechSynthesis`
  - `real`: this browser's real voices
  - What the fake voices read is kept with timestamps in `window.nfStudyDev.speech.spoken`.

`reader-dev.html`, the in-memory store, the fake voices, and the fake sign-in are only built in development and are not part of the `npm run build` output. The entry points are [dev.tsx](src/pages/Reader/dev.tsx) and [seed.ts](src/pages/Reader/dev/seed.ts). The demo seed marks some chapters as studied, so books at 0%, partway, and 100% progress appear together.

### Viewing the Netflix study panel

With the dev server running, open `http://localhost:3000/netflix-dev.html` to see the study panel and the dashboard outside Netflix. It uses self-written fake lines and a fake player, and connects an in-memory store directly to the bridge handler instead of the service worker. It starts signed in.

- `?auth=out`: Signed out (shows the sign-in notice)
- `?auth=wait`: Still checking sign-in
- `?error=<error code>`: Saves fail with that error. Error codes are in [errors.ts](src/shared/storage/errors.ts), such as `quota-exceeded`, `resource-exhausted`, `unavailable`, and `unauthenticated`.
- `?dashboard=1`: Starts with the dashboard open.

The entry point is [dev.tsx](src/pages/Content/dev.tsx), and it is only built in development.

## Build

```bash
npm run build
```

This writes the output to the `build` folder and a release archive to the `zip` folder.

The extension ID is fixed by `key` in [manifest.json](src/manifest.json) (`flhkacfjjpipfoicbnmednajnhebihmb`), so moving or reloading the `build` folder keeps the same ID. The Google sign-in redirect address (`https://flhkacfjjpipfoicbnmednajnhebihmb.chromiumapp.org/`) and the Firebase Authentication authorized domain (`chrome-extension://flhkacfjjpipfoicbnmednajnhebihmb`) are set up for this ID.

### Firebase config

At build time, [webpack.config.js](webpack.config.js) reads the Firebase web config from `firebase.config.local.json` (JSON) at the repository root and puts it in the bundles. The file is in `.gitignore` and is never committed. Instead of the file, you can put the same JSON in the `NF_FIREBASE_CONFIG` environment variable, or point `NF_FIREBASE_CONFIG_FILE` at another file path (`NF_FIREBASE_CONFIG` takes precedence).

If you have access to this project (`nf-subtitle-study-21cae`), create the file with the Firebase CLI. Without `--out`, the same JSON is printed to the screen.

```bash
npx firebase-tools login
npx firebase-tools apps:sdkconfig WEB 1:777101314338:web:f8782f201bed5f99347d7b --project nf-subtitle-study-21cae --out firebase.config.local.json
```

The build uses only `apiKey`, `authDomain`, `projectId`, `appId`, `oauthClientId`, and `siteUrl` from the JSON and drops other fields. If any of `apiKey`, `projectId`, or `appId` is missing, the config is treated as absent. The two fields below are optional; without them, this project's values are used ([config.ts](src/shared/firebase/config.ts)).

- `oauthClientId`: The web OAuth client ID used by the Google sign-in window
- `siteUrl`: The site that hosts the privacy policy (`/privacy/`) and the copyright notice (`/copyright/`). Defaults to `https://nf-subtitle-study-21cae.web.app`

`npm run build` succeeds without the config file (this is the CI case). That build gets an empty value in place of the config and runs without Firebase: the book reader and the memo collection show "Firebase 설정이 없습니다" (Firebase is not configured) instead of sign-in, and on Netflix only the subtitle study features work, with default settings, as when signed out.

### Building with your own Firebase project

If you cannot get this project's config, create your own Firebase project and build with its config. The extension ID below is `flhkacfjjpipfoicbnmednajnhebihmb` (if you changed `key`, use the new ID).

1. Create a project in the [Firebase console](https://console.firebase.google.com/). The free Spark plan is enough.
2. Create a Cloud Firestore database.
3. In Authentication, enable the Google sign-in provider and add `chrome-extension://<extension ID>` to the authorized domains.
4. Register a web app.
5. In the Google Cloud console, set up the OAuth consent screen, and add `https://<extension ID>.chromiumapp.org/` to the authorized redirect URIs of a web application OAuth client.
6. From the repository root, deploy the security rules and index settings: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project ID>`
7. Create the config file with `npx firebase-tools apps:sdkconfig WEB <web app ID> --project <project ID> --out firebase.config.local.json`, then add the client ID from step 5 to the JSON as `oauthClientId`. If you host your own policy pages, add `siteUrl` too.
8. Build with `npm run build`.

### Deploying security rules and Hosting

The security rules ([firestore.rules](firestore.rules)), the index settings ([firestore.indexes.json](firestore.indexes.json)), and the privacy policy and copyright notice pages ([site/](site/)) are deployed with [firebase.json](firebase.json) at the repository root. Hosting serves the `site` folder. The default project is `nf-subtitle-study-21cae` in [.firebaserc](.firebaserc).

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
```

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

- The built manifest's permissions are exactly `storage`, `unlimitedStorage`, and `identity`, there are no `host_permissions`, `key` is present, and there is no `chrome_url_overrides`.
- The bundles connect only to external addresses on the allow list (Firestore, Firebase authentication, Google sign-in, the policy site) and load no external scripts or styles. Addresses that are never connected to (page links, library error messages, and so on) must also be listed, and any external address not on a list fails the check.
- The bundles injected into the Netflix page contain no Firebase code.
- The dev in-memory store, fake voices, fake sign-in, and the E2E build's emulator connection code are not in `build` (marker strings `NF_STUDY_DEV_STORAGE_SHIM`, `NF_STUDY_FAKE_SPEECH`, `NF_STUDY_DEV_FAKE_AUTH`, and `NF_STUDY_E2E_EMULATOR_LOGIN`).
- Neither the build output nor the files tracked in git contain a service account key or an OAuth client secret (`scripts/check-build.mjs` lists the patterns).
- No `.pem` file, backup JSON, `firebase.config.local.json`, or Firebase log file is tracked in git.

### Emulator tests

```bash
npm run test:emulator
```

This starts the Firebase emulators (Auth on 9099, Firestore on 8080, project `demo-nf-study`) with `firebase emulators:exec` and runs the `*.emulator.test.ts` files ([vitest.emulator.config.ts](vitest.emulator.config.ts)). They test the security rules ([rules.emulator.test.ts](src/test/rules.emulator.test.ts)), Firestore storage, backup, account deletion, and book editing. The book editing tests ([bookEdit.emulator.test.ts](src/pages/Reader/logic/bookEdit.emulator.test.ts)) check that when a text save fails partway the earlier text and notes are still read as they were and a retry completes the save, that another client receives the change within 10 seconds and then reads the new text, and that one save reads only the text chunks of the edited chapter and of the chapters holding notes that may reattach. Because it is a `demo-` project, no real Firebase project, config file, or sign-in is needed.

The emulators need Java 21. On macOS with `openjdk@21` installed through Homebrew, add it to PATH first.

```bash
export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH
```

### E2E tests

```bash
npm run test:e2e
```

This runs `npm run build` (into `build`, with this computer's config file) and `npm run build:e2e` (a build that connects to the emulators, into `build-e2e`), then starts the emulators and runs [extension.e2e.test.ts](e2e/extension.e2e.test.ts) ([vitest.e2e.config.ts](vitest.e2e.config.ts)). It loads the extension into Chromium with Playwright and checks that:

- The real build's book reader shows the sign-in button and the policy links before sign-in.
- Signing out clears the Firestore cache, so nothing of the previous account is shown.
- After adding a book and fixing a typo in a highlighted paragraph in the text editor, the highlight is drawn on the corrected text.
- The Netflix side still receives changes from another client after the service worker stops and reconnects.

It runs only locally and is not part of CI. It needs Java 21 and the Firebase config file (because it checks the real build's sign-in screen). Playwright is loaded from `~/.cache/design-tools/node_modules/playwright/index.mjs`; set `PLAYWRIGHT_MODULE` to use another path. Screenshots are saved to `docs/specs/20261108-0925-firebase-sync/screens/`, and those of the book editing case to `docs/specs/20261111-1712-book-edit/shots/`.

`npm run build:e2e` (`NF_E2E=1`) uses a demo config that connects to the emulators (`127.0.0.1`) and includes a service worker ([e2e.ts](src/pages/Background/e2e.ts)) that signs in with a fake Google account chosen by the test instead of the sign-in window. It is a test-only build, not for installing.

### Performance measurement

Run this while the dev server is running. It uses the Playwright installed in `~/.cache/design-tools` (override with `DESIGN_TOOLS_DIR`).

```bash
node scripts/perf/measure.mjs
```

[measure.mjs](scripts/perf/measure.mjs) measures nine times on `reader-dev.html?seed=perf`: previewing a 2,000,000-character text (3 seconds or less), opening a 200,000-character chapter (1 second or less), searching 5,000 notes (0.5 seconds or less), opening the book list with progress (1 second or less), opening the book list for the first time with 20 books in the older shape without chapter character counts (1 second or less), and the time from clicking "read from here" in a 200,000-character chapter to the first speech request (fake voices, 0.5 seconds or less), the time from clicking "이 장 고치기" (edit this chapter) in a 200,000-character chapter until the text editor is open (1 second or less), the time for one typed character to appear in that editor (0.1 seconds or less), and the time from clicking save after changing one character in that chapter, which has 200 notes attached, until the save is done and the reader is shown again (2 seconds or less). The last measurement also checks that all 200 notes are still attached after the save.

## CI

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs `npm ci`, type checks, ESLint, tests, the emulator tests (with Java 21 installed and the emulator files cached), the build, and `check:build` in order on every push and pull request. The build runs without the Firebase config file and needs no secret values. The E2E tests are not run. The Node version is pinned in [.nvmrc](.nvmrc) (24).

## Stored data

All study data is stored in the signed-in user's area `users/{uid}` of Cloud Firestore in Seoul (`asia-northeast3`). Inside the extension, Firebase (sign-in and Firestore) runs only in the service worker, and pages and the content script ask the service worker over `chrome.runtime` ports.

### Firestore document layout

Pages and storage code read and write by key name. Key names are in [keys.ts](src/shared/storage/keys.ts), the read and write code is in [repo.ts](src/shared/storage/repo.ts), and the memo format is in [types.ts](src/shared/memo/types.ts). [firestoreLayout.ts](src/shared/storage/firestoreLayout.ts) maps keys to Firestore documents, and [firestoreArea.ts](src/shared/storage/firestoreArea.ts) reads and writes them in the service worker. Documents live in two collections.

- `users/{uid}/kv/{docId}`: Documents that group small data. Each has a single field `e` (a map from entry name to value). The service worker subscribes to the whole `kv` collection once and keeps it in memory, so numerous items such as notes are grouped into a few documents to keep reads down. Writes go per map entry, so two tabs saving different entries of the same document never overwrite each other.
- `users/{uid}/ch/{docId}`: Chapter text chunks. Text is large and only needed when a chapter opens, so it is kept separately. The fields are `t` (part of the text JSON), `i` (chunk number), `n` (chunk count), and `v` (version). The document id is `{chapter}~{version}~{chunk number}`; chapters written earlier use `{chapter}~{chunk number}`.

Each key is stored as follows. Book, chapter, and video ids in document ids are URL-encoded.

- `memo:{id}` → entry `{id}` of `kv/memos-{0-31}`: One note. Notes are spread over 32 documents by a hash (FNV-1a) of the note id. Netflix notes and book notes share one format. Each stores the source text (a sentence or a paragraph), the position within it, and the selected text, so it is reattached only where the source text is the same.
- `book:{id}` → entry `m` of `kv/book-{id}`: Book information (title, author, chapter list, and so on). Each chapter has a character count `charCount`, so study progress is computed without reading the text. Books without it (such as books imported from older backups) get it filled once from their text the first time the book list or the reader opens them.
- `bookch:{bookId}:{chapterId}` → `ch/{bookId:chapterId}~{version}~{chunk number}`: The text of one chapter (an array of paragraphs), stored as JSON split into chunks of 300,000 characters (up to 100 chunks). Every write of the text makes a new version, and each version goes to its own documents. The chapter's entry `{n, v, bytes, l: 2, p?}` in `kv/chsizes` decides which version is read. `n` is the chunk count, `v` the version currently read, `bytes` the stored size, `l: 2` marks the new layout whose document ids include the version, and `p` lists chunk sets not yet deleted (a new version that was never finished, or an old version after a switch). When the same chapter opens again with the same version, the chunks come from the Firestore cache.
- `pos:{bookId}` → entry `{bookId}` of `kv/positions`: The last reading position in a book (chapter and paragraph)
- `done:{bookId}:{chapterId}` → entry `{bookId}:{chapterId}` of `kv/done-{0-7}`: Study completion of one chapter (`done`, `updatedAt`). Clearing keeps the record as `done: false`, so a backup merge can pick whichever change came later for each chapter. Deleting the book removes these too.
- `reader:settings` → entry `reader` of `kv/settings`: Book reader settings: font size (`fontSize`) and read-aloud settings (`voiceURI`, `rate`, `repeat`, `autoPause`). The old `allowOnlineVoices` is no longer used, but stored values and backups that have it are still accepted.
- `nf:settings` → entry `netflix` of `kv/settings`: One object of Netflix study panel settings (panel, overlay subtitle, and per-language subtitle visibility, auto-pause, page-end pause, skipping silent stretches, smart skim, sentence loop, font size, panel width ratio). Its shape is in [netflixRecords.ts](src/shared/bridge/netflixRecords.ts).
- `nf:checklist:{videoId}` → entry `{videoId}` of `kv/nf-checklists-0`–`15` (split by a hash of the video id): Five-step checklist for each round and page of a video
- `nf:itemsPerPage:{videoId}` → entry `{videoId}` of `kv/nf-pages`: Lines per page for a video
- `nf:studied:{videoId}` → entry `{videoId}` of `kv/nf-studied`: Metadata for a studied video (ID, title, cover image, total pages, update time, and so on)
- `meta:netflixUnplaced:{videoId}` → entry `{videoId}` of `kv/nf-unplaced`: IDs of Netflix notes the study panel could not match to any line of that video. The memo collection uses it to show "위치를 찾지 못함" (location not found). The panel rewrites it each time it opens, so it is not part of backups.

Rewriting a chapter's text ([firestoreArea.ts](src/shared/storage/firestoreArea.ts)) takes four steps. It first records the new version in the entry's `p`, writes the new version's chunks, sends the write that switches the entry to the new version in one batch with the book information, notes, and reading position, and then deletes the old version's chunks. So wherever it fails, the text and the notes are either both old or both new, and another client reading during a rewrite gets the whole old text or the whole new text. Chunks left behind by a failure are listed in `p` and deleted the next time that chapter is written or deleted (a version another client may still be writing is deleted only after 1 hour).

An entry without `l` uses the earlier layout (`{chapter}~{chunk number}`) and is read as is. Stored data is not migrated in bulk; a chapter moves to the new layout when it is rewritten. Conversely, a build from before this change cannot read chapters in the new layout, so the extension must be updated together on every computer that uses the same account.

### Storage limit and security rules

- The app sizes documents following [how Firestore calculates storage size](https://firebase.google.com/docs/firestore/storage-size) (adding the document id index share so it never counts less than the real size). If the total after a write would exceed 20 MB (20×1024×1024 bytes), the write is not sent and fails with a `quota-exceeded` error. The book reader shows this usage.
- When Firestore returns a free quota error (`resource-exhausted`), the pages show a notice that the daily limits reset at midnight Pacific time, with a retry button. Pages pick notices by error code and never show the original error text ([storageErrors.ts](src/shared/ui/storageErrors.ts)).
- The security rules ([firestore.rules](firestore.rules)) let a signed-in user read and write only their own `users/{uid}` and deny everything else. Rules cannot measure a document's size in bytes, so they cap document id shapes, map entry counts, list lengths, and string lengths.
- Field indexes are turned off in [firestore.indexes.json](firestore.indexes.json).

### Sign-in and account deletion

- The service worker ([googleSignIn.ts](src/pages/Background/googleSignIn.ts)) opens the Google sign-in window with `chrome.identity.launchWebAuthFlow` (scope `openid email`) to get an ID token, and [backend.ts](src/pages/Background/backend.ts) signs in to Firebase Authentication with it. Signing in to the Chrome profile is not needed. The sign-in state is kept in the service worker's IndexedDB, so it survives restarting Chrome.
- The Firestore cache (IndexedDB) is cleared on sign-out and on account deletion.
- Account deletion ([account.ts](src/pages/Background/account.ts)) deletes all of the user's Firestore documents first and the Firebase account last. If a recent sign-in is required, it reauthenticates through the sign-in window, and if it is interrupted, deleting again removes the remaining data first.

### Backup file

The backup file made by [backup.ts](src/pages/Reader/logic/backup.ts) has format `nf-study-backup`, version 2, and holds every key above except `meta:` ones in `data`, under their key names. Version 2 added the Netflix study records (`nf:` keys), and version 1 files are still accepted. Import keeps whichever side has the newer `updatedAt` for each key, deletes nothing, and refuses the import if the total after merging would exceed 20 MB.

### Removing old local data

The updated extension does not move data that earlier versions kept on this computer into Firestore; it deletes it.

- The first time the service worker runs, [localCleanup.ts](src/pages/Background/localCleanup.ts) removes keys starting with `memo:`, `book:`, `bookch:`, `pos:`, `done:`, or `meta:` and the `reader:settings` key from `chrome.storage.local`, then sets the marker `cleanup:localData:v1` so it does not run again. Study data is no longer kept in `chrome.storage.local`.
- Every time a Netflix page opens, [legacyCleanup.ts](src/pages/Content/utils/legacyCleanup.ts) removes the old study record keys listed in [storageKeys.ts](src/pages/Content/constants/storageKeys.ts) from the Netflix `localStorage`: `NF_studied_videos`, `NF_isPanelVisible`, `NF_isOverlayVisible`, `NF_isEnglishVisible`, `NF_isKoreanVisible`, `NF_isAutoPause`, `NF_isPageEndPause`, `NF_isAutoSkip`, `NF_isSmartSkim`, `NF_isSentenceLoop`, `NF_fontSize`, `NF_studyPanelWidthRatio`, and keys starting with `NF_itemsPerPage_`, `NF_checklist_`, or `NF_annotations_`. New code never uses these keys, so they are removed every time without a marker. Unlisted keys and Netflix's own keys are left alone.

### Netflix localStorage

Only two values used for subtitle handling remain in the Netflix page's `localStorage` ([storageKeys.ts](src/pages/Content/constants/storageKeys.ts)). They are not study records but the subtitle handling state of that browser, so they are not saved to the account.

- `NF_lingoActive`, `NF_preferredTextLocale`

### Communication between the Netflix page, extension pages, and the service worker

The study script injected into the Netflix page cannot use `chrome.*` APIs, so it sends requests to the content script ([storeBridge.ts](src/pages/ContentLoader/storeBridge.ts)) with `window.postMessage`. The content script uses [protocol.ts](src/shared/bridge/protocol.ts) to check that each message comes from the same window and origin and is a known operation, then passes it to the service worker over a port (`nf-study-netflix`) opened with `chrome.runtime.connect`. Firebase does not run in the content script. The service worker ([server.ts](src/pages/Background/server.ts)) checks that the port comes from this extension on the Netflix page (`https://www.netflix.com`), and [handler.ts](src/shared/bridge/handler.ts) handles only Netflix note and Netflix study record operations. The Netflix side gets back only whether the user is signed in and error codes. The dashboard's book reader and memo collection links also go through this channel, and the service worker opens the tab.

The book reader and the memo collection open a port (`nf-study-ext`) with [extClient.ts](src/shared/rpc/extClient.ts) to use the whole store and to sign in, sign out, delete the account, and get usage. The message format is in [protocol.ts](src/shared/rpc/protocol.ts). The service worker stops when idle, so ports send a signal every 20 seconds, reconnect when cut off, resend pending requests, and reread changes missed in between ([portClient.ts](src/shared/rpc/portClient.ts)). Changes made on other pages or computers reach the service worker through its Firestore subscription, and it tells the open ports what changed.

## Key files

- Subtitle interception and alignment: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)
- Study panel: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)
- Highlights and notes (Netflix): [SentenceList.tsx](src/pages/Content/components/SentenceList.tsx), [useAnnotations.ts](src/pages/Content/hooks/useAnnotations.ts), [annotationHelper.ts](src/pages/Content/utils/annotationHelper.ts)
- Shared highlight and note UI: [annotationUi.tsx](src/shared/ui/annotationUi.tsx), [AnnotationEditor.tsx](src/shared/ui/AnnotationEditor.tsx), [annotations.css](src/shared/ui/annotations.css)
- Memo model and shared storage: [src/shared/memo/](src/shared/memo/), [src/shared/storage/](src/shared/storage/)
- Firestore document layout and security rules: [firestoreLayout.ts](src/shared/storage/firestoreLayout.ts), [firestoreArea.ts](src/shared/storage/firestoreArea.ts), [firestore.rules](firestore.rules)
- Service worker (sign-in, Firebase, account deletion, old data cleanup): [src/pages/Background/](src/pages/Background/), [config.ts](src/shared/firebase/config.ts)
- Ports between extension pages or the content script and the service worker: [src/shared/rpc/](src/shared/rpc/)
- Communication between the Netflix page and the service worker: [src/shared/bridge/](src/shared/bridge/), [storeBridge.ts](src/pages/ContentLoader/storeBridge.ts), [storeClient.ts](src/pages/Content/utils/storeClient.ts), [studyStore.ts](src/pages/Content/utils/studyStore.ts)
- Sign-in and account UI: [src/pages/Reader/account/](src/pages/Reader/account/), Netflix sign-in notice [StudyNotices.tsx](src/pages/Content/components/StudyNotices.tsx)
- Privacy policy and copyright notice pages: [site/](site/)
- Text cleanup and chapter splitting: [bookText.ts](src/shared/text/bookText.ts)
- Book reader, memo collection, backup: [src/pages/Reader/](src/pages/Reader/)
- Book editing: [BookEditor.tsx](src/pages/Reader/components/BookEditor.tsx) (book edit page), [ChapterEditor.tsx](src/pages/Reader/components/ChapterEditor.tsx) (text editor, find and replace), [bookEdit.ts](src/pages/Reader/logic/bookEdit.ts) (saving books and chapters, concurrent change checks, the size limit), [chapterEdit.ts](src/shared/text/chapterEdit.ts) (comparing the text before and after an edit to move notes and the reading position, reattaching detached notes), [leaveGuard.tsx](src/pages/Reader/leaveGuard.tsx) (leave confirmation while there are unsaved edits), [route.ts](src/pages/Reader/route.ts) (page addresses)
- Study progress: [progress.ts](src/pages/Reader/logic/progress.ts), [ProgressBar.tsx](src/pages/Reader/components/ProgressBar.tsx)
- Read aloud: [src/pages/Reader/tts/](src/pages/Reader/tts/) (sentence splitting, voice choice, and a speaker that avoids Chrome speech problems), [ReadAloud.tsx](src/pages/Reader/components/ReadAloud.tsx)
- Toolbar popup: [Popup.tsx](src/pages/Popup/Popup.tsx)
- Checklist: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)
- Dashboard: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)
- Overlay subtitles: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)

## Design baseline

New extension pages (book reader, memo collection, popup) follow the [design baseline](docs/design.md) taken from the study panel's look. Read it first before changing colors, fonts, buttons, or the look of highlights and notes. The document is in Korean.
