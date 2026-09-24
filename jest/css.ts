// 테스트 도우미라 Node API(fs, path)를 쓴다
/// <reference types="node" />
import tailwindcss from '@tailwindcss/postcss';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { Appearance, DeviceEventEmitter } from 'react-native';
import { registerCSS } from 'react-native-css/jest';

const root = path.resolve(__dirname, '..');
const globalCss = path.join(root, 'global.css');

let compiled: Promise<string> | undefined;

/**
 * global.css를 Metro 변환기(metro.transformer.js)와 같은 조건으로 컴파일해 등록한다.
 * Tailwind는 앱 루트를 기준으로 소스의 클래스를 찾는다.
 */
export async function registerGlobalCss(): Promise<void> {
  compiled ??= postcss([tailwindcss({ base: root })])
    .process(readFileSync(globalCss, 'utf8'), { from: globalCss })
    .then(result => result.css);
  registerCSS(await compiled);
}

/** 기기가 보내는 appearanceChanged 이벤트를 흉내 낸다(jest/setup.js의 모킹과 짝) */
export function setColorScheme(scheme: 'light' | 'dark'): void {
  Appearance.setColorScheme(scheme);
  DeviceEventEmitter.emit('appearanceChanged', { colorScheme: scheme });
}
