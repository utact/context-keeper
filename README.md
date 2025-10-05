# Context Keeper

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

웹 서핑 중의 컨텍스트를 보존하여, 끊김 없이 원활한 지적 워크플로우를 보장하도록 설계된 Chrome 확장 프로그램입니다. 안정성과 확장성에 중점을 두고 설계되었습니다.

## 핵심 컨셉

이 확장 프로그램이 해결하는 근본적인 문제는 **인지 부하 감소 (Cognitive Load Reduction)** 입니다. 기술 문서, 연구 논문, 장문 기사와 같은 복잡한 정보 환경을 탐색하는 사용자는 중단 후 컨텍스트를 다시 설정하는 데 상당한 정신적 에너지를 소비합니다. Context Keeper는 웹 페이지에 대한 영구 세션을 생성하여 스크롤 위치를 저장하고, 하이라이팅 및 메모를 통해 능동적인 지식 캡처를 가능하게 하여 이러한 문제를 완화합니다.

## 주요 기능

- **자동 스크롤 위치 복원:** 페이지를 다시 방문했을 때 마지막에 읽던 위치로 자동으로 이동합니다.
- **읽기 진행률 시각화:** 팝업 UI에서 각 페이지의 읽기 진행률을 한눈에 파악할 수 있습니다.
- **망각 곡선 기반 알림:** 마지막 방문 후 시간이 얼마나 흘렀는지에 따라 제목 색상이 변경되어(초록색 -> 노란색 -> 빨간색) 자연스러운 복습을 유도합니다.
- **예상 읽기 시간 및 필터링:** 남은 분량을 읽는 데 걸리는 예상 시간을 제공하며, 시간 기준 필터링 기능을 지원합니다.
- **하이라이트 및 메모 (베타):** 페이지의 중요한 부분에 여러 색상으로 하이라이트를 남기고, 메모를 첨부할 수 있습니다. 이 기능은 현재 베타 버전입니다.
- **하이라이트 삭제:** 하이라이트 위에서 마우스 오른쪽 버튼을 클릭하여 나타나는 메뉴를 통해 손쉽게 삭제할 수 있습니다.

## 기술 스택

- **번들러:** Vite
- **언어:** JavaScript (ESM)
- **타겟:** Chrome Manifest V3
- **핵심 API:** `chrome.storage`, `chrome.commands`, `chrome.tabs`, `chrome.scripting`

## 프로젝트 구조

```
context-keeper/
├── dist/                # 빌드 결과물이 담기는 디렉토리
├── images/              # 아이콘 등 정적 이미지 에셋
├── js/                  # 핵심 자바스크립트 소스 파일
│   ├── background.js    # 서비스 워커: 상태, 알람, 컨텍스트 메뉴 처리
│   ├── content.js       # 웹 페이지에 주입되는 스크립트의 진입점
│   ├── highlighter.js   # 하이라이팅/메모를 위한 DOM 조작 로직
│   ├── popup.js         # 확장 프로그램 팝업 UI 로직
│   ├── range-serializer.js # 하이라이트 위치 저장을 위한 XPath 직렬화
│   └── storage.js       # chrome.storage.local 추상화 레이어
├── popup/               # 팝업 UI를 위한 HTML 및 CSS
├── .gitignore
├── manifest.json        # 확장 프로그램 매니페스트
├── package.json
└── vite.config.js       # Vite 빌드 설정
```

## 개발 워크플로우

### 전제 조건
- Node.js (v18+)
- npm

### 시작하기

1.  **의존성 설치:**
    ```bash
    npm install
    ```

2.  **프로덕션 빌드:**
    ```bash
    npm run build
    ```

3.  **확장 프로그램 로드:**
    - Chrome에서 `chrome://extensions`로 이동합니다.
    - "개발자 모드"를 활성화합니다.
    - "압축 해제된 확장 프로그램을 로드합니다"를 클릭합니다.
    - 이 프로젝트의 `dist` 디렉토리를 선택합니다.

