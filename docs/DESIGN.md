# spendback DESIGN

> 상태: v0.1 · 2026-09-24 · PRD 12장 3번(디자인 시스템 연동과 DESIGN.md) 결과
>
> 기획의 정본은 [PRD.md](PRD.md)이고, 이 문서는 디자인과 디자인 시스템(DS) 연동의 정본이다. 화면을 만들 때는 이 문서를 먼저 읽는다. 규칙이 부딪히면 PRD·DS 규칙 > mobile-taste-skill > ui-ux-pro-max 순서로 따른다. DS 규칙은 `../design-system`의 스펙(`docs/design-system-spec.md`)이다.

## 1. 디자인 시스템 연동

### 1.1 결과

npm의 `@eeennsu/native` 0.2.0을 Expo 없이 RN CLI 앱(RN 0.87.1)에 붙였다. 2026-09-24에 기기 없이 아래까지 확인했다.

| 확인 | 결과 |
|---|---|
| `pnpm typecheck` · `lint` · `format:check` · `test` | 통과. Jest 21개 |
| Jest에서 DS 컴포넌트의 className이 스타일로 풀리는지(DS 구현 노트 N-14, F-11) | 풀린다. `__tests__/ds.test.tsx`가 Box·Badge·Label·Textarea·Button의 색, 여백, 글자 크기, 다크 값을 본다 |
| Metro 번들(`react-native bundle --platform android --dev false`)에 토큰 값과 클래스가 들어가는지(DS 구현 노트 F-12) | 들어간다. `StyleCollection.inject`에 DS 클래스(`bg-brand`, `text-fg-muted`, `rounded-full` 등)와 해석된 색(앱 brand `#107460`·`#55c1a3`, DS danger `#e7000b`)이 있다 |

기기 화면은 보지 않았다. 기기에서 볼 것은 1.6에 있다.

### 1.2 설치한 것

| 패키지 | 버전 | 이유 |
|---|---|---|
| `@eeennsu/native` | 0.2.0 | DS. 0.x라 정확한 버전으로 고정한다 |
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

- pnpm 10은 없는 peer를 자동 설치한다(auto-install-peers). 그대로 두면 `@expo/metro-config`와 `@expo/metro`·`@expo/config` 등 Expo 패키지 약 40개가 들어온다. `pnpm.packageExtensions`로 이 peer를 선택 peer로 표시해 설치되지 않게 했다
- **CSS 캐시.** Tailwind 결과는 소스 파일의 클래스에 따라 바뀌지만 Metro의 캐시 키는 global.css 내용뿐이다. 그대로 두면 global.css를 고치지 않는 한 새 클래스가 번들(릴리스 포함)에 안 들어간다. 변환기가 CSS 결과에 `skipCache` 표시를 달고, `metro.config.js`의 `CssUncachedFileStore`가 그 결과를 디스크 캐시에 쓰지 않는다. Expo가 같은 문제를 같은 방식(`@expo/metro-config`의 FileStore)으로 푼다
- **남는 제약(개발 중).** 같은 Metro 세션 안에서는 다른 파일에 새 클래스를 더해도 global.css 모듈이 다시 변환되지 않는다. Expo는 Metro 그래프를 고쳐(`patchMetroGraphToSupportUncachedModules`) 매번 다시 변환하는데, 그 패치는 옮기지 않았다. 새 클래스가 안 먹으면 global.css를 저장하거나 Metro를 다시 켠다. 기기에서 불편하면 그 패치를 옮긴다(1.6)

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

### 1.6 기기에서 확인할 것(남은 일)

1. `pnpm android`로 빌드가 되는지. reanimated·worklets·svg가 처음 컴파일된다. Windows에서는 CMake 경로 길이 문제가 다시 날 수 있다(PRD 10장)
2. 시안 화면(4.5)이 뜨는지. 칩으로 홈 · 홈 처음 · 입력 시트 · 입력 시트 펼침 · DS 확인을 오간다
3. 라이트·다크 전환 때 앱 색(2장)과 DS 색이 모두 바뀌는지. 다크에서 고른 칩·저장 버튼의 글자가 거의 검은색인지
4. 칩과 줄을 누르는 동안 표면이 진해지는지(`active:`). DS 0.2.0의 Button은 눌림 표시가 없다(5.2)
5. 숫자가 고정폭(`tabular-nums`)으로 나오는지. 금액이 바뀌어도 자릿수 폭이 흔들리지 않아야 한다
6. 예산 게이지의 오늘 기준선과 테두리, FAB 그림자(`shadow-md`)가 보이는지
7. 글자 크기 1.3배에서 칩 줄 바꿈, 목록, 시트가 깨지지 않는지
8. 상태 바·내비게이션 바 자리. 시안은 안전 영역 라이브러리가 없어 `StatusBar.currentHeight`와 `pb-12`로 근사했다(12장 6번에서 `useSafeAreaInsets`로 바꾼다)
9. Metro를 켠 채 새 클래스를 더했을 때 반영되는지(1.4의 남는 제약)
10. 디버그 번들 크기와 첫 번들 시간. DS 0.2.0은 lucide 아이콘 전체(약 1.7MB)를 번들에 넣는다(5.2)

## 2. 앱 색

DS는 semantic 색 변수의 값만 앱에서 다시 선언하게 연다(DS 스펙 C-5b). spendback은 `global.css`에서 네 변수만 바꾸고 나머지(중립 회색, danger, 표면, 테두리)는 DS base를 쓴다. RN은 `:root`와 `@media (prefers-color-scheme: dark) { :root }` 두 블록이다(DS 알려진 동작 15).

| 변수 | 라이트 | 다크 | 쓰는 곳 |
|---|---|---|---|
| `--bg-brand` | `oklch(50% 0.09 175)` `#107460` | `oklch(74% 0.11 172)` `#55c1a3` | 주 버튼, 고른 칩, 예산 게이지, 수입 금액·"기록" 같은 글자(`text-brand`), 포커스 테두리(`--border-focus`가 따라간다) |
| `--bg-brand-hover` | `oklch(45% 0.08 175)` `#0f6353` | `oklch(80% 0.09 172)` `#7ed1b7` | 눌림(`active:`) |
| `--fg-on-brand` | DS 값(흰색) | `oklch(13% 0.028 261.692)` `#030712` | brand 위 글자 |
| `--fg-on-danger` | DS 값(흰색) | `oklch(13% 0.028 261.692)` `#030712` | danger 버튼 글자 |

**brand를 절제된 청록으로 한 이유.** 이 앱에서 brand는 "예산 안", "수입", "저장"처럼 돈의 괜찮은 상태에 붙는다. DS 기본 파랑(`#155dfc`, 채도 0.245)은 템플릿에서 흔히 보는 색이고 "담백한 분석가"(PRD 4.6) 톤에 비해 강하다. 채도를 0.09로 낮춘 청록은 빨강(초과)과 뜻이 갈리고, 흰 글자와 5.7:1이라 주 버튼과 글자색에 함께 쓸 수 있다.

**다크에서 brand 위 글자를 바꾼 이유.** 다크 brand는 밝아서 흰 글자가 2.2:1이다. DS base 다크도 같은 문제가 있다(흰 글자 on blue-500 3.71:1, on red-500 3.82:1). 앱은 두 글자색을 거의 검은색으로 다시 선언했고, DS에는 0.3.0에서 base 값을 고치자고 제안했다(DS 쪽 기록).

대비(WCAG 2.1, `oklch` → sRGB):

| 조합 | 라이트 | 다크 |
|---|---|---|
| brand 위 brand 글자(주 버튼, 고른 칩) | 5.72 | 9.17 |
| canvas 위 `text-brand` | 5.72 | 9.17 |
| surface-muted 위 `text-brand` | 5.19 | - |
| canvas 위 danger 글자 | 4.91 | 5.27(surface 위 4.65) |
| canvas 위 muted 글자 | 4.84 | 7.73 |
| danger 위 danger 버튼 글자 | 4.91 | 5.27 |
| 게이지 채움 대 트랙(비텍스트, 3:1 기준) | brand 5.19 · danger 4.47 | brand 6.69 · danger 3.84 |
| 채움 위 기준선 | canvas 색 테두리(2px)로 분리. 테두리 대 채움 5.72 | 9.17 |
| 고르지 않은 칩 테두리 대 surface | 1.47 | 1.72 |

고르지 않은 칩의 테두리는 3:1이 안 된다. 칩은 글자로 식별되고(WCAG 1.4.11 예외) 고른 상태는 채움 색(5.72:1 이상)으로 구분되므로 DS Input과 같은 `border-border`를 쓴다.

**색만으로 뜻을 전하지 않는다.** 초과는 빨강 막대와 함께 "18,000원 초과" 문구를 쓴다. 청록과 빨강은 명도가 비슷해 적록 색각에서는 색만으로 구분이 약하다. 게이지는 스크린 리더 값(`accessibilityValue.text`)을 갖는다.

## 3. 기준

### 3.1 App Read와 다이얼

```
APP READ: 1인용 소비 회고 가계부(개인 핀테크 유틸리티) for 개발자 본인, 담백한 분석가 language,
          leaning RN CLI + React Navigation 7 + @eeennsu/native(NativeWind 5).
platforms: Android first-class(Galaxy S24+) · iOS none · web none
posture:   Android-first. 앱 색만 브랜드(C-5b)이고 헤더·탭 바·시트·스위치·날짜 대화상자는 플랫폼 기본
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
| 화면 좌우 여백 | 16(`px-4`), 모든 화면 같다 |
| 섹션 사이 | 32(`gap-8`) |
| 섹션 제목과 내용, 라벨과 칩 묶음 | 8(`gap-2`) |
| 목록 줄 위아래 | 12(`py-3`). 한 줄 텍스트면 48, 두 줄이면 68 |
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

- 숫자는 모두 `tabular-nums`다. 금액은 어디서나 `32,000원`, 비율은 정수 %다(PRD 4.6)
- 가장 큰 글자가 24px이다. 더 큰 표시 스텝은 DS의 5단 스케일(C-7a)을 다시 여는 일이라 만들지 않는다
- 글자 크기는 사용자 설정을 따른다. DS Text에 `maxFontSizeMultiplier`가 없어 크롬 글자도 제한 없이 커진다(1.6의 7번)

### 3.5 모양, 아이콘, 움직임

- 모서리: 입력 칸·버튼 8(DS), 시트 위 모서리 12(`rounded-t-lg`), 칩·FAB·게이지 full
- 그림자는 떠 있는 요소(FAB)만. 시트는 scrim(`bg-overlay`)으로 분리한다
- 아이콘은 Button의 `icon`(DS 0.2.0)과 DS 0.3.0의 `Icon`으로만 쓴다. 이모지와 손으로 그린 SVG는 쓰지 않는다
- 움직임은 화면 전환·시트(네이티브), 누름 표시(`active:`로 표면 한 단계 진하게)뿐이다. 회고 문장은 필드가 완성될 때마다 나타나고 타자 효과는 없다(PRD 4.6)
- 햅틱은 쓰지 않는다. 쓰게 되면 저장 성공에만 가벼운 진동을 준다(6장 후보)

### 3.6 상태

| 상태 | 규칙 |
|---|---|
| 로딩 | 로컬 DB라 목록·홈에 스켈레톤을 두지 않는다. 오래 걸리는 것은 회고 생성(스트리밍 표시와 취소)과 모델 다운로드(진행률)뿐이다 |
| 빈 상태 | 사실 한 줄 + 무엇이 여기에 생기는지 + 채우는 동작(홈 처음 시안). 필터 결과가 비면 "필터 초기화" |
| 오류 | 폼은 입력 칸 아래에, 회고는 PRD 4.6 폴백 표의 안내와 동작으로. `Alert.alert`는 파괴적 확인(삭제, 가져오기 전체 교체, 입력 버리기)에만 쓴다 |
| 오프라인 | 해당 없음(완전 로컬). 모델 다운로드만 네트워크 오류와 재시도를 둔다 |

### 3.7 접근성

- 누름 영역은 48dp 이상이다. 칩은 38 + 세로 hitSlop 5, 목록 줄은 줄 전체다. DS Button sm(30)·md(42)는 모자라며 DS 0.3.0이 hitSlop으로 채운다(5.2)
- 같은 이름의 버튼을 두지 않는다. 홈의 고정비 줄은 "휴대폰 요금 기록, 21일 결제 · 예상 55,000원"처럼 줄마다 이름이 다르다
- 게이지는 `progressbar` 역할과 읽을 값(`accessibilityValue.text`)을 갖는다
- 섹션 제목은 `heading`(스크린 리더의 제목 이동), 접는 영역은 `expanded` 상태를 알린다
- 시트가 떠 있으면 뒤의 화면을 스크린 리더에서 숨긴다(실제 시트는 formSheet가 처리한다)

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
tabs (4): 홈 · 내역 · 회고 · 설정                     ← PRD 5장
RootStack (native-stack)
  Tabs (bottom-tabs)
    Home      홈     헤더 "9월"(진행 중인 달)
    History   내역   헤더 "내역" + 오른쪽 "필터"
    Retro     회고   헤더 "회고"
    Settings  설정   헤더 "설정"
  RetroDetail { kind, periodStart }       push. 탭 바를 덮는다
  Budget { month }                        push ← 설정, 홈 첫 실행 "예산 정하기"
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
- 설정은 탭이다(PRD 5장). 스킬은 설정 탭을 금지한다(tell #25). 7.3에 바꿀 만한지 적었다
- FAB는 기록이 이 앱의 핵심 동작이고 탭이 4개라 둔다. 탭 바 가운데가 아니라 홈 화면의 오른쪽 아래다

### 4.2 홈(시안 있음)

위에서부터 행동이 필요한 것 → 참고할 것 순서다.

1. **남은 예산**: "9월 남은 예산"(sm muted) → 금액(2xl) → 예산 게이지(오늘 기준선) → "788,400원 사용 | 예산 1,200,000원"(sm muted) → 소비 속도 한 줄. 예산이 없으면 "아직 예산이 없어요" + "예산 정하기"
2. **고정비**: 제목 옆 "5개 중 3개 기록", 결제일이 지났는데 기록하지 않은 항목만 줄로. 줄을 누르면 채워진 입력 시트(PRD 4.4). 모두 기록했으면 한 줄로 알린다
3. **카테고리 예산**: 예산을 정한 카테고리만. 이름, "212,300 / 300,000원", 얇은 게이지. 넘으면 danger 글자 "18,000원 초과"와 꽉 찬 danger 막대
4. **최근 지출**: 5줄. 메모(한 줄, 넘치면 말줄임) · "식비 · 오늘" · 금액. 누르면 수정 시트. 제목 옆 "내역 보기"
5. **기록 FAB**: 오른쪽 아래, 확장형(아이콘 + "기록")

소비 속도의 계산식은 PRD 11장 미결이다. 시안은 "남은 예산 ÷ 남은 일수" 후보로 "남은 6일 · 하루 68,600원까지 쓸 수 있어요"라고 그렸고, 식이 정해지면 문구도 정한다.

### 4.3 입력 시트(시안 있음)

PRD 4.1의 3탭(금액 → 카테고리 → 저장)이 기준이다.

1. 손잡이, 제목 "지출 기록"(수입이면 "수입 기록", 수정이면 "지출 수정"), 오른쪽 "닫기"
2. **금액**: 라벨 "금액", 큰 입력 칸(`kind="number"`, 2xl, 고정폭 숫자, 천 단위 쉼표) + "원". 시트가 열리면 이 칸에 포커스가 가고 숫자 키패드가 뜬다
3. **카테고리**: 칩 11개(수입이면 3개), 줄 바꿈. 고른 칩은 brand로 채운다
4. **날짜**: "오늘"(기본) · "어제" · "다른 날"(Android 날짜 대화상자). 다른 날을 고르면 그 칩이 "9월 20일"로 바뀐다
5. **선택 항목 더 보기**(접힘): 누르면 펼쳐지고 오른쪽에 무엇이 들어 있는지 적는다. 구분(지출/수입) · 이유 · 만족도 · 메모(과거 메모 제안 칩, 고르면 전에 쓴 카테고리도 고른다) · 결제수단 · 고정비(스위치, 켜면 고정비 항목 칩)
6. **저장**: 아래 고정, 키보드가 떠도 보인다. 금액과 카테고리가 있어야 눌린다(비활성 상태를 알린다)

- 이유·만족도·결제수단은 고른 칩을 다시 누르면 선택이 풀린다. 필수(카테고리, 날짜, 구분)는 풀리지 않는다
- 수입으로 바꾸면 카테고리 선택이 비고 지출 전용 항목(이유, 만족도, 고정비)이 사라진다
- 수정 모드는 펼친 영역 맨 아래에 "삭제"(danger, 확인 대화상자)를 둔다
- 입력이 있는 채로 닫기·뒤로 가기·아래로 끌기를 하면 버릴지 묻는다

### 4.4 나머지 화면(명세만)

| 화면 | 구조 | 상태 |
|---|---|---|
| 내역 | 위에 이번 기간 합계 한 줄("9월 지출 1,232,400원 · 수입 3,200,000원"), 적용 중인 필터 요약과 "초기화". 날짜별 묶음(끈적한 머리 "9월 24일 목요일 · 23,400원"), 줄은 메모 · 카테고리·결제수단 · 금액(수입은 `+`와 `text-brand`). 고정비 거래는 Badge "고정비" 하나(한 줄에 배지 하나까지). 줄을 누르면 수정 시트 | 첫 실행: "아직 기록이 없어요" + "기록하기". 필터 결과 없음: "조건에 맞는 기록이 없어요" + "필터 초기화" |
| 내역 필터(시트) | 기간(이번 달 · 지난 달 · 직접), 카테고리, 이유 태그, 지출/수입 칩. 아래 "적용" | - |
| 회고 | 위에 주간/월간 칩. 기간 목록(최신 먼저): "9월 3주 · 9.15~9.21" + 한 줄 상태(저장된 회고의 headline 첫 줄 · "아직 만들지 않았어요" · "기록이 부족해요" · 진행 중 Badge) | 기록 전: "한 주가 끝나면 여기에 회고가 생겨요" |
| 회고 상세 | 헤더 기간 이름, 오른쪽 "다시 만들기"(저장본이 있을 때). 총지출 하나를 크게(변동·고정 나눠 한 줄), 직전 대비 한 줄 → 회고 문장(headline xl, insights, 제안) → 카테고리 도넛(상위 5개 + 기타, 가장 큰 카테고리만 brand·나머지는 회색 단계, 조각에 직접 %) + 같은 값의 카테고리 표(차트의 대체 텍스트 역할) → 일별 막대 | 생성 중(필드마다 나타남, "쓰는 중", 취소), 다시 쓰는 중, 폴백 3가지(PRD 4.6 표), 기록 부족, 진행 중(지표·차트만), 월간 고정비 미기록 알림("기록하기" · "그대로 만들기") |
| 설정 | 묶은 목록: 기록(카테고리, 이유 태그) · 예산(월 예산, 값 표시) · 고정비(항목, 개수) · 회고(모델 관리, 사용 중 모델) · 데이터(내보내기, 가져오기). 줄은 push이고 꺾쇠를 단다(DS 0.3.0 Icon). 파괴적 동작(가져오기 전체 교체)은 맨 아래 | 모델이 없으면 모델 관리 줄에 "모델 없음" |
| 모델 관리 | 레지스트리 모델마다 이름·크기·라이선스, 받기/삭제/사용 선택. 받는 중에는 Meter와 퍼센트, Wi-Fi 권장 문구 | 저장 공간 부족, 해시 불일치, 네트워크 오류는 줄 안에 문구와 "다시 받기" |

회고 문장에서 코드가 채운 값(금액·비율·이름)은 `text-brand`와 고정폭 숫자로 강조한다. "숫자는 코드가 쓴다"(PRD 2장)가 화면에서 보이게 하는 장치이고 회고 상세의 대담한 요소다. DS Text는 문자열만 받아(DS 알려진 동작 6) 이 부분은 중첩 RN Text로 앱이 만든다.

차트는 Skia가 JS 색을 받는다. 앱이 재선언한 색은 DS JS 토큰에 닿지 않으므로(DS 알려진 동작 11) 차트 색은 NativeWind의 `useUnstableNativeVariable('--bg-brand')` 같은 런타임 값에서 읽는다. 12장 6번에서 정한다.

### 4.5 시안 위치

UI 구현(PRD 12장 6번) 전까지 앱은 시안 모음을 띄운다. 위 칩으로 화면을 바꾸고, 가짜 데이터로 그리며 DB와 내비게이션은 붙이지 않았다. 6번에서 `src/preview/`를 지운다.

| 파일 | 내용 |
|---|---|
| `src/App.tsx` | 시안 모음 껍데기(칩 전환, 상태 바 근사) |
| `src/preview/HomeMock.tsx` | 홈(채운 상태, 첫 실행) |
| `src/preview/EntrySheetMock.tsx` | 입력 시트(접힘, 펼침). 뒤에 홈과 scrim |
| `src/preview/DsCheckScreen.tsx` | DS 0.2.0 확인 화면(1장) |
| `src/preview/fixtures.ts` | 2026-09-24 기준 가짜 데이터 |
| `src/ui/Chip.tsx` · `src/ui/Meter.tsx` | 5.2의 앱 컴포넌트 |
| `__tests__/design.test.tsx` | 앱 색, Chip, Meter, 두 시안의 동작 |

## 5. 컴포넌트

### 5.1 화면별 DS 컴포넌트

| 화면 | DS 0.2.0 | 앱 컴포넌트 | 플랫폼·라이브러리 |
|---|---|---|---|
| 홈 | Text, Stack, Button(FAB, "내역 보기", "예산 정하기") | Meter, 목록 줄 | ScrollView |
| 입력 시트 | Text, Stack, Label, Input(금액, 메모), Button(저장, 닫기) | Chip | Switch, 날짜 대화상자, formSheet |
| 내역 | Text, Stack, Badge(고정비), Button | 목록 줄, Chip(필터 요약) | SectionList |
| 회고 목록 | Text, Stack, Badge(진행 중) | Chip(주간/월간), 목록 줄 | FlatList |
| 회고 상세 | Text, Stack, Card(폴백 안내), Button | 문장 렌더러(중첩 Text) | victory-native, Skia |
| 설정 | Text, Stack | 목록 줄 | ScrollView |
| 설정 하위(예산, 고정비 편집, 카테고리) | Label, Input, Textarea, Button | Chip | - |
| 모델 관리 | Text, Stack, Button, Badge(사용 중) | Meter(진행률) | - |

### 5.2 DS 0.2.0에 없는 것

| 필요한 것 | 쓰는 곳 | 지금 | 다음 |
|---|---|---|---|
| **Chip**(고르는 칩) | 입력 시트의 모든 선택, 내역 필터, 회고 주간/월간, 시안 전환 | **임시** `src/ui/Chip.tsx`. DS 0.3.0 `Chip`과 API가 같다(`label`, `selected`, `disabled`, `onPress`, `className`) | DS 0.3.0으로 올리고 import만 바꾼다 |
| **Icon**(단독 아이콘) | 탭 바, 설정 줄 꺾쇠, 고정비 상태, 날짜 칩 | 없음. 시안은 글자로 대신했다("기록", "선택 항목 더 보기") | DS 0.3.0 `Icon`과 이름 4개(home, list, chart-pie, calendar) |
| **누름 표시** | DS Button | DS 0.2.0 RN Button은 눌려도 모양이 그대로다. 앱의 Chip과 줄은 `active:`를 쓴다 | DS 0.3.0이 Button에 `active:`를 더한다 |
| **48dp 누름 영역** | Button sm(30)·md(42) | 모자란다 | DS 0.3.0이 RN Button에 세로 hitSlop을 준다 |
| **Meter**(사용률 막대) | 홈 게이지, 카테고리 예산, 모델 다운로드 | 앱 컴포넌트 `src/ui/Meter.tsx`(임시 아님) | DS 계약은 number prop을 금지한다(DS AC-15). 값을 받는 컴포넌트를 DS에 두려면 그 규칙을 먼저 정해야 해 보류했다 |
| 목록 줄 | 홈, 내역, 설정 | 화면 안 조합(`HomeMock`의 `Row`) | 세 화면에서 모양이 굳으면 DS 후보로 본다 |
| 텍스트 줄 수 제한 | 목록의 메모 | RN Text(`react-native-css/components`) + DS 클래스 | `numberOfLines`는 number prop이라 AC-15에 걸린다. 보류 |
| 문장 안 강조 | 회고 문장 | 앱이 중첩 RN Text로 | DS 알려진 동작 6(v1 범위 밖). 보류 |
| 바텀 시트 | 입력, 내역 필터 | React Navigation formSheet | RN 오버레이는 DS v2 범위다 |
| 스위치, 날짜 선택 | 고정비 켜기, 다른 날 | RN Switch, 플랫폼 날짜 대화상자 | 플랫폼 기본을 쓴다 |
| 차트 | 회고 상세 | victory-native(PRD 8장) | DS 대상 아님 |

DS 0.3.0의 내용과 근거는 `../design-system`(스펙 R25, 구현 노트)에 있다. 0.3.0을 npm에 낸 뒤 spendback에서 버전을 올리고 임시 Chip을 바꾼다.

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
| 설정 탭 금지(tell #25), 1인 앱은 헤더 톱니로 설정을 연다(navigation.md 예시 B) | 설정은 4번째 탭(5장) | PRD | **바꿀 만하다.** 설정 안의 기능은 대부분 다른 곳에서 들어간다. 예산은 홈 게이지와 첫 실행 버튼, 고정비는 홈 고정비 줄, 모델 관리는 회고 폴백. 탭을 홈·내역·회고 3개로 줄이고 설정을 홈 헤더 톱니 push로 옮기면 탭이 매일 돌아오는 곳만 남는다. 사용자 판단이 필요해 제안으로 남긴다 |
| 만들고 돌아오는 작업은 모달(결정 트리 3) | 입력은 하단 시트(4.1) | PRD | 필수 항목만 먼저 보여 시트 조건을 맞췄다. 기기에서 펼친 시트의 키보드 동작이 나쁘면 모달로 바꾸는 것을 다시 본다 |
| 목록의 모든 동적 텍스트에 줄 수 제한 | DS Text에 `numberOfLines`가 없음 | 메모만 RN Text로 한 줄 제한, 나머지는 줄 바꿈 | ui-ux-pro-max는 말줄임보다 줄 바꿈을 권한다 |

## 8. 검증

작업 과정을 모르는 검증 에이전트가 격리 worktree에서 이 문서, PRD 4·5장, 바뀐 파일만 받아 mobile-design-review(정적, 보고 전용)와 ui-ux-pro-max `pro-rules.md` 체크리스트로 봤다. 기기 화면이 없어 화면을 봐야 하는 항목은 미검증으로 남긴다.

(검증 결과는 아래에 채운다.)
