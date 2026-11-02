# 🎬 netflix-subtitle-study

<p align="center">
  <img src="src/assets/img/icon-128.png" width="96" alt="netflix-subtitle-study Icon"/>
</p>

**netflix-subtitle-study**는 넷플릭스 시청 환경을 강력한 외국어 학습 도구로 변환해 주는 React 18, TypeScript, Webpack 5 기반의 크롬 익스텐션(Manifest V3)입니다. 

단순히 자막을 동시에 보여주는 것을 넘어, 넷플릭스 비디오 플레이어와의 깊은 통합을 통해 문장 반복, 자동 일시정지, 스마트 건너뛰기, 다회독 체크리스트, 학습 기록 대시보드 등의 고도화된 기능들을 제공합니다.

---

## 🛠️ 기술 스택 (Tech Stack)

*   **Core**: React 18.2.0, TypeScript 4.9.4
*   **Extension Version**: Manifest V3
*   **Build Tool**: Webpack 5.75.0, Webpack Dev Server 4.11.1
*   **Styles**: SCSS / CSS
*   **Test**: Vitest 4.1.10, React Testing Library

---

## ✨ 핵심 기능 (Key Features)

### 1. 📡 넷플릭스 자막 인터셉트 및 싱크 정렬
*   **네트워크 레벨 감지**: 넷플릭스 웹페이지의 API 통신 데이터(`JSON.parse` / `JSON.stringify`)를 패칭(Monkey Patching)하여, 재생 중인 비디오의 영어(`en`) 및 한국어(`ko`) WebVTT 자막 다운로드 주소를 정확히 가로챕니다.
*   **자막 싱크 매칭**: 두 언어 자막의 시간대를 분석하여 최적의 형태로 동기화 및 1:1 대응 정렬하여 학습용 데이터를 구축합니다.
*   **구현 파일**: [networkInterceptor.ts](src/pages/Content/utils/networkInterceptor.ts), [subtitleHelper.ts](src/pages/Content/utils/subtitleHelper.ts)

### 2. 📊 학습 대시보드 (Study Dashboard)
*   **글로벌 내비게이션 바 통합**: 넷플릭스 상단 헤더 영역(`tabbed-primary-navigation` 등)에 **'📊 나의 학습 대시보드'** 탭을 자연스럽게 주입합니다.
*   **학습 영상 리스트**: 현재까지 학습한 영상 목록, 완독한 횟수(라운드), 학습 진척율(체크리스트 달성도)을 한눈에 확인할 수 있습니다.
*   **구현 파일**: [StudyDashboardModal.tsx](src/pages/Content/StudyDashboardModal.tsx), [dashboardHelper.ts](src/pages/Content/utils/dashboardHelper.ts)

### 3. 📝 학습 패널 (Study Panel)
*   **실시간 타임 트래킹**: 플레이어의 현재 재생 시간(`currentTime`)을 매 프레임별로 추적하여 학습 패널 내부 대본의 현재 위치를 강조 표시하고 자동 스크롤합니다.
*   **스마트 컨트롤**: 문장 개수 기준(기본 50문장)으로 탭이 분할되며, 재생 속도 조절 및 학습 편의 기능들을 제어할 수 있습니다.
*   **AI 프롬프트 연동**: 해당 페이지의 대본을 복사하여 ChatGPT 등 AI 챗봇에게 학습/스피킹 교정을 바로 요청할 수 있는 프롬프트 템플릿 복사 기능이 제공됩니다.
*   **구현 파일**: [StudyPanel.tsx](src/pages/Content/StudyPanel.tsx), [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts)

### 4. 🗂️ 다회독 학습 체크리스트 (Study Checklist)
*   **5단계 학습 사이클**: 문장 탭별로 아래 5단계 수행 여부를 개별 체크할 수 있습니다.
    1.  `Pre-study` (사전 학습)
    2.  `No Subtitles` (자막 없이 보기)
    3.  `Script Analysis` (대본 분석)
    4.  `Shadowing` (쉐도잉)
    5.  `Speaking` (스피킹)
*   **다중 회차(Round) 지원**: 1회차 완독 후 2회차, 3회차 등 회차를 추가하여 기록을 별도로 유지할 수 있습니다.
*   **구현 파일**: [StudyChecklist.tsx](src/pages/Content/StudyChecklist.tsx)

### 5. 🔁 현재 문장 무한 반복 (Sentence Loop)
*   **연속 쉐도잉 학습**: 활성화 시 현재 자막이 끝날 때마다 자막 오디오 잔향(+400ms 버퍼)을 고려하여 해당 문장의 처음으로 돌아가 무한 반복합니다.
*   **스마트 자막 동기화**: 단축키나 클릭으로 이동 시 새로 이동한 문장이 자동으로 새로운 반복 대상이 됩니다.
*   **구현 파일**: [useNetflixPlayer.ts](src/pages/Content/hooks/useNetflixPlayer.ts), [useStudyHotkeys.ts](src/pages/Content/hooks/useStudyHotkeys.ts)

### 6. 💬 스마트 자막 오버레이 (Video Overlay Subtitle)
*   넷플릭스 플레이어 화면 내부 중앙/하단에 영어 자막 및 한국어 번역을 동시에 표시하며, 학습 설정에 따라 특정 언어 자막을 숨기거나 보이게 처리할 수 있습니다.
*   **구현 파일**: [VideoOverlaySubtitle.tsx](src/pages/Content/VideoOverlaySubtitle.tsx)

---

## ⌨️ 단축키 안내 (Hotkeys)

재생 화면 및 학습 패널이 활성화된 상태에서 아래 단축키를 사용하여 빠르게 비디오와 자막을 제어할 수 있습니다.

| 단축키 | 기능 | 설명 |
| :---: | :--- | :--- |
| **Q** | **자동 일시정지 토글** | 활성화 시 하나의 자막 대사가 끝날 때마다 비디오가 자동으로 일시정지됩니다. |
| **R** | **문장 무한 반복 토글** | 활성화 시 현재 재생 중인 자막 문장을 무한 연속 반복합니다. |
| **T** | **학습 패널 열기/닫기 토글** | 우측 스터디 대본 패널 화면을 즉시 보이기/숨기기 토글합니다. |
| **W** | **템포 되감기** | 이전 대사의 시작 위치로 이동하며, 대사가 길거나 간격이 넓은 경우 스마트하게 시간을 조절합니다. |
| **E** | **템포 건너뛰기** | 다음 대사의 시작 위치 혹은 5초 앞으로 빠르게 이동합니다. |
| **A** | **이전 문장 재생** | 현재 활성화된 자막의 바로 이전 자막 시작 위치로 이동하여 재생합니다. |
| **S** | **현재 문장 반복** | 현재 활성화된 자막의 시작 위치로 이동하여 다시 재생합니다. |
| **D** | **다음 문장 재생** | 현재 활성화된 자막의 다음 자막 시작 위치로 이동하여 재생합니다. |

---

## 💾 데이터 저장 구조 (LocalStorage Schema)

익스텐션의 모든 학습 데이터는 브라우저의 `localStorage`에 안전하게 영구 저장됩니다.

*   `nf_studied_videos`: 학습한 전체 영상의 메타데이터 정보 (ID, 제목, 커버 이미지, 총 페이지 수, 업데이트 시간 등)
*   `nf_checklist_study_{videoId}`: 해당 비디오의 회차(Round)별 및 페이지(Tab)별 5단계 체크리스트 달성 현황 데이터
*   `nf_is_english_visible` / `nf_is_korean_visible`: 자막 표시 설정값
*   `nf_is_auto_pause` / `nf_is_auto_skip` / `nf_is_page_end_pause` / `NF_isSentenceLoop`: 플레이어 동작 설정값

---

## 🚀 시작하기 (Getting Started)

### 사전 요구사항
*   **Node.js**: 버전 18 이상 설치 권장
*   **Chrome 브라우저** (또는 Chromium 기반 브라우저)

### 설치 및 실행 순서
1.  **프로젝트 클론 및 디렉토리 이동**
2.  **의존성 패키지 설치**
    ```bash
    npm install
    ```
3.  **개발 서버 실행 (핫 리로드 지원)**
    ```bash
    npm start
    ```
    *Webpack Dev Server가 시작되어 변경 사항이 실시간으로 빌드 폴더(`build/`)에 반영됩니다.*

4.  **크롬 브라우저에 익스텐션 로드**
    *   Chrome 브라우저 주소창에 `chrome://extensions/` 입력 후 이동
    *   우측 상단의 **'개발자 모드 (Developer mode)'** 토글 스위치 활성화
    *   좌측 상단의 **'압축해제된 확장 프로그램을 로드합니다 (Load unpacked)'** 버튼 클릭
    *   이 프로젝트의 **`build`** 폴더를 선택하여 로드

5.  **넷플릭스 접속 및 테스트**
    *   [Netflix](https://www.netflix.com)에 로그인 후 재생하려는 비디오 페이지로 진입하면 화면 우측에 학습용 패널이 자동으로 활성화됩니다.

---

## 🧪 테스트 실행 (Testing)

Vitest 및 React Testing Library를 기반으로 작성된 테스트 코드들을 통해 로직을 검증할 수 있습니다.

```bash
# 전체 테스트 실행
npm test

# 단발성 테스트 실행
npm run test:run
```
