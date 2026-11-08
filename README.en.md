<div align="center">

<img src="src/assets/img/icon-128.png" height="96" alt="netflix-subtitle-study icon">

<h1>netflix-subtitle-study</h1>

<p>A Chrome extension that turns Netflix English and Korean subtitles into a script, so you can study a language sentence by sentence while you watch. You can also paste in an English book and take notes as you read.</p>

[![Chrome Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](src/manifest.json)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Webpack 5](https://img.shields.io/badge/Webpack-5-8DD6F9?logo=webpack&logoColor=black)](webpack.config.js)
[![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)](vitest.config.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

[Features](#features) · [Book reader and memo collection](#book-reader-and-memo-collection) · [Hotkeys](#hotkeys) · [How it works](#how-it-works) · [Quick start](#quick-start) · [Development guide](DEVELOPMENT.en.md)

[한국어](README.md) | **English**

</div>

<p align="center">
  <img src="assets/readme/study-panel.png" width="900" alt="Dual-language subtitles over the video with the study panel on the right">
  <br/>
  <sub>Made with invented dialogue. In real use, the Netflix video plays on the left. The interface is in Korean.</sub>
</p>

## About

When you learn from subtitles, replaying sentences, keeping a script, and tracking your progress all take extra work. This extension adds a study panel beside the Netflix player and handles all of that in one place.

It lines up the English and Korean subtitles of the current video into a single script, then adds playback controls such as sentence looping and auto-pause, along with study records for each round. Paste in the text of an English book to highlight and take notes the same way, and find your Netflix and book notes in one place.

Study records such as rounds and checklists, along with settings, are stored in the Netflix site's `localStorage`. Highlights, notes, and books are stored in the extension's own storage, so notes survive clearing Netflix site data. Uninstalling the extension removes them too, so you can export a backup file.

## Features

- **Dual-language script**: Aligns the English and Korean subtitles of the current video by time and shows them side by side. The video must have both subtitle tracks.
- **Live script tracking**: Highlights the sentence being played and scrolls to it. Click a sentence to play from there.
- **Sentence-level playback**: Loop a sentence, pause after every line, or pause at the end of a page.
- **Skip silent stretches**: Skip gaps of 5 seconds or more entirely, or use smart skim to jump 5 seconds at a time with a 2-second preview.
- **Subtitles over the video**: Shows English and Korean subtitles on the player, with each language hideable.
- **Five-step checklist**: Track pre-study, watching without subtitles, script analysis, shadowing, and composition practice on each page. Add a round to keep its records separate.
- **Highlights and notes**: Drag over a word or phrase in an English line to highlight it or attach a multi-line note. Click a highlight to reopen its note; the video pauses while a note is open. Notes are saved in the extension's storage, so they are kept when you reset study progress or clear Netflix site data, and you can browse them together with book notes in the [memo collection](#book-reader-and-memo-collection).
- **AI prompt copy**: Copy a pre-study prompt or a composition prompt containing the current page's script, then paste it into an AI chatbot.
- **Study dashboard**: Adds a tab to the Netflix top menu where you can see your videos, progress, and rounds, and pick up where you left off. You can also open the book reader and the memo collection from the dashboard.

You can also adjust the panel width, font size, and lines per page (20, 50, 100, or 150).

<p align="center">
  <img src="assets/readme/dashboard.png" width="760" alt="Dashboard showing progress and rounds for studied videos">
  <br/>
  <sub>The study dashboard. Titles and images are placeholder data.</sub>
</p>

## Book reader and memo collection

Pages inside the extension let you read English books and browse the notes you left on Netflix and in books. Click the extension icon in the toolbar to open the popup, then click **원서 리더** (book reader) or **메모 모아 보기** (memo collection) to open it in a new tab. The Netflix study dashboard has the same two links.

- **Add a book**: Enter a title (required) and an author (optional), then paste the whole text. **본문 정리** (clean up text, on by default) joins line-end breaks, rejoins words split by hyphens, and splits paragraphs on blank lines. Chapter headings such as `Chapter 1`, `CHAPTER ONE`, `Part 2`, a Roman or Arabic numeral alone on a line, and `Prologue` or `Epilogue` are detected and used to split chapters. Before saving, the preview lets you rename chapters, merge a chapter into the previous one, or start a new chapter at any paragraph. A book can hold up to 2,000,000 characters.
- **Read a book**: Pick a chapter from the chapter list to see its text paragraph by paragraph. Highlight and take notes the same way as in the Netflix study panel, and see the chapter's notes in **이 장의 메모** (notes in this chapter) beside the text. The reader remembers the last chapter and paragraph for each book and resumes there, and the book list shows where to continue, such as "이어 읽기: 2장 〈chapter title〉" (continue: chapter 2). Use **가−** and **가+** to change the font size.
- **Study completion and progress**: Mark a chapter as studied with its check in the chapter list or with **이 장 학습 완료** (mark this chapter studied) at the end of the text; click again to clear it. Completion changes only when you set it, never just because you read or listened to the end. The book list and the reader show progress with a bar, such as "45% · 12장 중 5장 완료" (45%, 5 of 12 chapters studied). Progress is weighted by characters, not by chapter count, so a short preface does not count as much as a long chapter. It reaches 100% only when every chapter is done.
- **Read aloud**: The reading bar above the text reads the book sentence by sentence with the browser's built-in voices. See [Read aloud](#read-aloud) below.
- **Edit the text**: The text cannot be edited after saving. To change it, delete the book from the book list and add it again. Deleting a book also removes its notes and reading position.
- **Memo collection**: Shows Netflix and book notes in one list, most recently edited first. Search the selected text, note, source text, and title without regard to case, and filter by source (all, Netflix, books, one book, or one video) and by **메모 글이 있는 것만** (only with note text). You can edit or delete notes from the list. **원래 위치로** (go to source) opens the book chapter at the highlight, or opens the Netflix video at that scene in a new tab. Notes whose source text changed are kept and marked "위치를 찾지 못함" (position not found).
- **Backup**: **백업 내보내기** (export backup) at the top of the page downloads all books, notes, reading positions, study completion records, and settings (font size and reading settings) as a single `nf-study-backup-YYYYMMDD.json` file. **백업 가져오기** (import backup) asks for confirmation, then merges matching items and keeps whichever was edited last, without deleting anything you already have. A file in the wrong format changes nothing.

### Read aloud

It uses the browser's built-in voices (Web Speech API), so it is free and needs no new permission.

- **Reading bar**: **재생**·**일시정지**·**정지** (play, pause, stop), **이전 문장**·**다음 문장** (previous and next sentence), rate (0.5x to 2x), voice, **문장 반복** (repeat sentence) and **문장마다 멈춤** (pause after each sentence). Hover over a paragraph and click the ▶ on its left (read from here) to start there. The first play starts at the paragraph you were reading, and play after a pause restarts that sentence from its beginning. While reading, click a sentence in the text to read from it.
- **Current sentence**: The sentence being read gets a blue background, and the page follows it when it leaves the screen. Scroll yourself and following stops, with a **읽는 곳으로** (back to reading) button to return.
- **End of chapter**: Reading stops at the end of a chapter and offers **다음 장 읽기** (read next chapter).
- **Read a selection**: Select text and click **읽기** (read) in the highlight toolbar to hear only that text.
- **Shadowing**: **문장 반복** repeats the current sentence until you turn it off, and **문장마다 멈춤** stops after each sentence. After repeating it yourself, press play or `D` for the next sentence.
- **Voices**: Only good-sounding English device voices are listed. Chrome's natural voices kept on the device (such as "Google US English 1 (Natural)") come first, then macOS high-quality voices (names ending in Premium or Enhanced). Only when none of these exist are the plain device voices (such as Samantha) shown, with a note. Novelty voices (Bubbles, Zarvox and the like) are never listed. Rate, voice, repeat, and pause settings are remembered. If the chosen voice is not available, the first listed voice reads instead.
- **Text stays on your computer**: Only device voices are used. Online voices (such as Chrome's "Google US English", which sends the text to Google's servers) are not used.
- **Getting better English voices (macOS)**: In System Settings › Accessibility › Spoken Content, pick or download an English voice from the **System Voice** menu (voices with a download icon are downloaded from Apple over the internet). Reopen Chrome afterward. When no English device voice is available, the reading bar shows this guidance instead.

## Hotkeys

Hotkeys are ignored while you type in an input field.

| Key | Action | Description |
| :-: | :-- | :-- |
| `Space` | Play/pause | Plays or pauses the video even while the study panel has focus. A panel button you just clicked is not pressed again. |
| `Q` | Toggle auto-pause | Pauses the video after every line. |
| `R` | Toggle sentence loop | Repeats the current sentence. |
| `T` | Toggle study panel | Shows or hides the panel on the right. |
| `W` | Step back | Goes to the previous line, or moves back part of the way when the gap is wide. |
| `E` | Step forward | Goes to the next line, or jumps 5 seconds if it is 5 seconds or more away. |
| `A` | Previous sentence | Plays from the start of the previous sentence. |
| `S` | Current sentence | Replays from the start of the current sentence. |
| `D` | Next sentence | Plays from the start of the next sentence. |

Read aloud in the book reader uses the same keys. They are ignored in the memo editor, input fields, and select boxes.

| Key | Action | Description |
| :-: | :-- | :-- |
| `Space` | Play/pause | A focused button is not pressed again. |
| `A` | Previous sentence | Reads from the previous sentence. |
| `S` | Current sentence | Reads the current sentence again from its beginning. |
| `D` | Next sentence | Reads from the next sentence. |
| `Q` | Toggle pause after each sentence | Stops after one sentence. |
| `R` | Toggle repeat sentence | Repeats the current sentence. |

## How it works

```mermaid
flowchart LR
    A["Netflix player<br/>manifest response"] --> B["Network interceptor<br/>finds subtitle tracks"]
    B --> C["Download English<br/>and Korean subtitles"]
    C --> D["Subtitle alignment<br/>one line per sentence"]
    D --> E["Study panel"]
    D --> F["Overlay subtitles"]
    E <--> G["Player API<br/>time and seeking"]
    E --> H["localStorage<br/>rounds and checklists"]
    H --> I["Study dashboard"]
    E <--> J["Extension storage<br/>highlights, notes, books"]
    J <--> K["Book reader<br/>memo collection"]
```

The extension's script runs inside the Netflix page and wraps `JSON.parse` to find the video manifest. It picks both subtitle tracks from the manifest, downloads them, and aligns them by time into a script. The panel reads the player's current time with `requestAnimationFrame` to find the active sentence.

Highlights and notes live in the extension's storage (`chrome.storage.local`). The script inside the Netflix page cannot use `chrome.*` APIs, so it sends requests to the content script in the same tab with `window.postMessage`, and the content script checks each request before reading or writing storage. The book reader and the memo collection use the same storage directly. Notes saved earlier in the Netflix `localStorage` are copied into the extension's storage automatically when you open a Netflix page, and the originals are not deleted.

## Quality

- Vitest and React Testing Library cover subtitle parsing and alignment, playback hooks, hotkeys, data migration, text cleanup and chapter splitting, memo search, backup, and UI components.
- TypeScript type checks and ESLint run through npm scripts.
- GitHub Actions runs type checks, ESLint, tests, the build, and a check of the build output (permissions, external resource loads, and so on) on every push and pull request.
- Older checklist data is converted to the round-based format when loaded. Older notes in the Netflix `localStorage` are copied into the extension's storage, and the originals are kept.

## Tech stack

- **Extension**: Chrome Manifest V3
- **Frontend**: React 18, TypeScript 4.9, CSS and SCSS
- **Build**: Webpack 5, Webpack Dev Server 4, Babel
- **Testing**: Vitest 4, React Testing Library, jsdom

## Quick start

The extension is not on the Chrome Web Store, so you build and install it yourself. You need Node.js 24 (recommended, see [.nvmrc](.nvmrc)) and Chrome or another Chromium-based browser.

```bash
git clone https://github.com/mivomad33/netflix-subtitle-study.git
cd netflix-subtitle-study
npm install
npm run build
```

1. Enter `chrome://extensions/` in the Chrome address bar.
2. Turn on **Developer mode** in the top right.
3. Click **Load unpacked** and select the `build` folder.
4. Play a Netflix video that has English and Korean subtitles. The study panel opens on the right.
5. Click the extension icon in the toolbar to open the book reader or the memo collection.

The extension ID is fixed by `key` in [manifest.json](src/manifest.json), so moving the `build` folder keeps the same storage. If you installed the extension before the ID was fixed, the ID changes once. Remove the old extension and load the `build` folder again. Your old notes are copied from the Netflix `localStorage` automatically the next time you open Netflix.

See the [development guide](DEVELOPMENT.en.md) for the dev server, tests, CI, and stored data.

## Project structure

```text
src/
├── manifest.json          # Extension settings
├── pages/
│   ├── Background/        # Service worker
│   ├── ContentLoader/     # Entry that injects the study script, storage relay
│   ├── Content/           # Study panel, dashboard, playback control
│   │   ├── components/    # Panel components
│   │   ├── hooks/         # Player integration, hotkeys
│   │   └── utils/         # Subtitles, UI injection, layout
│   ├── Reader/            # Book reader, memo collection, backup
│   └── Popup/             # Toolbar popup
├── shared/                # Code shared by the Netflix pages and the book reader
│   ├── memo/              # Memo model
│   ├── storage/           # Shared storage, moving old notes
│   ├── bridge/            # Messages between the Netflix page and storage
│   ├── text/              # Text cleanup, chapter splitting
│   └── ui/                # Highlight and note UI
└── types/                 # Shared types
scripts/                   # Build output check, performance measurement
utils/                     # Build and dev server scripts
.github/workflows/         # CI
docs/                      # Design baseline, specs
assets/readme/             # README images
```

## License

Released under the [MIT](LICENSE) License. This project is not affiliated with or endorsed by Netflix. Please review the Netflix Terms of Use yourself.
