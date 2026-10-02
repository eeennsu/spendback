import { Box, Chip, Text } from '@eeennsu/native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { registerGlobalCss, setColorScheme } from '../jest/css';
import { Meter } from '../src/ui/Meter';

/**
 * DS base 색과 앱 컴포넌트(docs/DESIGN.md 2·5장). 화면은 screens.test.tsx가 본다.
 * 기대값은 DS 0.4.0 base 값이다. 앱은 색을 재선언하지 않는다(docs/DESIGN.md 2장).
 */
const BRAND = '#206fea';
const DANGER = '#e7000b';
const SURFACE_MUTED = '#e5e7eb';

async function mount(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  await registerGlobalCss();
  setColorScheme(scheme);
  await render(ui);
}

function rootStyle() {
  const tree = screen.toJSON();
  if (!tree || Array.isArray(tree)) throw new Error('루트가 하나가 아니다');
  return (tree.props as { style?: Record<string, unknown> }).style ?? {};
}

describe('DS base 색', () => {
  test('brand는 라이트에서 파랑이다', async () => {
    await mount(<Box className='bg-brand'>{null}</Box>);
    expect(rootStyle()).toMatchObject({ backgroundColor: BRAND });
  });

  test('brand는 다크에서도 같은 파랑이다', async () => {
    await mount(<Box className='bg-brand'>{null}</Box>, 'dark');
    expect(rootStyle()).toMatchObject({ backgroundColor: BRAND });
  });

  test('danger는 DS base 빨강이다', async () => {
    await mount(<Box className='bg-danger'>{null}</Box>);
    expect(rootStyle()).toMatchObject({ backgroundColor: DANGER });
  });
});

describe('글자', () => {
  test('DS Text가 Pretendard와 DS 글자 스텝으로 풀린다(DS 0.4.0 native 래퍼)', async () => {
    await mount(<Text size='2xl'>411,600원</Text>);
    expect(screen.getByText('411,600원')).toHaveStyle({
      fontFamily: 'Pretendard',
      fontSize: 28,
      fontWeight: 700,
    });
  });
});

describe('숫자', () => {
  test('tabular-nums가 RN fontVariant로 풀린다(DS native 래퍼의 RN 선언)', async () => {
    await mount(<Text className='tabular-nums'>411,600원</Text>);
    // 문자열로 나오고 RN이 네이티브로 넘길 때 배열로 나눈다(StyleSheet/processFontVariant)
    expect(screen.getByText('411,600원')).toHaveStyle({ fontVariant: 'tabular-nums' });
  });
});

describe('Chip', () => {
  test('고른 칩은 brand 표면이고 선택 상태를 알린다', async () => {
    await mount(<Chip label='식비' selected />);

    const chip = screen.getByRole('button', { name: '식비' });
    expect(chip).toHaveStyle({ backgroundColor: BRAND });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('식비')).toHaveStyle({ color: '#fff' });
  });

  test('누르는 동안 투명도가 내려가고 배경은 그대로다', async () => {
    await mount(<Chip label='식비' selected className='bg-danger' />);

    const chip = screen.getByRole('button', { name: '식비' });
    await fireEvent(chip, 'pressIn');
    expect(screen.getByRole('button', { name: '식비' })).toHaveStyle({
      backgroundColor: DANGER,
      opacity: 0.8,
    });
  });

  test('누름 영역은 세로 hitSlop 5와 최소 폭 48이다', async () => {
    await mount(<Chip label='예' />);

    const chip = screen.getByRole('button', { name: '예' });
    expect(chip.props.hitSlop).toEqual({ top: 5, bottom: 5 });
    expect(chip).toHaveStyle({ minWidth: 48 });
  });

  test('다크에서도 고른 칩의 글자는 흰색이다', async () => {
    await mount(<Chip label='식비' selected />, 'dark');

    expect(screen.getByRole('button', { name: '식비' })).toHaveStyle({
      backgroundColor: BRAND,
    });
    expect(screen.getByText('식비')).toHaveStyle({ color: '#fff' });
  });

  test('고르지 않은 칩은 테두리 대신 surface-muted 채움이다', async () => {
    await mount(<Chip label='배달' />);
    expect(screen.getByRole('button', { name: '배달' })).toHaveStyle({
      backgroundColor: SURFACE_MUTED,
    });
  });
});

describe('Meter', () => {
  test('사용률을 막대 길이와 스크린 리더 값으로 함께 알린다', async () => {
    await mount(<Meter label='9월 예산 사용률' valueText='예산의 66% 사용' ratio={0.66} />);

    const meter = screen.getByRole('progressbar', { name: '9월 예산 사용률' });
    expect(meter.props.accessibilityValue).toEqual({ text: '예산의 66% 사용' });
  });

  test('예산을 넘으면 막대가 danger 색으로 꽉 찬다', async () => {
    await mount(<Meter label='배달' valueText='초과' ratio={1.18} />);

    const [fill] = screen.getByRole('progressbar').children;
    if (typeof fill === 'string') throw new Error('막대가 없다');
    expect(fill).toHaveStyle({ width: '100%', backgroundColor: DANGER });
  });
});
