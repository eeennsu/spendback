const worker = require('metro-transform-worker');
const postcss = require('postcss');
const tailwindcss = require('@tailwindcss/postcss');
const { compile } = require('react-native-css/compiler');

/**
 * react-native-css 3.0.7의 Metro 변환기(react-native-css/metro)를 Expo 없이 옮긴 것이다.
 * 원본은 JS와 CSS를 @expo/metro-config의 변환 워커에 맡기는데, 그 워커는 Metro 0.84를 고정해
 * RN 0.87의 Metro 0.87과 버전이 갈린다. 여기서는 JS는 Metro 기본 워커가, CSS는 Tailwind(PostCSS)가
 * 처리하고, 결과 CSS를 react-native-css 컴파일러로 RN 스타일로 바꿔 주입한다(docs/DESIGN.md 1장).
 */
async function transform(config, projectRoot, filename, data, options) {
  if (options.type === 'asset' || !filename.endsWith('.css')) {
    return worker.transform(config, projectRoot, filename, data, options);
  }

  const { css } = await postcss([tailwindcss({ base: projectRoot })]).process(
    data.toString('utf8'),
    { from: filename },
  );
  const stylesheet = compile(css, {
    ...config.reactNativeCSS,
    filename,
    projectRoot,
  }).stylesheet();

  const code = [
    "import { StyleCollection } from 'react-native-css/native-internal';",
    `StyleCollection.inject(${JSON.stringify(stylesheet)});`,
    'export {};',
  ].join('\n');

  const result = await worker.transform(
    config,
    projectRoot,
    `${filename}.js`,
    Buffer.from(code),
    options,
  );
  // Tailwind 결과는 앱 소스의 클래스에 따라 바뀌는데 캐시 키는 global.css 내용뿐이다.
  // metro.config.js의 캐시 저장소가 이 표시를 보고 디스크에 쓰지 않는다.
  result.output[0].data.css = { skipCache: true, code: '' };
  return result;
}

module.exports = { transform, getCacheKey: worker.getCacheKey };
