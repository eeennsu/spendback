# spendback DESIGN

> 상태: v0.2 · 2026-09-25 · PRD 12장 3번(디자인 시스템 연동과 DESIGN.md) 결과. DS 0.3.0으로 올려 임시 컴포넌트를 걷어 냈다
>
> 기획의 정본은 [PRD.md](PRD.md)이고, 이 문서는 디자인과 디자인 시스템(DS) 연동의 정본이다. 화면을 만들 때는 이 문서를 먼저 읽는다. 규칙이 부딪히면 PRD·DS 규칙 > mobile-taste-skill > ui-ux-pro-max 순서로 따른다. DS 규칙은 `../design-system`의 스펙(`docs/design-system-spec.md`)이다.

## 1. 디자인 시스템 연동

### 1.1 결과

npm의 `@eeennsu/native`를 Expo 없이 RN CLI 앱(RN 0.87.1)에 붙였다. 2026-09-24에 0.2.0으로 기기 없이 아래까지 확인했고, 2026-09-25에 0.3.0으로 올려 같은 확인을 다시 통과했다(Jest 28개, 릴리스 번들 2.20MB).

| 확인 | 결과 |
|---|---|
| `pnpm typecheck` · `lint` · `format:check` · `test` | 통과 |
| Jest에서 DS 컴포넌트의 className이 스타일로 풀리는지(DS 구현 노트 N-14, F-11) | 풀린다. `__tests__/ds.test.tsx`가 Box·Badge·Label·Textarea·Button의 색, 여백, 글자 크기, 다크 값을 본다 |
| Metro 번들(`react-native bundle --platform android --dev false`)에 토큰 값과 클래스가 들어가는지(DS 구현 노트 F-12) | 들어간다. `StyleCollection.inject`에 DS 클래스(`bg-brand`, `text-fg-muted`, `rounded-full` 등)와 해석된 색(앱 brand `#107460`·`#55c1a3`, DS danger `#e7000b`)이 있다 |

2026-09-25에 에뮬레이터(Android 16, S24+ 해상도)에서 화면을 봤다(1.6). 실기기는 아직이다.

### 1.2 설치한 것

| 패키지 | 버전 | 이유 |
|---|---|---|
| `@eeennsu/native` | 0.3.0 | DS. 0.x라 정확한 버전으로 고정한다 |
| `nativewind` · `react-native-css` | 5.0.0-preview.4 · 3.0.7 | DS peer가 정확한 버전을 요구한다(DS 스펙 C-19) |
| `react-native-reanimated` · `react-native-worklets` | 4.7.0 · 0.13.0 | react-native-css가 애니메이션용으로 `require("react-native-reanimated")`를 한다. Metro는 함수 안의 require도 풀어야 하므로 없으면 번들이 깨진다. PRD 8장의 차트도 Reanimated 4를 쓴다 |
| `react-native-svg` | 15.15.5 | DS 아이콘(lucide-react-native)의 peer |
| `tailwindcss` · `@tailwindcss/postcss` · `postcss` | ^4.3.3 · ^4.3.3 · ^8.5.28 | 빌드 때 global.css를 Tailwind로 컴파일한다(개발 의존성) |
| `lightningcss` | 1.30.1 | react-native-css의 peer. 1.30.1이 아니면 컴파일 결과를 읽지 못한다(DS 구현 노트 N-7) |
| `@types/node` | ^22 | Jest 도우미(`jest/css.ts`)가 fs·path를 쓴다 |

react-native-reanimated·worklets·svg는 네이티브 모듈이라 다음 Android 빌드에서 처음 컴파일된다(1.6).

### 1.3 설정 파일

| 파일 | 내용 |
|---|---|
| `global.css` | `@import '@eeennsu/native/themes/base.css';` 한 줄(DS 스펙 C-3)과 앱 색 재선언(2장). `index.js`가 import한다 |
| `metro.config.js` | `withNativewind(...)`로 CSS 확장자와 className 폴리필을 켜고, `transformerPath`를 `metro.transformer.js`로 바꾸고, CSS 결과를 디스크 캐시에 쓰지 않는 캐시 저장소를 둔다 |
| `metro.transformer.js` | 1.4의 변환기 |
| `babel.config.js` | React Compiler 다음에 `react-native-worklets/plugin`(Reanimated 4)을 마지막으로 둔다. NativeWind 5는 Babel 프리셋이 없다 |
| `nativewind-env.d.ts` · `tsconfig.json` | `/// <reference types="nativewind/types" />`로 RN 컴포넌트에 `className` 타입을 붙인다. tsconfig의 `include`에 이 파일 이름을 적어 둔다. 없으면 Metro를 켤 때 react-native-css가 tsconfig를 고쳐 쓴다 |
| `jest.config.js` · `jest/setup.js` · `jest/css.ts` | 1.5 |
| `package.json` | `pnpm.packageExtensions`로 react-native-css의 `@expo/metro-config` peer를 선택 peer로 바꾼다(1.4) |

### 1.4 `@expo/metro-config` peer 문제를 푼 방법

react-native-css 3.0.7은 `@expo/metro-config`를 peer로 요구한다. 실제로 쓰는 곳은 Metro 변환기(`react-native-css/metro`의 `metro-transformer`) 하나다. 이 변환기는 JS와 CSS를 전부 Expo의 변환 워커(`unstable_transformerPath`)에 맡기고, CSS는 그 워커가 PostCSS(Tailwind)로 처리한 결과를 react-native-css 컴파일러로 RN 스타일로 바꿔 주입한다. `withNativewind`의 나머지(리졸버, CSS 확장자, 타입 파일)는 Expo와 무관하다.

**고른 방법: 같은 일을 하는 변환기를 앱에 두었다(`metro.transformer.js`, 약 40줄).** JS는 Metro 기본 워커(`metro-transform-worker` 0.87)에 그대로 넘기고, `.css`만 `postcss([@tailwindcss/postcss({ base: 프로젝트 루트 })])` → `react-native-css/compiler`의 `compile()` → `StyleCollection.inject(...)` 코드로 바꾼 뒤 기본 워커로 변환한다. `metro.config.js`는 `withNativewind(...)` 결과에서 `transformerPath`만 이 파일로 바꾼다.

- pnpm 10은 없는 peer를 자동 설치한다(auto-install-peers). 그대로 두면 `@expo/metro-config`와 `@expo/metro`·`@expo/config` 등 Expo 패키지 약 40개가 들어온다. `pnpm.packageExtensions`로 이 peer를 선택 peer로 표시해 설치되지 않게 했다. pnpm 11 이상은 package.json의 `pnpm` 필드를 읽지 않으므로(DS 구현 노트 F-20) `packageManager`의 pnpm을 올릴 때 이 설정을 `pnpm-workspace.yaml`의 `packageExtensions`로 옮긴다
- **CSS 캐시.** Tailwind 결과는 소스 파일의 클래스에 따라 바뀌지만 Metro의 캐시 키는 global.css 내용뿐이다. 그대로 두면 global.css를 고치지 않는 한 새 클래스가 번들(릴리스 포함)에 안 들어간다. 변환기가 CSS 결과에 `skipCache` 표시를 달고, `metro.config.js`의 `CssUncachedFileStore`가 그 결과를 디스크 캐시에 쓰지 않는다. Expo가 같은 문제를 같은 방식(`@expo/metro-config`의 FileStore)으로 푼다
- **남는 제약(개발 중).** 같은 Metro 세션 안에서는 다른 파일에 새 클래스를 더해도 global.css 모듈이 다시 변환되지 않는다. Expo는 Metro 그래프를 고쳐(`patchMetroGraphToSupportUncachedModules`) 매번 다시 변환하는데, 그 패치는 옮기지 않았다. 새 클래스가 안 먹으면 Metro를 다시 켠다(CSS 결과는 디스크 캐시에 없어 `--reset-cache` 없이 다시 변환된다). 내용이 같은 채로 global.css만 저장하면 Metro가 같은 모듈로 보고 넘길 수 있다. 기기에서 불편하면 그 패치를 옮긴다(1.6)

버린 대안:

| 대안 | 버린 이유 |
|---|---|
| `@expo/metro-config`를 개발 의존성으로 설치 | 57.x는 `@expo/metro`로 Metro 0.84.6을 고정한다. RN 0.87은 Metro 0.87이라, 모든 JS 파일이 서버와 다른 버전의 변환 워커를 지나게 된다. 설치해도 위의 CSS 캐시 문제는 그대로다(Expo는 자기 `getDefaultConfig`에서만 푼다) |
| Expo의 `getDefaultConfig`로 Metro 설정 전체를 바꾸기 | `expo` 패키지가 필요하다. "Expo 없이"와 어긋난다 |
| `@expo/metro-config` 이름의 가짜 패키지를 로컬에 두기 | peer 버전 검사를 속이는 방식이라 무엇을 대신하는지 코드에서 안 보인다 |

react-native-css 3.1.0-rc.0도 같은 peer를 요구하고 변환기 구조가 같다. rc.0은 변환기 옵션을 `options`가 아니라 `config.reactNativeCSS`에서 읽는데, 앱 변환기는 이미 그쪽을 읽는다.

### 1.5 Jest

- `@eeennsu`와 `lucide-react-native`는 ESM만 배포해 `transformIgnorePatterns` 허용 목록에 넣고, lucide가 주는 `.mjs`를 `babel-jest`로 변환한다(DS 구현 노트 N-14)
- `react-native-css/jest`는 `react-native` 조건에서 TS 소스를 가리킨다. `moduleNameMapper`로 CJS 빌드에 돌려 컴포넌트와 같은 인스턴스를 쓰고, tsconfig `paths`로 타입도 빌드된 `.d.ts`로 돌린다(DS 구현 노트 F-13과 같은 문제)
- `jest/css.ts`의 `registerGlobalCss()`가 global.css를 Metro 변환기와 같은 조건(Tailwind, 앱 루트 기준)으로 컴파일해 등록한다. 다크 모드는 `jest/setup.js`의 NativeAppearance 모킹과 `setColorScheme()`로 본다(DS 구현 노트 N-9)
- className으로 스타일을 주는 앱 코드는 RN 기본 컴포넌트를 `react-native`가 아니라 `react-native-css/components`에서 import한다. 앱은 Metro 폴리필 덕에 어느 쪽이든 동작하지만 Jest는 후자만 스타일을 푼다(DS 구현 노트 F-11)

### 1.6 에뮬레이터 확인(2026-09-25)과 남은 실기기 확인

Android 16(API 36.1, Google Play 이미지, arm64) 에뮬레이터를 S24+ 해상도(1080×2340, 450dpi, 제스처 내비게이션)로 만들어 디버그 빌드로 봤다. 화면 요소는 uiautomator로, 스크린 리더는 TalkBack의 "Display speech output"으로 확인했다.

| # | 볼 것 | 결과 |
|---|---|---|
| 1 | 빌드 | `./gradlew app:assembleDebug`(arm64) 통과. 처음은 11분 43초(Gradle 9.4.1 배포판 받기 포함). reanimated·worklets·svg 네이티브 컴파일 통과. Windows는 보지 않았다 |
| 2 | 시안 화면 | 6개 모두 뜬다. "입력 시트"에서 "입력 시트 펼침"으로 바꾸면 상태가 이어져 접힌 채로 뜨던 문제를 찾아 고쳤다(시안마다 `key`) |
| 3 | 라이트·다크 | 앱 색과 DS 색이 함께 바뀐다. 다크에서 고른 칩·저장·FAB·배지 글자가 거의 검정이고 시트 테두리가 보인다 |
| 4 | 눌림 표시 | 칩(투명도)과 줄(표면색)은 보인다. FAB는 투명도 때문에 아래 초과 막대가 비쳐 표면색 눌림으로 바꿨다(3.5) |
| 5 | 고정폭 숫자 | 판별하지 못했다. 에뮬레이터 글꼴(Roboto)은 숫자가 원래 고정폭이다. **실기기 One UI 글꼴에서 본다** |
| 6 | 키보드 | 시트를 열면 금액 칸에 포커스가 가고 숫자 키패드(`numeric`, `-` `,` `.`이 보인다)가 뜬다. 시트가 올라가 제목·금액·카테고리·저장이 보이고, 펼친 시트의 메모 칸도 키보드 위에 보인다. 글자 2배에서는 가운데 스크롤 영역이 한 줄 남짓으로 좁아지지만 제목·금액·저장은 보인다 |
| 7 | 스위치 색 | AppCompat 기본 청록이 brand와 가까워 어색하지 않다. 12장 6번 앱 테마에서 그대로 둘지 정한다 |
| 8 | 게이지 기준선, FAB 그림자 | 보인다(기준선은 라이트 짙은 선·다크 흰 선에 canvas 테두리, 그림자는 옅다) |
| 9 | 글자 1.3·2배 | 홈은 줄 바꿈으로 버틴다(사용액·예산, 캡션이 두 줄). 입력 시트 칩은 2배에서 다섯 줄이다. "닫기"의 × 아이콘은 글자 크기를 따르지 않아 2배에서 작게 남는다(5.2) |
| 10 | 상태 바·내비게이션 바 자리 | 근사가 맞는다. 칩 줄이 상태 바 아래에서 시작하고 홈 끝이 제스처 막대 위에서 끝난다 |
| 11 | Metro 새 클래스 | Fast Refresh로는 반영되지 않고, global.css를 내용 없이 다시 저장해도 안 된다(Metro가 내용으로 변경을 판단한다). global.css 내용을 바꾸면 앱이 다시 불러와지며 반영되고, Metro를 다시 켜도 된다 |
| 12 | 번들 | 디버그 번들 8.17MB, 실행 요청부터 JS 시작까지 약 2초(맥, 캐시를 비운 Metro의 첫 요청). 릴리스 번들 2.20MB |
| 13 | TalkBack | 저장 이유가 바뀌면 "금액을 입력해 주세요"를 읽는다(live region, `collapsable={false}`가 효과 있다). 고정비 줄은 스위치 하나로 잡히고 안쪽 RN Switch는 숨는다. 칩은 선택됨, 저장은 비활성으로 잡힌다. 접근성 트리 순서는 화면 순서와 같다. 금액 칸은 라벨 "금액"과 입력 칸 이름 "금액"이 따로 잡혀 두 번 읽히고 "원"도 따로 읽힌다(5.2). 게이지 역할은 RN이 roleDescription으로 준다 |
| 14 | 세로 고정 | 가로로 돌려도 세로 그대로다 |
| 15 | 상태 바 아이콘 | 라이트는 짙은 아이콘, 다크는 흰 아이콘이다. 앱이 켜진 채 바꿔도 따라온다 |
| 16 | 스플래시 → 첫 화면 | 다크 콜드 스타트에서 AppCompat 창 배경(`#303030`)이 디버그 빌드 기준 1~2초 보이고 canvas(`#030712`)로 바뀐다. 12장 6번 앱 테마에서 창 배경을 맞춘다 |
| 17 | 쉼표 금액 칸의 커서 | 끝에서 입력·지우기, 가운데 입력은 자연스럽다. **쉼표 바로 뒤에서 지우면 아무 변화가 없다**(쉼표가 지워졌다가 서식이 다시 붙인다). 12장 6번 입력 폼에서 쉼표를 지우면 그 앞 숫자를 지우게 고친다 |
| 18 | 글자 세로 가운데(`includeFontPadding`) | 칩과 입력 칸 글자가 가운데에 있다 |
| 19 | 히어로 간격 | 모두 12 간격이어도 글자 크기 차이로 라벨·금액, 게이지·캡션 묶음이 읽힌다 |
| 20 | 메모 칸 높이 | 45~47dp로 48에 조금 못 미친다(3.7) |
| 21 | 하드웨어 키보드 | Tab 이동에서 RN 입력 칸은 포커스를 받지 않았다(RN이 입력 칸의 터치 모드 포커스를 막는다). 버튼·칩은 Android 기본 포커스 강조(옅은 사각형)만 보인다(5.2) |

실기기에서 남은 것: 고정폭 숫자(One UI 글꼴), TalkBack 한국어 음성으로 읽는 순서와 "·" 읽기, 3버튼 내비게이션에서의 `pb-12` 근사, 스크롤 성능, Windows 빌드.

## 2. 앱 색

DS는 semantic 색 변수의 값만 앱에서 다시 선언하게 연다(DS 스펙 C-5b). spendback은 `global.css`에서 네 변수만 바꾸고 나머지(중립 회색, danger, 표면, 테두리)는 DS base를 쓴다. RN은 `:root`와 `@media (prefers-color-scheme: dark) { :root }` 두 블록이다(DS 알려진 동작 15).

| 변수 | 라이트 | 다크 | 쓰는 곳 |
|---|---|---|---|
| `--bg-brand` | `oklch(50% 0.09 175)` `#107460` | `oklch(74% 0.11 172)` `#55c1a3` | 주 버튼, 고른 칩, 예산 게이지, 수입 금액·"기록" 같은 글자(`text-brand`). `--border-focus`도 따라가 입력 칸의 포커스 테두리가 된다 |
| `--bg-brand-hover` | `oklch(45% 0.08 175)` `#0f6353` | `oklch(80% 0.09 172)` `#7ed1b7` | 눌림(`active:`) |
| `--fg-on-brand` | DS 값(흰색) | `oklch(13% 0.028 261.692)` `#030712` | brand 위 글자 |
| `--fg-on-danger` | DS 값(흰색) | `oklch(13% 0.028 261.692)` `#030712` | danger 버튼 글자 |

**brand를 절제된 청록으로 한 이유.** 이 앱에서 brand는 "예산 안", "수입", "저장"처럼 돈의 괜찮은 상태에 붙는다. DS 기본 파랑(`#155dfc`, 채도 0.245)은 템플릿에서 흔히 보는 색이고 "담백한 분석가"(PRD 4.6) 톤에 비해 강하다. 채도를 0.09로 낮춘 청록은 빨강(초과)과 뜻이 갈리고, 흰 글자와 5.7:1이라 주 버튼과 글자색에 함께 쓸 수 있다.

**다크에서 brand 위 글자를 바꾼 이유.** 다크 brand는 밝아서 흰 글자가 2.2:1이다. DS base 다크도 같은 문제가 있다(흰 글자 on blue-500 3.71:1, on red-500 3.82:1). 앱은 두 글자색을 거의 검은색으로 다시 선언했다. DS 0.3.0이 base 다크 값을 같은 색으로 고쳤지만(DS 스펙 R25), 앱은 brand를 따로 선언하므로 그 위 글자도 짝으로 계속 둔다(C-5b 짝 대비).

대비(WCAG 2.1. 컴파일된 sRGB 값 기준):

| 조합 | 라이트 | 다크 |
|---|---|---|
| brand 위 글자(주 버튼, 고른 칩) | 5.69 | 9.15 |
| canvas 위 `text-brand` | 5.69 | 9.15 |
| surface-muted 위 `text-brand` | 5.17 | - |
| canvas 위 danger 글자 | 4.77 | 5.29(surface 위 4.66) |
| canvas 위 muted 글자 | 4.84 | 7.74(surface 위 6.82) |
| danger 위 danger 버튼 글자 | 4.77 | 5.29 |
| 게이지 채움 대 트랙(비텍스트, 3:1 기준. 다크 트랙은 surface-muted) | 라이트는 아래 줄 | brand 6.67 · danger 3.85 |
| 채움 위 기준선 | canvas 색 테두리(2px)로 분리. 테두리 대 채움 5.69 | 9.15 |
| 고르지 않은 칩 테두리 대 surface | 1.47 | 1.72 |
| 시트 대 scrim 아래 배경 | 3.95 | 1.16. 그래서 다크에서만 시트에 테두리를 긋는다(테두리 대 배경 2.00) |
| 누르는 동안 줄의 muted 글자(surface-hover 위) | 3.91 | 3.96 |
| 게이지 트랙 대 canvas(비텍스트) | 1.47(라이트 트랙은 `bg-border`) | 1.37 |
| 게이지 채움 대 트랙(라이트 트랙이 `bg-border`일 때) | brand 3.87 · danger 3.24 | - |
| 입력 칸 테두리 대 surface | 1.47 | 1.72 |

게이지 트랙은 라이트에서 `bg-border`를 쓴다. surface-muted는 흰 canvas와 1.1:1이라 예산 전체 길이가 보이지 않았다. 고르지 않은 칩의 테두리는 3:1이 안 된다. 칩은 글자로 식별되고(WCAG 1.4.11 예외) 고른 상태는 채움 색(5.69:1 이상)으로 구분되므로 DS Input과 같은 `border-border`를 쓴다. 누르는 동안의 muted 글자 3.91(다크 3.96)은 손을 떼면 돌아오는 순간 상태이고, DS 토큰 중 라이트에서 4.5를 지키는 눌림 표면이 없어 그대로 둔다. 입력 칸 테두리(1.47)도 3:1이 안 되지만 라벨로 식별되고 포커스 때 brand 테두리가 된다(DS 0.3.0). 컨트롤 테두리용 semantic 색은 DS에 제안만 했다(decisions-r25 "열지 않은 것").

placeholder는 두지 않는다. 라벨이 칸의 뜻을 말한다(4.3). DS 0.3.0부터 placeholder는 `fg-muted`(4.84 · 6.82)로 칠해지므로 필요해지면 넣어도 된다(0.2.0까지는 Android 기본 hint 색, 흰 표면 위 약 2.7:1).

**색만으로 뜻을 전하지 않는다.** 초과는 빨강 막대와 함께 "18,000원 초과" 문구를 쓴다. 청록과 빨강은 명도가 비슷해 적록 색각에서는 색만으로 구분이 약하다. 게이지는 스크린 리더 값(`accessibilityValue.text`)을 갖는다.

## 3. 기준

### 3.1 App Read와 다이얼

```
APP READ: 1인용 소비 회고 가계부(개인 핀테크 유틸리티) for 개발자 본인, 담백한 분석가 language,
          leaning RN CLI + React Navigation 7 + @eeennsu/native(NativeWind 5).
platforms: Android first-class(Galaxy S24+) · iOS none · web none
posture:   Android-first. 앱 색만 브랜드(C-5b)이고 헤더·탭 바·시트·스위치·날짜 대화상자는 플랫폼 기본. 세로 고정
offline:   N/A. 완전 로컬이고 네트워크는 모델 다운로드뿐이다. 그 화면에만 오류와 재시도를 둔다
```

| 다이얼 | 값 | 이유 |
|---|---|---|
| DESIGN_EXPRESSION | 4 | 개인 핀테크(4-6)의 아래쪽. 앱 색과 내용 컴포넌트는 DS로 브랜드를 입히고, 내비게이션 크롬은 네이티브로 둔다 |
| MOTION_INTENSITY | 3 | 화면 전환과 시트는 네이티브, 누름 피드백만 둔다. 숫자가 움직이면 안 된다(핀테크 편향) |
| VISUAL_DENSITY | 5 | 숫자와 목록이 많지만 입력은 한 손 엄지로 한다 |

한 화면에 대담한 요소는 하나다. 홈은 예산 게이지의 "오늘 기준선", 입력 시트는 큰 금액 칸, 회고 상세는 코드가 채운 숫자를 강조한 문장이다.

### 3.2 SAFE와 RISK

SAFE(이 앱에서 기본이 맞는 것):

- 글꼴은 시스템 글꼴(One UI Sans·Roboto)이다. DS의 `--font-sans`(Pretendard)는 RN Text가 쓰지 않고, 앱 단위 글꼴 통로(DS C-5c)는 열려 있지 않다
- 중립 회색은 DS gray 한 벌, 모서리는 DS radius(sm 4 · md 8 · lg 12 · full), 그림자는 DS `shadow-md` 하나(FAB)
- 아이콘은 DS가 쓰는 lucide 한 벌, 선 두께 2
- 다크 모드는 OS를 따른다(DS C-20 RN)

RISK(일부러 벗어나는 것):

| RISK | 얻는 것 | 치르는 것과 대응 |
|---|---|---|
| brand를 DS 기본 파랑 대신 채도 낮은 청록으로 | 돈의 괜찮은 상태에 색이 뜻을 갖고, 템플릿 파랑과 갈린다 | 빨강과 명도가 비슷하다. 초과는 늘 문구와 꽉 찬 막대로 함께 알린다 |
| 홈에 카드를 쓰지 않는다 | 숫자가 먼저 읽히고 카드 더미가 사라진다 | 누를 수 있는 묶음의 경계가 약해진다. 누르는 줄은 줄 전체가 누름 영역이고 눌림 표시와 "기록" 글자로 알린다 |
| 예산 게이지에 오늘 기준선을 긋는다(홈의 대담한 요소) | 한 번에 "빨리 쓰는지"가 보인다 | 선만으로는 뜻이 안 전해진다. 아래에 비율과 남은 일수를 글로 쓰고 스크린 리더 값을 준다 |
| 홈 오른쪽 아래에 "기록" 확장 FAB | 입력 3탭 목표(PRD 1장)에 엄지가 바로 닿는다 | 목록 끝을 가린다. 스크롤 아래 여백 96(`pb-24`), 홈에만 둔다 |

두 선택이 부딪히는 곳은 없다. FAB는 Android의 기본 패턴이라 EXPRESSION 4와 맞는다.

### 3.3 간격 리듬

DS 간격 키(`1`·`2`·`3`·`4`·`6`·`8`·`12`·`16`·`20`·`24` = 4~96px) 안에서 고른다.

| 자리 | 값 |
|---|---|
| 화면 좌우 여백 | 16(`px-4`), 모든 화면 같다. 누르는 줄은 `-mx-4 px-4`로 눌림 배경과 구분선을 화면 끝까지 늘린다 |
| 섹션 사이 | 32(`gap-8`) |
| 섹션 제목과 내용, 라벨과 칩 묶음 | 8(`gap-2`) |
| 목록 줄 위아래 | 12(`py-3`). 한 줄 텍스트면 48, 두 줄이면 72 |
| 줄 안 요소 사이 | 12(`gap-3`), 두 줄 텍스트 사이 4(`gap-1`) |
| 폼 필드 묶음 사이 | 24(`gap-6`) |
| 라벨과 입력 칸 | 4(`gap-1`, DS 검증 앱과 같다) |
| 칩 사이 | 12(`gap-3`). 칩 세로 hitSlop 5와 겹치지 않는 가장 작은 값이다 |
| 홈 히어로 안 | 12(`gap-3`) |
| FAB와 화면 가장자리 | 16(`bottom-4 right-4`) |
| 스크롤 끝 여백(FAB가 있는 화면) | 96(`pb-24`) |

### 3.4 글자

| 역할 | DS 스텝 | 예 |
|---|---|---|
| 금액 히어로, 입력 칸의 금액 | `2xl`(24/32/700) + `tabular-nums` | 411,600원 |
| 시트 제목 | `xl`(20/28/600) | 지출 기록 |
| 섹션 제목 | `lg`(18/28/500), `heading="2"` | 고정비 |
| 본문, 목록의 주 텍스트와 금액 | `md`(16/24/400) | 점심 순대국 · 9,500원 |
| 라벨, 보조 설명, 캡션 | `sm`(14/20/400), 대부분 `tone="muted"` | 식비 · 오늘 |

- 숫자는 모두 `tabular-nums`다. 금액은 어디서나 `32,000원`, 비율은 정수 %다(PRD 4.6). 사용액과 전체를 나란히 쓰는 분수 표기만 단위를 끝에 한 번 붙인다(`212,300 / 300,000원`). 12장 4번 포맷터 테스트에 넣는다
- react-native-css 3.0.7은 `font-variant-numeric`을 RN 스타일로 옮기지 않아 `tabular-nums`가 RN에서 아무 일도 하지 않는다. DS 0.3.0의 native 래퍼가 같은 클래스에 `-rn-font-variant: tabular-nums`를 더한다(RN은 문자열 `fontVariant`를 배열로 나눠 받는다, DS 구현 노트 F-21). 0.2.0 동안은 global.css에 같은 선언을 두었다
- 가장 큰 글자가 24px이다. 더 큰 표시 스텝은 DS의 5단 스케일(C-7a)을 다시 여는 일이라 만들지 않는다
- 글자 크기는 사용자 설정을 끝까지 따른다. 칩 묶음은 줄을 바꿔 늘어난 글자를 받는다. 1차 검증 뒤 앱 Chip을 1.5배로 묶었다가, DS 0.3.0 재검증(WCAG 1.4.4, DS 버튼과 어긋남)에 맞춰 뺐다(1.6의 9번)

### 3.5 모양, 아이콘, 움직임

- 모서리: 입력 칸과 버튼 sm·md 8, 버튼 lg 12(DS), 시트 위 모서리 12(`rounded-t-lg`), 칩·FAB·게이지 full
- 그림자는 떠 있는 요소(FAB)만. 시트는 scrim(`bg-overlay`)으로 분리한다
- 아이콘은 DS Button의 `icon`과 DS `Icon`으로만 쓴다. 이모지와 손으로 그린 SVG는 쓰지 않는다
- 움직임은 화면 전환·시트(네이티브), 누름 표시(`active:`로 표면 한 단계 진하게)뿐이다. 회고 문장은 필드가 완성될 때마다 나타나고 타자 효과는 없다(PRD 4.6)
- 누름 표시는 Android 리플이 아니라 클래스다. DS Button·Chip이 `active:opacity-80`이라 눌림 어휘를 하나로 맞춘다. 리플에 색(`android_ripple.color`)을 주면 JS 값이라 앱 색 재선언(C-5b)이 닿지 않고(DS 알려진 동작 11), 색을 빼면 테마의 중립색(`colorControlHighlight`)이라 쓸 수는 있다. 목록 줄에 색 없는 리플을 쓰는 안은 12장 6번에서 기기로 비교한다. 버튼과 칩은 DS의 `active:opacity-80`(색이 아니라 투명도라 className으로 바꾼 배경도 따라간다), 목록 줄과 접는 줄은 `active:bg-surface-hover`(표면이 한 단계 진해진다)
- 햅틱은 쓰지 않는다. 쓰게 되면 저장 성공에만 가벼운 진동을 준다(6장 후보)
- 떠 있는 요소(FAB)는 투명도 눌림을 쓰지 않는다. 아래 내용이 비친다(에뮬레이터 확인). 표면색으로 바꾼다(`active:bg-brand-hover active:opacity-100`)
- 상태 바 아이콘은 색 구성표를 따른다(라이트 `dark-content`, 다크 `light-content`). edge-to-edge는 상태 바를 투명하게만 하고 아이콘 색을 테마에 맡기는데, AppCompat 라이트 테마는 밝은 아이콘이라 흰 canvas 위에서 보이지 않는다. 시안은 루트의 `StatusBar`로 정하고 12장 6번에서 내비게이션 루트로 옮긴다. JS가 뜨기 전 첫 프레임까지 맞추는 테마 속성(`android:windowLightStatusBar`, `values-night`)과 다크 창 배경은 12장 6번 앱 테마에서 스위치 색(1.6의 7번)과 함께 정한다

### 3.6 상태

| 상태 | 규칙 |
|---|---|
| 로딩 | 로컬 DB라 목록·홈에 스켈레톤을 두지 않는다. 오래 걸리는 것은 회고 생성(스트리밍 표시와 취소)과 모델 다운로드(진행률)뿐이다 |
| 빈 상태 | 사실 한 줄 + 무엇이 여기에 생기는지 + 채우는 동작(홈 처음 시안). 필터 결과가 비면 "필터 초기화" |
| 오류 | 폼은 입력 칸 아래에, 회고는 PRD 4.6 폴백 표의 안내와 동작으로. `Alert.alert`는 파괴적 확인(삭제, 가져오기 전체 교체, 입력 버리기)에만 쓴다 |
| 오프라인 | 해당 없음(완전 로컬). 모델 다운로드만 네트워크 오류와 재시도를 둔다 |
| 새로 고침 | 해당 없음. 화면이 로컬 DB 쿼리를 구독해 바뀌면 바로 그린다. 당겨서 새로 고침을 두지 않는다 |

### 3.7 접근성

- 누름 영역은 48dp 이상이다. 칩은 38 + 세로 hitSlop 5, 목록 줄은 줄 전체다. DS Button sm(30)·md(42)는 세로 hitSlop(9·3)과 최소 폭 48로 채운다. 세로로 쌓으면 hitSlop이 겹치지 않게 sm은 18, md는 6 이상 띄운다(DS 알려진 동작 18). DS Input은 hitSlop이 없어 md(42)인 메모 칸은 48에 못 미친다(에뮬레이터에서 45~47dp, 1.6의 20번). 12장 6번에서 `lg`로 바꿀지 실기기에서 본다
- 저장이 눌리지 않을 때는 이유를 저장 위에 한 줄로 쓰고, live region이라 바뀌면 스크린 리더가 알린다("금액을 입력해 주세요", "카테고리를 골라 주세요")
- 스위치가 있는 줄은 줄 전체가 스위치다(`accessibilityRole="switch"`, 글자를 눌러도 켜진다)
- 하나만 고르는 칩 묶음에 라디오 그룹 의미는 없다. DS Chip이 토글이라서다(DS 알려진 동작 19). 칩마다 "선택됨"은 읽힌다
- 같은 이름의 버튼을 두지 않는다. 홈의 고정비 줄은 "휴대폰 요금 기록, 21일 결제 · 예상 55,000원"처럼 줄마다 이름이 다르다
- 게이지는 `progressbar` 역할과 읽을 값(`accessibilityValue.text`)을 갖는다
- 섹션 제목은 `heading`(스크린 리더의 제목 이동), 접는 영역은 `expanded` 상태를 알린다
- 시트가 떠 있으면 뒤의 화면을 스크린 리더에서 숨긴다(실제 시트는 formSheet가 처리한다)
- 접근성 prop만 가진 래퍼 View(live region 등)에는 `collapsable={false}`를 준다. New Architecture가 스타일·이벤트 없는 View를 평탄화해 prop이 기기에 닿지 않는다. Jest 트리에는 남아 테스트가 통과하므로 `collapsable` 단언을 따로 둔다. 회고 스트리밍 상태도 같다

### 3.8 문구

- 해요체, 담백하게. 느낌표, 이모지, 인사 머리말("안녕하세요!")을 쓰지 않는다
- 화면 문자열에 em-dash(`—`)를 쓰지 않는다. 구분은 가운뎃점(`·`)이다
- 날짜는 "오늘", "어제", 그 전은 "9월 22일"이다
- 가짜 데이터도 실제처럼 쓴다(점심 순대국 9,500원, 다이소 수납함 7,000원). 이름 없는 "Item 1"이나 딱 떨어지는 숫자만 쓰지 않는다

## 4. 화면 구조

### 4.1 Nav Read

```
NAV READ (React Navigation 7 정적 API. 스킬 기본값인 Expo Router 대신)
platforms: Android first-class · iOS none · web none
tabs (3): 홈 · 내역 · 회고                            ← PRD 5장(2026-09-25 결정)
RootStack (native-stack)
  Tabs (bottom-tabs)
    Home      홈     헤더 "9월"(진행 중인 달) + 오른쪽 톱니(설정)
    History   내역   헤더 "내역" + 오른쪽 "필터"
    Retro     회고   헤더 "회고"
  Settings                                push ← 홈 헤더 톱니
  RetroDetail { kind, periodStart }       push. 탭 바를 덮는다
  Budget                                  push ← 설정, 홈 히어로, 홈 첫 실행 "예산 정하기". 이번 달부터 적용
  FixedCosts → FixedCostEdit { id? }      push ← 설정
  Categories · ReasonTags · Models · Backup   push ← 설정 (Models ← 회고 폴백 "모델 관리로 이동")
  Entry { transactionId? | fixedCostId? } formSheet(바텀 시트)
  HistoryFilter                           formSheet
entry points: Entry ← "기록" FAB(홈), 고정비 줄(홈), 최근 지출 줄(홈), 거래 줄(내역)
sheets: Entry, HistoryFilter. 한 화면이 띄우는 시트는 2개 이하
deep links: 없음. 2단계 카드 알림 파싱이 Entry를 초안과 함께 연다
android back: 기본 pop. Entry는 입력이 있으면 버릴지 묻는다. RetroDetail은 생성 중에 나가면 생성을 취소하고
              모델을 해제한다(PRD 6장 실행 정책)
max taps to any core screen: 2
```

- 탭에서 들어가는 하위 화면은 모두 루트 스택에 두고 탭 바를 덮는다. 앱 전체에서 한 가지로 정했다
- 입력 폼은 결정 트리로는 모달(만들고 돌아오는 작업)이지만 PRD 4.1대로 바텀 시트다. 필수 항목만 먼저 보이고 나머지를 접어서, 시트의 조건(부모가 보이고 한 화면보다 작다)을 처음 열 때 맞춘다. 펼치면 시트가 위로 커진다
- 설정은 탭이 아니라 홈 헤더 오른쪽 톱니로 여는 push 화면이다(PRD 5장, 2026-09-25 결정). 탭에는 매일 돌아오는 곳만 남긴다. 탭 아이콘은 DS의 `home` · `list` · `chart-pie`다
- 헤더의 톱니는 DS에 아이콘만 있는 Button이 없어(DS 알려진 동작 9) Pressable과 `Icon name="settings" label="설정"`으로 만들고 누름 영역 48을 준다
- FAB는 기록이 이 앱의 핵심 동작이라 둔다. 탭 바 가운데가 아니라 홈 화면의 오른쪽 아래다

### 4.2 홈(시안 있음)

위에서부터 행동이 필요한 것 → 참고할 것 순서다.

1. **남은 예산**: "9월 남은 예산"(sm muted) → 금액(2xl) → 소비 속도 한 줄(md, 할 수 있는 일이라 금액 바로 밑) → 예산 게이지(오늘 세로선) → "788,400원 사용 · 66% | 예산 1,200,000원"(sm muted, 좁으면 두 줄) → "세로선은 오늘이에요 · 이번 달 80% 지남"(sm muted, 세로선의 뜻). 달은 헤더("9월")가 맡으므로 12장 6번에서 헤더를 붙이면 제목을 "남은 예산"(초과면 "예산")으로 줄인다. 시안은 헤더가 없어 달을 제목에 둔다. 총예산을 넘으면 제목이 "9월 예산", 금액이 "18,000원 초과"(danger), 소비 속도가 "남은 7일 · 지금부터 쓰는 만큼 초과가 늘어요", 게이지가 꽉 찬 danger다("홈 초과" 시안). 예산이 없으면 "아직 예산이 없어요" + "예산 정하기". 히어로 전체가 버튼이고 예산 화면을 연다(4.1)
2. **고정비**: 제목 옆 "5개 중 3개 기록", 결제일이 오늘이거나 지났는데 기록하지 않은 항목만 줄로. 줄 전체가 버튼이고 이름은 줄마다 다르다("휴대폰 요금 기록, ..."). 결제일 오름차순(오래 밀린 것 먼저)이다. 누르면 채워진 입력 시트(PRD 4.4, 4.3). 모두 기록했으면 "이번 달 고정비를 모두 기록했어요" 한 줄로 알린다
3. **카테고리 예산**: 예산을 정한 카테고리만. 이름, "212,300 / 300,000원", 얇은 게이지. 넘으면 danger 글자 "18,000원 초과"와 꽉 찬 danger 막대
4. **최근 지출**: 5줄. 메모(한 줄, 넘치면 말줄임) · "식비 · 오늘" · 금액. 누르면 수정 시트. 목록 끝에 "내역 전체 보기"(secondary)
5. **기록 FAB**: 오른쪽 아래, 확장형(아이콘 + "기록")

소비 속도는 PRD 4.3의 식을 따른다. 남은 일수는 오늘을 포함하고(9월 24일이면 7일), 하루 쓸 수 있는 금액은 남은 예산 ÷ 남은 일수를 원 단위로 내린 값이다("남은 7일 · 하루 58,800원까지 쓸 수 있어요"). 게이지 기준선은 오늘이 끝날 때까지의 몫(24 ÷ 30 = 80%)이다.

### 4.3 입력 시트(시안 있음)

PRD 4.1의 3탭(금액 → 카테고리 → 저장)이 기준이다.

1. 손잡이, 제목 "지출 기록"(수입이면 "수입 기록", 수정이면 "지출 수정"), 오른쪽 "닫기"
2. **금액**: 라벨 "금액", 큰 입력 칸(`kind="number"`, 2xl, 고정폭 숫자, 천 단위 쉼표) + "원". 시트가 열리면 이 칸에 포커스가 가고(DS Input의 `ref`로 `focus()`) 숫자 키패드가 뜬다. 키패드가 뜨면 시트가 그만큼 올라가고, 넘치는 만큼 가운데 스크롤이 줄어 제목과 저장이 늘 보인다
3. **카테고리**: 칩 11개(수입이면 3개), 줄 바꿈. 고른 칩은 brand로 채운다
4. **날짜**: "오늘"(기본) · "어제" · "다른 날"(Android 날짜 대화상자). 다른 날을 고르면 그 칩이 "9월 20일"로 바뀐다
5. **선택 항목 더 보기**(접힘): 누르면 펼쳐지고 아래 줄에 무엇이 들어 있는지 적는다. 구분(지출/수입) · 이유 · 만족도 · 메모(과거 메모 제안 칩, 고르면 전에 쓴 카테고리도 고른다) · 결제수단 · 고정비(스위치, 켜면 고정비 항목 칩)
6. **저장**: 아래 고정, 키보드가 떠도 보인다. 금액과 카테고리가 있어야 눌리고, 눌리지 않으면 그 이유를 위에 한 줄로 쓴다. 실제 formSheet에서도 키보드를 피하는 뷰에 창 기준 위치(시트의 top)를 넘기거나 react-native-keyboard-controller를 쓴다(6장)

- 고정비를 켜면 "연결할 고정비 항목" 칩(등록한 항목)이 나온다. 스위치 줄은 글자를 눌러도 켜진다
- 입력 칸에 placeholder를 두지 않는다(2장). 라벨이 칸의 뜻을 말한다
- 이유·만족도·결제수단은 고른 칩을 다시 누르면 선택이 풀린다. 필수(카테고리, 날짜, 구분)는 풀리지 않는다. 결제수단은 미리 고르지 않는다(PRD 4.1에 기본값이 없다)
- 메모 제안 칩은 3개까지다(과거 메모 수만큼 늘지 않게). 칸이 비면 최근 메모 3개, 입력하면 그 글자를 포함하는 과거 메모 중 최근 3개다
- 수입으로 바꾸면 카테고리 선택이 비고 지출 전용 항목(이유, 만족도, 고정비)이 사라진다
- 수정 모드는 펼친 영역 맨 아래에 "삭제"(danger, 확인 대화상자)를 둔다
- 홈 고정비 줄에서 열면(PRD 4.4) 채워진 채로 연다. 제목 "휴대폰 요금 기록", 금액은 예상 금액, 카테고리는 항목의 카테고리, 날짜 칩은 결제일("9월 21일")이다. 메모와 고정비 연결은 선택 항목 안에 있으므로, 선택 항목에 값이 있으면 접힌 줄의 요약이 항목 이름 대신 값을 보인다("휴대폰 요금 · 고정비 연결"). 사용자는 금액만 고치고 저장한다. 시안은 12장 6번 formSheet와 함께 만든다
- 입력이 있는 채로 닫기·뒤로 가기·아래로 끌기를 하면 버릴지 묻는다

### 4.4 나머지 화면(명세만)

| 화면 | 구조 | 상태 |
|---|---|---|
| 내역 | 위에 이번 기간 합계 한 줄("9월 지출 1,232,400원 · 수입 3,200,000원"), 적용 중인 필터 요약과 "초기화". 날짜별 묶음(끈적한 머리 "9월 24일 목요일 · 23,400원"), 줄은 메모 · 카테고리·결제수단 · 금액(수입은 `+`와 `text-brand`). 고정비 거래는 Badge "고정비" 하나(한 줄에 배지 하나까지). 줄을 누르면 수정 시트 | 첫 실행: "아직 기록이 없어요" + "기록하기". 필터 결과 없음: "조건에 맞는 기록이 없어요" + "필터 초기화" |
| 내역 필터(시트) | 기간(이번 달 · 지난 달 · 직접), 카테고리, 이유 태그, 지출/수입 칩. 아래 "적용" | - |
| 회고 | 위에 주간/월간 칩. 기간 목록(최신 먼저): "9월 3주 · 9.15~9.21" + 한 줄 상태(저장된 회고의 headline 첫 줄 · "아직 만들지 않았어요" · "기록이 부족해요" · 진행 중 Badge) | 기록 전: "한 주가 끝나면 여기에 회고가 생겨요" |
| 회고 상세 | 헤더 기간 이름, 오른쪽 "다시 만들기"(저장본이 있을 때). 총지출 하나를 크게(변동·고정 나눠 한 줄), 직전 대비 한 줄 → 회고 문장(headline xl, insights, 제안) → 카테고리 도넛(상위 5개 + 기타, 가장 큰 카테고리만 brand·나머지는 회색 단계, 조각에 직접 %) + 같은 값의 카테고리 표(차트의 대체 텍스트 역할) → 일별 막대 | 생성 중(필드마다 나타남, "쓰는 중", 취소), 다시 쓰는 중, 폴백 3가지(PRD 4.6 표), 기록 부족, 진행 중(지표·차트만), 월간 고정비 미기록 알림("기록하기" · "그대로 만들기") |
| 설정 | 홈 헤더 톱니로 연다(탭 아님). 묶은 목록: 기록(카테고리, 이유 태그) · 예산(이번 달부터 적용되는 값 표시) · 고정비(항목, 개수) · 회고(모델 관리, 사용 중 모델) · 데이터(내보내기, 가져오기). 줄은 push이고 꺾쇠를 단다(DS 0.3.0 Icon). 파괴적 동작(가져오기 전체 교체)은 맨 아래 | 모델이 없으면 모델 관리 줄에 "모델 없음" |
| 모델 관리 | 레지스트리 모델마다 이름·크기·라이선스, 받기/삭제/사용 선택. 받는 중에는 Meter와 퍼센트, Wi-Fi 권장 문구 | 저장 공간 부족, 해시 불일치, 네트워크 오류는 줄 안에 문구와 "다시 받기" |

회고 문장에서 코드가 채운 값(금액·비율·이름)은 `text-brand`와 고정폭 숫자로 강조한다. "숫자는 코드가 쓴다"(PRD 2장)가 화면에서 보이게 하는 장치이고 회고 상세의 대담한 요소다. DS Text는 문자열만 받아(DS 알려진 동작 6) 이 부분은 중첩 RN Text로 앱이 만든다.

차트는 Skia가 JS 색을 받는다. 앱이 재선언한 색은 DS JS 토큰에 닿지 않으므로(DS 알려진 동작 11) 차트 색은 NativeWind의 `useUnstableNativeVariable('--bg-brand')` 같은 런타임 값에서 읽는다. 12장 6번에서 정한다.

### 4.5 시안 위치

UI 구현(PRD 12장 6번) 전까지 앱은 시안 모음을 띄운다. 위 칩으로 화면을 바꾸고, 가짜 데이터로 그리며 DB와 내비게이션은 붙이지 않았다. 6번에서 `src/preview/`를 지운다.

| 파일 | 내용 |
|---|---|
| `src/App.tsx` | 시안 모음 껍데기(칩 전환, 시안마다 새로 그리기, 상태 바 근사와 아이콘 색) |
| `src/preview/HomeMock.tsx` | 홈(채운 상태, 총예산 초과, 첫 실행) |
| `src/preview/EntrySheetMock.tsx` | 입력 시트(접힘, 펼침). 뒤에 홈과 scrim |
| `src/preview/DsCheckScreen.tsx` | DS 연동 확인 화면(1장) |
| `src/preview/fixtures.ts` | 2026-09-24 기준 가짜 데이터 |
| `src/ui/Meter.tsx` | 5.2의 앱 컴포넌트(사용률 막대) |
| `__tests__/design.test.tsx` | 앱 색, Chip, Meter, 두 시안의 동작 |
| `__tests__/App.test.tsx` | 시안 전환, 상태 바 아이콘 색 |

## 5. 컴포넌트

### 5.1 화면별 DS 컴포넌트

| 화면 | DS | 앱 컴포넌트 | 플랫폼·라이브러리 |
|---|---|---|---|
| 홈 | Text, Stack, Button(FAB, "내역 보기", "예산 정하기"), Icon(헤더 톱니) | Meter, 목록 줄 | ScrollView |
| 입력 시트 | Text, Stack, Label, Input(금액, 메모), Button(저장, 닫기), Chip | - | Switch, 날짜 대화상자, formSheet |
| 내역 | Text, Stack, Badge(고정비), Button, Chip(필터 요약) | 목록 줄 | SectionList |
| 회고 목록 | Text, Stack, Badge(진행 중), Chip(주간/월간) | 목록 줄 | FlatList |
| 회고 상세 | Text, Stack, Card(폴백 안내), Button | 문장 렌더러(중첩 Text) | victory-native, Skia |
| 설정 | Text, Stack, Icon(꺾쇠) | 목록 줄 | ScrollView |
| 설정 하위(예산, 고정비 편집, 카테고리) | Label, Input, Textarea, Button, Chip | - | - |
| 모델 관리 | Text, Stack, Button, Badge(사용 중) | Meter(진행률) | - |

### 5.2 DS에 없던 것

DS 0.2.0에 없어 시안이 임시로 채운 것은 DS 0.3.0에 넣었다(`../design-system`의 스펙 R25, `docs/decisions-r25.md`, 구현 노트 N-17). 2026-09-25에 0.3.0을 npm에 내고 이 앱을 올려 임시 Chip(`src/ui/Chip.tsx`), 버튼의 `min-h-12`·`active:opacity-80`, 입력 칸의 `focus:border-border-focus`, global.css의 `tabular-nums` 임시 선언을 지웠다.

| 0.2.0에 없던 것 | 시안이 임시로 한 것 | 0.3.0 |
|---|---|---|
| **Chip**(고르는 칩) | `src/ui/Chip.tsx` | `Chip`. API가 같아 import만 바꿨다 |
| **Icon**(단독 아이콘) | 글자로 대신했다("기록", "선택 항목 더 보기") | `Icon`과 이름 4개(home, list, chart-pie, calendar). 탭 바·설정 꺾쇠에 쓴다 |
| **누름 표시** | className `active:opacity-80` | Button · Chip에 `active:opacity-80` |
| **48dp 누름 영역** | Button에 `min-h-12` | RN Button 세로 hitSlop과 최소 폭 48 |
| **Input 포커스 표시** | className `focus:border-border-focus` | Input · Textarea에 같은 클래스 |
| **placeholder 색** | placeholder를 두지 않았다 | `fg-muted`로 칠한다(앱은 여전히 두지 않는다, 2장) |
| **`tabular-nums`** | global.css 임시 선언 | native 래퍼가 RN 선언을 낸다 |
| **번들 크기** | - | 아이콘별 import. 이 앱의 릴리스 번들이 3.91MB에서 2.20MB가 됐다 |

에뮬레이터에서 찾아 DS에 제안할 것:

| 찾은 것 | 영향 | 제안 |
|---|---|---|
| RN Label과 Input이 따로 읽힌다 | 금액 칸이 "금액"으로 두 번 읽힌다 | Label의 `htmlFor`로 연결된 입력 칸이 이름을 가지면 Label을 스크린 리더에서 숨긴다 |
| Icon이 글자 크기를 따르지 않는다 | 2배에서 "닫기"의 ×가 글자보다 한참 작다 | Button 안 아이콘을 글자 배율에 맞출지 정한다(RN `PixelRatio.getFontScale`) |
| RN Button·Chip의 키보드 포커스 표시 | Android 기본 강조(옅은 사각형)뿐이다 | 웹의 포커스 링처럼 `focus:` 테두리를 둘지 정한다. 폰에서 하드웨어 키보드는 드물어 급하지 않다 |
| 떠 있는 버튼의 눌림 | 투명도 눌림이 아래 내용을 비친다 | FAB 같은 떠 있는 버튼은 앱이 표면색 눌림으로 덮는다(3.5). DS 알려진 동작에 적는다 |

DS에 아직 없는 것:

| 필요한 것 | 쓰는 곳 | 지금 | 다음 |
|---|---|---|---|
| **Meter**(사용률 막대) | 홈 게이지, 카테고리 예산, 모델 다운로드 | 앱 컴포넌트 `src/ui/Meter.tsx` | DS 계약은 number prop을 금지한다(DS AC-15). 값을 받는 컴포넌트를 DS에 두려면 그 규칙을 먼저 정해야 해 보류했다(DS R25 보류) |
| 목록 줄 | 홈, 내역, 설정 | 화면 안 조합(`HomeMock`의 `Row`) | 세 화면에서 모양이 굳으면 DS 후보로 본다 |
| 텍스트 줄 수 제한 | 목록의 메모 | RN Text(`react-native-css/components`) + DS 클래스 | `numberOfLines`는 number prop이라 AC-15에 걸린다. 보류 |
| 문장 안 강조 | 회고 문장 | 앱이 중첩 RN Text로 | DS 알려진 동작 6(v1 범위 밖). 보류 |
| 바텀 시트 | 입력, 내역 필터 | React Navigation formSheet | RN 오버레이는 DS v2 범위다 |
| 스위치, 날짜 선택 | 고정비 켜기, 다른 날 | RN Switch, 플랫폼 날짜 대화상자 | 플랫폼 기본을 쓴다 |
| 차트 | 회고 상세 | victory-native(PRD 8장) | DS 대상 아님 |

## 6. 라이브러리 후보(설치하지 않음)

스킬 기본값(Expo, Expo Router, React Native Reusables, expo-haptics)은 쓰지 않는다.

| 라이브러리 | 용도 | 언제 | 비고 |
|---|---|---|---|
| `@react-navigation/native` · `native-stack` · `bottom-tabs` 7, `react-native-screens`, `react-native-safe-area-context` | 4.1의 구조, formSheet, 안전 영역 | 12장 6번 | PRD 8장 결정. 시안의 상태 바 근사를 `useSafeAreaInsets`로 바꾼다 |
| `react-native-keyboard-controller` | 키보드 위 저장 버튼 | formSheet의 키보드 처리가 모자랄 때 | Android 15+ edge-to-edge에서는 `adjustResize`가 창을 줄이지 않는다 |
| `@react-native-community/datetimepicker` | "다른 날" | 6번 | Android 날짜 대화상자 |
| `@gorhom/bottom-sheet` + `react-native-gesture-handler` | formSheet 대안 | formSheet가 키보드·높이 변화에서 실패하면 | Reanimated 4는 이미 있다 |
| `victory-native` + `@shopify/react-native-skia` | 회고 차트 | 6번 | PRD 8장 |
| `@shopify/flash-list` | 내역 | SectionList가 느릴 때 | 처음은 SectionList |
| `react-native-haptic-feedback` | 저장 성공 진동 | 원할 때 | 없어도 된다 |

## 7. 결정 기록

### 7.1 스킬이 묻거나 승인을 받으라는 곳에서 고른 것

| 지점 | 고른 것 | 이유 |
|---|---|---|
| App Read가 애매하면 한 가지 묻기 | 묻지 않았다 | PRD가 사용자, 기기, 톤("담백한 분석가")을 정해 두었다 |
| SAFE/RISK 채택 | 3.2의 SAFE 전부와 RISK 4개 | RISK마다 치르는 것에 대응을 붙였다. 0개면 템플릿, 전부면 코스튬이라는 스킬 기준 |
| 미리보기(HTML 견본) 제안 | 만들지 않았다 | 토큰의 정본은 DS다. 견본 파일은 값을 DS 밖에 복사한다. 앱 안 시안 화면과 Jest 스타일 테스트가 같은 역할을 한다 |
| Nav Read를 MOBILE-DESIGN.md에 저장 | 이 문서 4.1에 적었다 | 문서는 PRD와 DESIGN 둘뿐이다 |
| 리뷰 기준선(design-baseline.json) | 만들지 않고 점수를 8장에 적었다 | 같은 이유 |
| 입력 폼의 컨테이너(결정 트리는 모달) | PRD대로 시트 + 필수만 먼저 보이기 | 4.1 |

### 7.2 스킬 기본값을 바꾼 것

- 문서: MOBILE-DESIGN.md, `design-system/<이름>/MASTER.md` 대신 이 문서 하나
- 토큰: tailwind.config·`theme/tokens.ts`를 만들지 않는다. 색은 global.css의 C-5b 재선언만, 간격은 DS 키 안에서, 글자·모서리·글꼴은 DS 그대로
- 스택: Expo·Expo Router → RN CLI·React Navigation 7, React Native Reusables → `@eeennsu/native`, expo-haptics → 없음(6장 후보), expo-font → 시스템 글꼴
- ui-ux-pro-max `--design-system` 결과 중 글꼴 추천(Caveat·Quicksand, 손글씨 계열)과 스타일 추천(Glassmorphism)은 한국어 가계부와 맞지 않고 mobile-taste의 블러 금지와 부딪혀 버렸다. 쓴 것은 제품 추천("차분한 주색 + 성공 초록 + 경고 빨강")과 차트 규칙(도넛 5~6조각 이하, 직접 라벨, 표 대체), 폼 규칙(보이는 라벨, 점진 공개), 접근성 규칙이다
- `--persist`는 쓰지 않았다

### 7.3 PRD와 부딪힌 스킬 규칙

| 스킬 규칙 | PRD | 따른 것 | 바꿀 만한가 |
|---|---|---|---|
| 설정 탭 금지(tell #25), 1인 앱은 헤더 톱니로 설정을 연다(navigation.md 예시 B) | 설정은 4번째 탭이었다(5장) | 스킬 | 2026-09-25 사용자 결정으로 PRD를 바꿨다. 탭은 홈·내역·회고 3개이고 설정은 홈 헤더 톱니 push다. 설정 안의 기능은 대부분 다른 곳에서도 들어간다(예산은 홈 히어로와 첫 실행 버튼, 고정비는 홈 고정비 줄, 모델 관리는 회고 폴백) |
| 만들고 돌아오는 작업은 모달(결정 트리 3) | 입력은 하단 시트(4.1) | PRD | 필수 항목만 먼저 보여 시트 조건을 맞췄다. 기기에서 펼친 시트의 키보드 동작이 나쁘면 모달로 바꾸는 것을 다시 본다 |
| 목록의 모든 동적 텍스트에 줄 수 제한 | DS Text에 `numberOfLines`가 없음 | 메모만 RN Text로 한 줄 제한, 나머지는 줄 바꿈 | ui-ux-pro-max는 말줄임보다 줄 바꿈을 권한다 |

## 8. 검증

작업 과정을 모르는 검증 에이전트가 격리 worktree에서 이 문서, PRD 4·5장, 바뀐 파일만 받아 mobile-design-review(정적, 보고 전용)와 ui-ux-pro-max `pro-rules.md` 체크리스트로 봤다. 기기 화면이 없어 화면을 봐야 하는 항목은 미검증으로 남긴다.

### 8.1 1차(커밋 `6e874c6`)

Design Score **B**(3.65, 열린 high 1개로 B 상한), AI Slop Score **B**(3.80, 같은 상한). 지적 15개(high 1, medium 5, polish 9).

| 지적 | 영향 | 처리 |
|---|---|---|
| 001 입력 시트에 키보드 처리가 없어 키패드가 저장을 가린다 | high | 반영. `KeyboardAvoidingView`(behavior padding)로 시트를 올리고 가운데 스크롤이 줄게 했다. 금액 칸에 포커스한다 |
| 002 DS Button sm·md 누름 영역 30·42dp | medium | 반영. `min-h-12`(DS 0.3.0 hitSlop이 나오면 지운다) |
| 003 DS Button 눌림 표시 없음 | medium | 반영. className `active:`(DS 0.3.0이 넣으면 지운다) |
| 004 "선택 항목 더 보기" 요약 글자 넘침 | medium | 반영. 요약을 아래 줄로 내렸다 |
| 005 게이지 세로선의 뜻이 화면 글자에 없음 | medium | 반영. "세로선은 오늘이에요 · 이번 달 80% 지남" 줄 |
| 006 `tabular-nums`가 RN에서 무효(react-native-css 3.0.7) | medium | 반영. global.css 임시 선언 + 테스트, 근본 수정은 DS 0.3.0 |
| 007 시안 껍데기의 상태 바 근사 | polish | 반영하지 않음. 시안 전용이고 12장 6번에서 `useSafeAreaInsets`로 바꾼다 |
| 008 저장 비활성 이유를 알리지 않음 | polish | 반영 |
| 009 결제수단을 미리 고름(PRD 4.1은 기본값 없음) | polish | 반영 |
| 010 Switch가 AppCompat 기본 청록 | polish | 반영하지 않음. 앱 테마의 colorAccent에 brand hex를 적으면 색이 DS 밖에 한 벌 더 생긴다. 12장 6번에서 앱 테마·스플래시와 함께 정한다(1.6의 7번) |
| 011 "내역 보기"가 글자처럼 보임 | polish | 반영. 목록 끝의 secondary 버튼 "내역 전체 보기"로 |
| 012 눌림 배경이 글자에 붙음, 리플을 안 쓰는 이유 없음 | polish | 반영. `-mx-4 px-4`, 3.5에 이유 |
| 013 앱 Chip 글자 크기 상한 없음 | polish | 반영했다가 되돌림. `maxFontSizeMultiplier={1.5}`를 넣었으나 DS 0.3.0 재검증이 WCAG 1.4.4(200%) 미달로 짚어 DS Chip과 함께 뺐다 |
| 014 문서 수치가 코드와 다름 | polish | 반영(모서리, 두 줄 높이, 포커스 표시, 대비 값) |
| 015 고정비 문구가 결제일 당일을 빠뜨림 | polish | 반영 |

검증 에이전트의 제안으로 다크에서만 시트에 테두리를 긋고(시트 대 scrim 배경 1.16), 메모 제안을 3개로 묶는 규칙을 4.3에 더했다.

### 8.2 2차(커밋 `855a1a1`)

Design Score **B**(3.80, 열린 high 1개로 B 상한), AI Slop Score **B**(3.90, 같은 상한). 1차 지적 15개 중 12개가 닫혔고, 새 지적 14개(high 1, medium 2, polish 11).

| 지적 | 영향 | 처리 |
|---|---|---|
| 001 키보드가 뜨면 저장이 여전히 가린다. `KeyboardAvoidingView`에 `keyboardVerticalOffset`이 없어, 시안 영역이 창 위에서 떨어진 만큼(상태 바 + 칩 줄) 덜 올라간다 | high | 반영. 화면의 창 기준 위치를 `measureInWindow`로 재서 넘긴다 |
| 002 홈 히어로에 총예산 초과 상태가 없다 | medium | 반영. "홈 초과" 시안과 4.2 명세 |
| 003 입력 칸 placeholder가 약 2.7:1(Android 기본 hint 색) | medium | 반영. 시안에서 placeholder를 뺐고, DS 0.3.0이 `fg-muted`로 칠한다 |
| 004 시안 껍데기의 안전 영역 근사 | polish | 반영하지 않음. 1차 007과 같다 |
| 005 Switch가 플랫폼 기본 accent 색 | polish | 반영하지 않음. 1차 010과 같다(12장 6번 앱 테마) |
| 006 금액 키패드가 `numeric`(`.` `-`가 뜬다) | polish | 반영하지 않음. DS 계약의 `kind` 매핑(C-11)이라 DS에 제안만 했다. 숫자 외 문자는 코드가 거른다 |
| 007 Input 포커스 표시 | polish | 반영. className `focus:border-border-focus`(DS 0.3.0이 넣으면 지운다) |
| 008 저장 이유가 바뀔 때 스크린 리더가 알리지 않는다 | polish | 반영. live region |
| 009 고정비 줄은 스위치만 눌린다 | polish | 반영. 줄 전체가 스위치 |
| 010 고정비를 켜도 항목 칩이 안 나온다 | polish | 반영 |
| 011 소비 속도 줄이 캡션에 묻힌다 | polish | 반영. 금액 바로 밑, md |
| 012 게이지 트랙이 라이트 canvas와 1.10:1 | polish | 반영. 라이트 트랙 `bg-border` |
| 013 가로 모드를 정하지 않았다 | polish | 반영. 세로 고정 |
| 014 하나만 고르는 칩 묶음에 라디오 그룹 의미가 없다 | polish | 반영하지 않음. DS Chip이 토글이라서다(DS 알려진 동작 19). 묶음 컴포넌트는 DS에 필요가 둘이 되면 연다 |

DS 쪽 검증(Chip · Icon과 RN 보정)은 `../design-system`의 구현 노트 N-17에 있다. 그 결과로 DS 0.3.0의 눌림 표시가 `active:bg-*-hover`에서 `active:opacity-80`으로 바뀌어, 이 앱의 임시 Chip과 버튼 className도 같게 맞췄다.

### 8.3 3차(커밋 `eb5bd6e`)

Design Score **B**(3.85, 열린 high 1개로 B 상한), AI Slop Score **A**(4.00). 2차 지적 14개 중 9개가 닫혔고 4개는 선언된 예외로 인정받았다. 2차 008(live region)은 기기에서 동작하지 않아 다시 열렸다. 새 지적 10개(high 1, medium 1, polish 8).

| 지적 | 영향 | 처리 |
|---|---|---|
| 001 라이트에서 상태 바 아이콘이 흰 canvas 위에 흰색이다. edge-to-edge가 아이콘 색을 테마에 맡기는데 AppCompat 라이트 테마는 밝은 아이콘이다 | high | 반영. 시안 루트에 색 구성표를 따르는 `StatusBar`와 테스트(3.5). 첫 프레임의 테마 속성은 12장 6번 앱 테마(1.6의 15번) |
| 002 저장 이유의 live region View가 New Architecture에서 평탄화돼 기기에서 알리지 않는다. Jest는 통과한다 | medium | 반영. `collapsable={false}`와 단언, 3.7 규칙 |
| 003 헤더 "9월"과 히어로 "9월 남은 예산"이 달을 두 번 말한다 | polish | 반영(4.2). 헤더를 붙이면 제목을 줄인다. 시안은 헤더가 없어 그대로 |
| 004 "212,300 / 300,000원"이 금액 표기 규칙과 어긋난다 | polish | 반영. 분수 표기 예외를 3.4에 |
| 005 고정비 미기록 줄의 순서 규칙이 없다 | polish | 반영. 결제일 오름차순(4.2), 시안 순서도 |
| 006 메모 제안이 입력으로 거르는지 명세가 없다 | polish | 반영(4.3) |
| 007 고정비 줄에서 연 채워진 시트의 명세가 없다 | polish | 명세만 반영(4.3). 시안 variant는 formSheet와 함께 12장 6번에서 |
| 008 리플을 쓰지 않는 근거가 부정확하다(색을 빼면 테마 중립색) | polish | 반영. 3.5 근거를 고쳤고 DS decisions-r25 §4도 고쳤다 |
| 009 상태 표에 새로 고침이 없고 고정비를 모두 기록했을 때의 문구가 없다 | polish | 반영(3.6, 4.2) |
| 010 다크 콜드 스타트의 창 배경(`#303030`)이 canvas와 다르다 | polish | 반영하지 않음. 창 배경을 canvas에 맞추려면 색 값을 네이티브 리소스에 한 벌 더 적어야 한다. 스위치 색(1차 010)과 같은 결정이라 12장 6번 앱 테마·스플래시에서 함께 정한다(1.6의 16번) |

검증은 최대 3회로 정해 두었으므로 3차 반영분은 새 에이전트로 다시 보지 않았다. 반영한 high·medium에는 Jest 단언을 더했고 기기 확인 목록(1.6의 13·15번)에 넣었다. 검증 에이전트는 001이 기기에서 닫히면 Design Score가 A(3.95)라고 봤다.

| 차수 | Design Score | AI Slop Score | 상한 |
|---|---|---|---|
| 1차 | B 3.65 | B 3.80 | high 1(키보드) |
| 2차 | B 3.80 | B 3.90 | high 1(키보드 offset) |
| 3차 | B 3.85 | A 4.00 | high 1(상태 바 아이콘, 3차 뒤 반영) |
