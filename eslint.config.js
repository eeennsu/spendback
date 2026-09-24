const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const reactNativePlugin = require('eslint-plugin-react-native');

// ../expo-plate의 flat config를 따른다(PRD 8장).
module.exports = [
  {
    // spike/는 앱과 독립된 버릴 코드라 검사하지 않는다(PRD 6장). .claude/에는 에이전트 워크트리(저장소 사본)가 생긴다
    ignores: ['node_modules/**', 'android/**', 'coverage/**', 'spike/**', '.claude/**', '**/*.js'],
  },

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-native': reactNativePlugin,
      'prettier': prettierPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // 타입은 TypeScript가 검사하므로 no-undef는 끈다(typescript-eslint 권장)
      'no-undef': 'off',

      // TypeScript
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // React
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // React Hooks(React Compiler 규칙 포함)
      ...reactHooksPlugin.configs.recommended.rules,

      // React Native
      'react-native/no-unused-styles': 'error',
      'react-native/split-platform-components': 'error',
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'error',
      'react-native/no-single-element-style-arrays': 'error',

      // General
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Prettier
      'prettier/prettier': 'error',
    },
  },

  // Prettier와 겹치는 규칙을 끈다(반드시 마지막)
  prettierConfig,
];
