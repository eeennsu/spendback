module.exports = {
  preset: '@react-native/jest-preset',
  // spike/는 앱과 독립된 버릴 코드다(PRD 6장). .claude/에는 에이전트 워크트리(저장소 사본)가 생긴다
  modulePathIgnorePatterns: ['<rootDir>/spike/', '<rootDir>/.claude/'],
  // 디자인 시스템(@eeennsu)과 lucide-react-native는 ESM만 배포해 변환 대상에 넣는다(DS 구현 노트 N-14)
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@eeennsu|lucide-react-native)/)',
  ],
  // lucide-react-native는 react-native 조건에서 .mjs를 내준다. 프리셋 변환은 .mjs를 건드리지 않는다
  transform: { '^.+\\.mjs$': 'babel-jest' },
  moduleNameMapper: {
    // react-native 조건이 TS 소스(src/jest)를 가리킨다. 컴포넌트가 쓰는 CJS 빌드와 같은 인스턴스를 쓴다
    '^react-native-css/jest$':
      '<rootDir>/node_modules/react-native-css/dist/commonjs/jest/index.js',
  },
  setupFiles: ['<rootDir>/jest/setup.js'],
};
