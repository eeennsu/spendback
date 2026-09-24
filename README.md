# spendback

온디바이스 LLM이 소비 회고를 써 주는 Android 가계부입니다. 기획과 결정 기록은 [docs/PRD.md](docs/PRD.md)에 있습니다.

## 개발 환경

- Node 22.23.3(`.nvmrc`, 최소 `^22.13`)
- pnpm 10: corepack이 `package.json`의 `packageManager` 필드를 읽어 버전을 맞춥니다
- JDK 17, Android SDK, NDK 27.1.12297006
- Windows에서는 의존성 설치를 PowerShell에서 합니다. Git Bash의 GNU tar가 일부 패키지의 설치 스크립트를 깨뜨립니다(PRD 10장)

## 명령

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치. husky 훅도 함께 설정됩니다 |
| `pnpm android` | 디버그 빌드를 연결된 기기에 설치하고 실행합니다(Metro 포함) |
| `pnpm start` | Metro 개발 서버 |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | 타입 검사, 린트, Jest |
| `pnpm format` | Prettier 적용(`*.md`는 제외) |
| `cd android && ./gradlew assembleRelease` | 릴리스 APK를 `android/app/build/outputs/apk/release/`에 만듭니다. Windows PowerShell에서는 `.\gradlew assembleRelease` |

커밋 제목은 `feat` `fix` `refactor` `hotfix` `update` `chore` `docs` 중 하나의 접두어로 시작해야 합니다(commitlint).
