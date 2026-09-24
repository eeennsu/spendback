# 핸드오프: 기획 → 검증·착수

2026-09-24 기획 인터뷰 세션에서 작성했다. 이 문서는 다음 세션이 처음 읽는 문서다.

## 현재 상태

- 이 폴더에는 `docs/PRD.md`(기획의 정본), 이 문서, 빈 `test` 파일만 있다. git 저장소가 아니고 코드도 없다.
- PRD의 결정은 사용자와 인터뷰(`mattpocock-skills:grilling`)로 합의한 것이다. 결정을 바꿀 이유가 보이면 근거를 붙여 사용자에게 제안하고, 합의되기 전까지는 PRD대로 진행한다. 결정의 이유는 PRD 13장에 있다.
- 이번 세션에서 사용자는 문서를 PRD 하나만 원했다. CONTEXT.md, ADR, CLAUDE.md, 작업 분해는 사용자가 요청할 때 만든다.
- 스타일링은 외부 의존을 기다리는 중이다. 사용자가 개인 디자인 시스템 `@eeennsu/native`(원본은 `../design-system/packages/native`)를 개선해 npm에 배포한 뒤 알려줄 예정이다. 그때까지는 UI와 무관한 계층만 작업한다(PRD 12장).

## 1단계: 검증

세 항목의 결과를 사용자에게 한 번에 보고하면 완료다. PRD를 고쳐야 하는 항목은 사용자가 승인한 뒤에 반영한다.

1. **PRD 정합성**: PRD 전체를 읽고 섹션 사이의 모순, 정의되지 않은 용어, 13장 결정 기록과 본문이 어긋나는 곳을 목록으로 만든다. 항목마다 PRD 위치와 수정안을 붙인다.
2. **시간에 민감한 사실 재확인**: PRD는 2026-09-24 조사를 기준으로 쓰였다. 항목마다 출처 URL과 확인 날짜를 붙인다.
   - llama.rn 0.12.x의 최신 패치 버전, 그리고 Qwen3.5 GGUF(`qwen35` 아키텍처)를 로드할 수 있는지
   - Qwen3.5-2B, Kanana-1.5-2.1B, EXAONE 4.0 1.2B의 GGUF 파일 위치, 크기, SHA-256 제공 여부
   - RN 0.88 정식 출시 여부. 출시됐다면 0.87.x를 유지할지 0.88로 시작할지 사용자에게 제안한다.
   - node-llama-cpp 최신 버전과, llama.rn에 들어간 llama.cpp 빌드의 차이
   - `@eeennsu/native`의 npm 배포 여부
3. **기기 확인**: 폰이 USB로 연결돼 있으면 `adb shell getprop ro.soc.model`과 `adb shell getprop ro.product.model`로 칩을 확인해, PRD의 Exynos 가정(6장, 10장)을 확정한다. 연결돼 있지 않으면 사용자에게 연결을 요청한다.

## 2단계: 착수

무엇부터 할지 사용자에게 확인하고 시작한다. 추천 순서는 PRD 12장이고, 첫 추천은 LLM 스파이크다.

- **LLM 스파이크**: 버릴 코드로 S24+에서 llama.rn과 후보 모델의 로드 시간, 토큰 속도, 메모리, 플레이스홀더 GBNF 동작을 측정한다. `mattpocock-skills:prototype`을 쓴다. 결과는 PRD 10장과 11장의 갱신안으로 사용자에게 제안한다.
- **도메인 계층**: 지표 계산기, 예산 일할, 포맷터, 플레이스홀더 렌더러, 한글 수사 검사기. `mattpocock-skills:tdd`로 만든다.
- **프로젝트 부트스트랩**: PRD 8장의 스택을 따른다.

## 참고할 옆 폴더 프로젝트

- `../expo-plate`: pnpm, husky, commitlint, CI, `.claude/rules` 구성을 참고한다. Expo 기반이라 템플릿으로 쓰지는 않는다.
- `../rn-upgrade-kit`: RN 업그레이드 스킬 모음이다. Expo를 쓰지 않는다는 전제가 spendback과 맞는다. 그중 `rehearsal`은 Windows에서 실행을 거부하므로 macOS에서 쓴다.
- `../design-system`: 디자인 시스템 원본이다. 소비하는 앱과 react/RN 버전이 정확히 같아야 한다(`../design-system/CLAUDE.md`).
