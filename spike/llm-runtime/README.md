# LLM 스파이크 (버릴 코드)

main에 함께 두지만 앱과 독립된 버릴 코드다. 루트 앱의 타입 검사·린트·포맷·테스트·번들 대상에서 제외돼 있다(루트 `tsconfig.json`, `eslint.config.js`, `.prettierignore`, `jest.config.js`, `metro.config.js`). 검증된 결론만 PRD에 반영한다.

## 질문과 답 (2026-09-24, Galaxy S24+ SM-S926N, Exynos 2400, Android 16)

| 질문 | 답 |
|---|---|
| llama.rn 0.12.9가 세 후보 GGUF를 로드하는가 | 셋 다 로드된다. `qwen35`(Qwen3.5-2B)도 된다 |
| 어떤 네이티브 라이브러리가 뜨는가 | `rnllama_jni_v8_2_dotprod_i8mm`, `gpu=false`("GPU backend is not available") |
| 스레드 수 | 6이 가장 빠르다(Qwen 생성 기준 2: 14.9, 4: 19.5, 6: 21.6, 8: 19.0 tok/s) |
| 회고 한 번에 걸리는 시간 | 첫 문장(headline)까지 Qwen 8.6~11.3초, Kanana 13.7~18.7초, EXAONE 6.2~8.5초. 대부분 약 600~850토큰 프롬프트 처리 시간이다 |
| 메모리 | 생성 중 최대 PSS Qwen 약 2.9GB, Kanana 약 3.3GB, EXAONE 약 2.0GB(mmap 파일 페이지 포함) |
| 숫자 차단 GBNF가 통하는가 | 블랙리스트 문법(v1)은 뚫린다. 화이트리스트 문법(v2)은 막는다 |
| 플레이스홀더로 쓴 문장의 품질 | 구조는 지키지만 의미가 자주 틀린다. 아래 "품질" 참고 |

### 속도(스레드 6, n_ctx 4096, 프롬프트 캐시 없는 첫 회고 기준)

| 모델 | 로드(초) | 프롬프트 처리(tok/s) | 생성(tok/s) | 첫 토큰(초) | headline(초) | 전체(초) |
|---|---|---|---|---|---|---|
| Qwen3.5-2B | 2.2~3.7 | 107 | 18.6~19.0 | 6.9~7.9 | 8.6~11.3 | 17.7~17.9 |
| Kanana-1.5-2.1B | 5.3~5.8 | 52~56 | 12.6~13.0 | 12.6~15.7 | 13.7~18.7 | 30.6~31.1 |
| EXAONE 4.0 1.2B | 3.0~3.4 | 94~107 | 18.5~19.4 | 5.6~6.3 | 6.2~8.5 | 29.3~29.4 |

같은 프롬프트를 다시 돌리면 캐시 덕에 첫 토큰이 0.1~0.2초로 줄지만, 앱에서는 기간마다 facts가 달라 캐시를 기대하기 어렵다. 4분쯤 연속 추론하면 열 상태가 0에서 2~3(`dumpsys thermalservice`)으로 올라갔다.

### GBNF: v1(블랙리스트) → v2(화이트리스트)

- v1은 문장 문자에서 `0-9`, `%`, 전각 숫자만 뺐다. 9회 중 5회가 `۱۱۲`(아랍·페르시아 숫자), `⅔`, `¼`, `₁`, `㎡`, `％`로 숫자를 썼고, `ㄴ만`, `ㄱ만 원`처럼 자모로 숫자를 대신하거나 태국어·한자·영어를 섞었다. 플레이스홀더를 쓴 회차는 9회 중 3회였다.
- v2는 문장 문자를 `[가-힣 .,!?·~()-]`로 한정하고, headline과 각 insight에 플레이스홀더를 1개 이상 강제했다. 9회 모두 스키마 통과, 숫자·외국 문자·facts에 없는 키 0건, 문장 49개 중 47개가 플레이스홀더를 썼다.
- 문법 없이 돌린 대조군(free)은 Kanana만 형식을 지켰고, 숫자를 직접 썼다. Qwen v1 free는 금액을 지어냈다("47만 원의 충동 지출", "2 배 수준").

### 품질(v2에서 관찰한 문제)

- **키를 엉뚱한 사실에 붙인다**: "야식 치킨 지출이 32,000원원 29,000원 늘었어요였어요"(29,000원 증가는 배달의 값), "충동 태그가 붙은 지출이 54,000원로 54,000원 늘었어요"(금액을 증감처럼 씀). 숫자를 지어내지는 못하지만 틀린 사실은 만들 수 있다.
- **단위를 중복한다**: `{…amount}원` → "20,100원원". 프롬프트로 금지해도 계속 나왔다.
- **서술어 값을 잘못 쓴다**: `change_phrase`("…늘었어요")를 명사처럼 써서 "32,400원 늘었어요가 늘었어요", "늘었어요로 늘었어요"가 된다.
- **조사가 틀린다**: "54,000원였어요"(→ 이었어요). PRD 보류안의 조사 처리가 필요하다.
- 모델별로는 Kanana가 가장 읽을 만했고, Qwen은 회차마다 편차가 컸으며, EXAONE은 장황하고 형식을 자주 벗어났다. 회차가 모델당 3회뿐이라 판정은 평가 하네스로 해야 한다.

## 발견한 함정

- **llama.rn 0.12.9 `ignore_eos: true`는 SIGSEGV를 낸다**. `cpp/jsi/JSIParams.cpp:629`의 `sparams.logit_bias[eos].bias = -INFINITY`가 방금 비운 벡터에 EOS 인덱스로 쓴다(Qwen EOS 248046 × 8 + 4 = 크래시 주소 `0x1e4774`). `logit_bias` 파라미터도 같은 방식이라 쓰지 않는다.
- **Qwen3.5는 `enable_thinking: false`여도 결과 `text` 앞에 빈 `<think>\n\n</think>`가 붙는다**. 파싱 전에 떼어 낸다.
- **Windows 빌드**
  - SDK CMake 3.22.1의 ninja는 긴 경로를 지원하지 않아 `LongPathsEnabled=1`이어도 llama.rn JNI 빌드가 260자 제한에 걸린다. `android/build.gradle`에서 llama.rn의 `buildStagingDirectory`를 임시 폴더로 옮겼다.
  - pnpm 10은 설치 스크립트를 막는다. `pnpm.onlyBuiltDependencies`에 `llama.rn`을 넣어야 네이티브 라이브러리를 받는다.
  - llama.rn의 postinstall은 PATH의 `tar`를 쓴다. Git Bash에서는 GNU tar가 `C:\…`를 원격 호스트로 읽어 실패하므로 PowerShell(Windows `tar.exe`)에서 설치한다.
- 모델은 `adb push`로 `/storage/emulated/0/Android/data/com.llmspike/files/models/`에 넣었다. 앱이 `getExternalFilesDir(null)`로 폴더를 먼저 만들어야 한다.

## 실행

Node `^22.13`, pnpm 10, 폰 USB 연결(잠금 해제)이 필요하다.

```sh
pnpm install                 # Windows는 PowerShell에서
pnpm build                   # android/app/build/outputs/apk/release/app-release.apk
pnpm spike -- --install --suite threads --models qwen --threads 2,4,6,8 --models-dir <GGUF 폴더>
pnpm spike -- --suite full --models qwen,kanana,exaone --threads 6 --runs 3 --models-dir <GGUF 폴더>
```

macOS에서는 `pnpm build` 대신 `cd android && ./gradlew assembleRelease`를 쓴다. GGUF 파일과 SHA-256은 PRD 6장에 있다.

결과 원본은 `results/`에 있다. `…11-28-30…-threads.json`은 스레드 비교, `…11-30-19…-full.json`은 v1, `…11-37-23…-full.json`은 v2다.
