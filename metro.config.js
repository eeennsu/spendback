const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// spike/는 자체 node_modules를 가진 별도 RN 앱이라 번들에서 뺀다(PRD 6장)
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spikeDir = escapeRegExp(path.resolve(__dirname, 'spike'));

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [new RegExp(`^${spikeDir}[\\\\/]`)],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
