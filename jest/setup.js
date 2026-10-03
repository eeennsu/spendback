// RN 테스트 환경에는 NativeAppearance 네이티브 모듈이 없어 Appearance.setColorScheme이 아무 일도
// 하지 않는다. 다크 모드 스타일을 테스트하려고 최소한으로 모킹한다(DS 구현 노트 N-9).
// jest.mock 팩토리는 mock 접두어 변수만 참조할 수 있다.
const mockAppearance = { colorScheme: null };

jest.mock('react-native/Libraries/Utilities/NativeAppearance', () => ({
  __esModule: true,
  default: {
    getColorScheme: () => mockAppearance.colorScheme,
    setColorScheme: scheme => {
      mockAppearance.colorScheme = scheme === 'unspecified' ? null : scheme;
    },
    addListener: () => {},
    removeListeners: () => {},
  },
}));

// op-sqlite는 불러올 때 네이티브 모듈 상수를 읽는다. DB를 여는 테스트는 없어 open만 둔다(src/db/index.ts는 처음 쿼리할 때 연다)
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(),
  ANDROID_FILES_PATH: '/files',
}));

// llama.rn도 불러올 때 네이티브 모듈을 찾는다. 모델을 올리는 테스트는 저마다 모킹한다(__tests__/llama.test.ts)
jest.mock('llama.rn', () => ({ initLlama: jest.fn() }));

// 앱 전용 Turbo Native Module(src/native/NativeSpendbackFiles.ts). 테스트가 저마다 동작을 바꾼다
jest.mock('../src/native/NativeSpendbackFiles', () => ({
  __esModule: true,
  default: {
    getFilesDir: () => '/files',
    getCacheDir: () => '/cache',
    getFreeBytes: () => 64 * 1024 ** 3,
    fileSize: jest.fn(() => -1),
    deleteFile: jest.fn(() => true),
    download: jest.fn(async () => {}),
    cancelDownload: jest.fn(),
    writeTextFile: jest.fn(async () => {}),
    readTextFile: jest.fn(async () => ''),
    shareFile: jest.fn(async () => {}),
    pickTextFile: jest.fn(async () => null),
    onDownloadProgress: jest.fn(() => ({ remove: () => {} })),
  },
}));

// 카드 알림 받기(src/native/NativeSpendbackCards.ts). 대기열은 비어 있고 알림 접근은 꺼져 있다
jest.mock('../src/native/NativeSpendbackCards', () => ({
  __esModule: true,
  default: {
    isListenerEnabled: jest.fn(() => false),
    openListenerSettings: jest.fn(),
    setWatchedApps: jest.fn(),
    readInbox: jest.fn(async () => []),
    ackInbox: jest.fn(async () => {}),
    onQueued: jest.fn(() => ({ remove: () => {} })),
  },
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// 날짜 대화상자는 네이티브다. 열렸는지만 본다
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));
