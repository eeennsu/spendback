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
jest.mock('@op-engineering/op-sqlite', () => ({ open: jest.fn() }));
