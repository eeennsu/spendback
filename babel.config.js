module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // React Compiler 1.0(PRD 8장). 다른 플러그인보다 먼저 돌아야 한다.
    'babel-plugin-react-compiler',
    // Reanimated 4의 worklet 변환. 마지막에 둔다. NativeWind(react-native-css)가 애니메이션에 쓴다
    'react-native-worklets/plugin',
  ],
};
