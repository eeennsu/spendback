module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // React Compiler 1.0(PRD 8장). 다른 플러그인보다 먼저 돌아야 한다.
    'babel-plugin-react-compiler',
    // drizzle-kit 마이그레이션(.sql)을 문자열로 번들에 넣는다(src/db/migrations/migrations.js)
    ['inline-import', { extensions: ['.sql'] }],
    // zod 4의 ESM 빌드(Metro가 고른다)가 export * as ns 문법을 쓴다
    '@babel/plugin-transform-export-namespace-from',
    // Reanimated 4의 worklet 변환. 마지막에 둔다. NativeWind(react-native-css)가 애니메이션에 쓴다
    'react-native-worklets/plugin',
  ],
};
