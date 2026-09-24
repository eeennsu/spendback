module.exports = {
  preset: '@react-native/jest-preset',
  // spike/는 앱과 독립된 버릴 코드다(PRD 6장)
  modulePathIgnorePatterns: ['<rootDir>/spike/'],
};
