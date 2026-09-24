# 핸드오프: 기획 → 검증·착수

2026-09-24 기획 인터뷰 세션에서 작성하고, 같은 날 1단계 검증 세션(클라우드, 로컬)에서 갱신했다. 이 문서는 다음 세션이 처음 읽는 문서다.

## 현재 상태

- 저장소에는 `docs/PRD.md`(기획의 정본), 이 문서, 빈 `README.md`만 있다. 코드는 없다.
- PRD의 결정은 사용자와 인터뷰(`mattpocock-skills:grilling`)로 합의한 것이다. 결정을 바꿀 이유가 보이면 근거를 붙여 사용자에게 제안하고, 합의되기 전까지는 PRD대로 진행한다. 결정의 이유는 PRD 13장에 있다.
- 사용자는 문서를 PRD 하나만 원한다. CONTEXT.md, ADR, CLAUDE.md, 작업 분해는 사용자가 요청할 때 만든다.
- 스타일링은 외부 의존을 기다리는 중이다. 사용자가 개인 디자인 시스템 `@eeennsu/native`(원본은 `../design-system/packages/native`)를 개선해 npm에 배포한 뒤 알려줄 예정이다. 그때까지는 UI와 무관한 계층만 작업한다(PRD 12장).

## 1단계: 검증 (2026-09-24, 완료)

### 끝난 것

- **기기 확인**(로컬 세션, adb): 국내판 Galaxy S24+(SM-S926N, `ro.soc.model=s5e9945` Exynos 2400, RAM 12GB, Android 16)다. CPU는 dotprod·i8mm를 지원한다. GPU(Xclipse 940)에 Vulkan 1.3과 OpenCL 드라이버가 있지만 llama.rn 0.12.9에는 Vulkan 백엔드가 없고, OpenCL·Hexagon 빌드는 `Build.SOC_MODEL`로 Qualcomm 기기라고 판별될 때만 불러온다(`RNLlama.java`의 `hasAdrenoGpuHint`, `isHexagonSupported`). 그래서 CPU 추론만 가능하다. PRD v0.3 6장·10장·11장에 반영했다.
- **모델 파일 확인**(로컬 세션): 세 파일의 파일명, 바이트 크기, SHA-256, 커밋, GGUF 아키텍처를 PRD v0.3 6장에 적었다. Kanana 저장소는 원래 올린 DevQuasar로 바꿨고(Grit-Labs는 같은 파일의 재업로드본), 앱은 커밋을 고정한 `resolve/<커밋>/<파일명>` URL로 받기로 사용자가 승인했다.
- **PRD 정합성**: 모순 7건과 모델 저장소 열을 PRD v0.2에 반영했다(회고 저장·재생성 규칙, 필드 단위 스트리밍과 사후 검사, 원인별 폴백, 이름 플레이스홀더, 고정비 기준 열, 모델 로드 시점, 13장 문구).
- **시간에 민감한 사실**(2026-09-24 확인)
  - llama.rn: 0.12.x 최신은 **0.12.9**다. npm `latest`는 여전히 RC(0.13.0-rc.5)다. 0.12.9 소스(`cpp/llama-arch.cpp`, `cpp/models/qwen35.cpp`)에 `qwen35` 아키텍처가 있다. 내장 llama.cpp는 build 10256, commit `6c8dcaa`다.
  - node-llama-cpp: **3.21.1**이다. 내장 llama.cpp는 v0.4.0(llama.cpp가 semver로 바뀌었다, 2026-09-12 스냅샷)이라 llama.rn보다 약 5~6주 새것이다. `qwen35.cpp`, sampler 코드가 다르고 grammar는 거의 같다. PRD 10장의 위험이 실제로 있다.
  - RN: 정식은 0.87.1, 0.88은 RC(0.88.0-rc.2)다. 사용자가 **0.87.x 유지**로 결정했다(PRD 13장).
  - `@eeennsu/native`: npm 미배포(404).
  - 기타: NativeWind 5는 `5.0.0-rc.0`이 됐다. Navigation 7.4.1, MMKV 4.3.2, Reanimated 4.7.0, RNTL 14.0.1, Zod 4.6.5로 PRD와 맞다.

### 보류된 PRD 수정안

사용자가 아직 승인하지 않았다. 필요해지는 시점에 제안한다.

- 직전 기간 "데이터 없음"의 기준: 직전 기간이 첫 기록일보다 앞에 있으면 없음으로 본다
- facts 키 이름 규칙 표(id 기반)
- 플레이스홀더 뒤 조사(이/가, 을/를) 처리
- 홈 "소비 속도" 계산식
- 예산이 없는 달, 두 달에 걸친 주에서 한 달에만 카테고리 예산이 있는 경우
- "증감 상위 3개"의 정렬 기준(증감액 절댓값 안)
- 하네스 금지어 목록과 문장 길이 한도
- 7장에 모델 레지스트리 엔티티(id, 저장소, 커밋, 파일명, 크기, sha256, 라이선스) 추가
- GBNF에서 전각 숫자와 JSON `\u` 이스케이프 차단
- 4.1 "결제 취소 시 삭제" 규칙을 2단계 카드 알림으로 이동

## 2단계: 착수

무엇부터 할지 사용자에게 확인하고 시작한다. 추천 순서는 PRD 12장이고, 첫 추천은 LLM 스파이크다.

- **LLM 스파이크**: 버릴 코드로 S24+에서 llama.rn과 후보 모델의 로드 시간, 토큰 속도, 메모리, 플레이스홀더 GBNF 동작을 측정한다. `mattpocock-skills:prototype`을 쓴다. 결과는 PRD 10장과 11장의 갱신안으로 사용자에게 제안한다.
  - 모델 파일은 PRD 6장의 커밋 고정 URL과 SHA-256을 쓴다.
  - 초기화 결과에서 로드된 네이티브 라이브러리가 `rnllama_jni_v8_2_dotprod_i8mm`인지와 `gpu`, `reasonNoGPU`를 기록한다.
  - 샘플링 시작값은 Qwen3.5 모델 카드의 비추론 텍스트 권장값(`temperature=1.0, top_p=1.0, top_k=20, min_p=0, presence_penalty=2.0`)이다. Qwen3.5-2B는 기본이 비추론 모드다.
- **도메인 계층**: 지표 계산기, 예산 일할, 포맷터, 플레이스홀더 렌더러, 한글 수사 검사기. `mattpocock-skills:tdd`로 만든다.
- **프로젝트 부트스트랩**: PRD 8장의 스택을 따른다.

## 참고할 옆 폴더 프로젝트

- `../expo-plate`: pnpm, husky, commitlint, CI, `.claude/rules` 구성을 참고한다. Expo 기반이라 템플릿으로 쓰지는 않는다.
- `../rn-upgrade-kit`: RN 업그레이드 스킬 모음이다. Expo를 쓰지 않는다는 전제가 spendback과 맞는다. 그중 `rehearsal`은 Windows에서 실행을 거부하므로 macOS에서 쓴다.
- `../design-system`: 디자인 시스템 원본이다. 소비하는 앱과 react/RN 버전이 정확히 같아야 한다(`../design-system/CLAUDE.md`).
