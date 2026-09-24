module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // React Compiler 1.0(PRD 8장). 다른 플러그인보다 먼저 돌아야 한다.
  plugins: ['babel-plugin-react-compiler'],
};
