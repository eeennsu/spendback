const os = require('os');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { FileStore } = require('metro-cache');
const { withNativewind } = require('nativewind/metro');

// spike/는 자체 node_modules를 가진 별도 RN 앱이라 번들에서 뺀다(PRD 6장)
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spikeDir = escapeRegExp(path.resolve(__dirname, 'spike'));

// CSS 변환 결과는 디스크 캐시에 쓰지 않는다. 쓰면 global.css를 고치지 않는 한 새 클래스가
// 번들(릴리스 포함)에 들어가지 않는다. @expo/metro-config의 FileStore와 같은 방식이다.
class CssUncachedFileStore extends FileStore {
  set(key, value) {
    return value?.output?.[0]?.data?.css?.skipCache ? Promise.resolve() : super.set(key, value);
  }
}

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [new RegExp(`^${spikeDir}[\\\\/]`)],
    // drizzle-kit 마이그레이션. 내용은 babel inline-import가 넣고, Metro는 .sql을 소스로 알아야 바뀐 것을 본다
    sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'sql'],
  },
  cacheStores: [new CssUncachedFileStore({ root: path.join(os.tmpdir(), 'metro-cache') })],
};

module.exports = {
  ...withNativewind(mergeConfig(getDefaultConfig(__dirname), config)),
  // react-native-css의 변환기는 @expo/metro-config에 기댄다. Expo 없이 같은 일을 하는 변환기로 바꾼다
  transformerPath: require.resolve('./metro.transformer.js'),
};
