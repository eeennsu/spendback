import { Badge, Box, Card, Label, Textarea } from '@eeennsu/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { registerGlobalCss, setColorScheme } from '../jest/css';
import { DsCheckScreen } from '../src/preview/DsCheckScreen';

/**
 * 디자인 시스템(@eeennsu/native) 연동 확인. className이 jest에서도 스타일로 풀려야 한다.
 * DS 컴포넌트가 react-native-css/components에서 import하기 때문이다(DS 구현 노트 F-11).
 * 기대값은 앱이 global.css에서 다시 선언한 토스풍 색이다(DS 스펙 C-5b, exp/toss-look).
 */
const BRAND = '#206fea';
const FG_LIGHT = '#191f28';
const SURFACE_LIGHT = '#fff';
const SURFACE_DARK = '#1e1e24';
const SURFACE_MUTED_LIGHT = '#f2f4f6';
const ON_BRAND = '#fff';

async function mount(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  await registerGlobalCss();
  setColorScheme(scheme);
  await render(ui);
}

/** 렌더 트리 루트의 style. 컴포넌트 하나를 마운트했을 때만 쓴다. */
function rootStyle() {
  const tree = screen.toJSON();
  if (!tree || Array.isArray(tree)) throw new Error('루트가 하나가 아니다');
  return (tree.props as { style?: Record<string, unknown> }).style ?? {};
}

test('Box의 className이 스타일로 풀린다', async () => {
  await mount(<Box className='bg-brand p-8'>{null}</Box>);

  expect(rootStyle()).toMatchObject({ backgroundColor: BRAND, padding: 32 });
});

test('Badge는 표면과 글자에 variant 색을 나눠 준다', async () => {
  await mount(<Badge variant='primary'>고정비</Badge>);

  expect(rootStyle()).toMatchObject({ backgroundColor: BRAND, borderRadius: 9999 });
  expect(screen.getByText('고정비')).toHaveStyle({ color: ON_BRAND, fontSize: 14 });
});

test('Label과 Textarea가 accessibilityLabelledBy로 이어진다', async () => {
  await mount(
    <>
      <Label htmlFor='memo'>메모</Label>
      <Textarea id='memo' label='메모 입력' />
    </>,
  );

  const label = screen.getByText('메모');
  expect(label.props.nativeID).toBe('memo-label');
  expect(label).toHaveStyle({ color: FG_LIGHT, fontSize: 14, lineHeight: 20 });

  const textarea = screen.getByLabelText('메모');
  expect(textarea.props.accessibilityLabelledBy).toBe('memo-label');
  expect(textarea.props.multiline).toBe(true);
  expect(textarea.props.numberOfLines).toBe(5);
  expect(textarea).toHaveStyle({ backgroundColor: SURFACE_LIGHT, fontSize: 16 });
});

test('다크 모드는 OS 색 구성표를 따른다', async () => {
  await mount(<Card>{null}</Card>, 'dark');
  expect(rootStyle()).toMatchObject({ backgroundColor: SURFACE_DARK });

  await mount(<Box className='bg-brand'>{null}</Box>, 'dark');
  expect(rootStyle()).toMatchObject({ backgroundColor: BRAND });
});

test('확인 화면이 DS 컴포넌트로 그려지고 누름에 반응한다', async () => {
  await mount(<DsCheckScreen />);

  const save = screen.getByRole('button', { name: '저장 0회' });
  expect(save).toHaveStyle({ backgroundColor: BRAND });
  expect(screen.getByRole('button', { name: '취소' })).toHaveStyle({
    backgroundColor: SURFACE_MUTED_LIGHT,
  });

  await fireEvent.press(save);
  expect(screen.getByRole('button', { name: '저장 1회' })).toBeOnTheScreen();
});
