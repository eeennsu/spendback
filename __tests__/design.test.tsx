import { Box, Text } from '@eeennsu/native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { registerGlobalCss, setColorScheme } from '../jest/css';
import { EntrySheetMock } from '../src/preview/EntrySheetMock';
import { HomeMock } from '../src/preview/HomeMock';
import { Chip } from '../src/ui/Chip';
import { Meter } from '../src/ui/Meter';

/**
 * 앱 색(global.css의 C-5b 재선언)과 시안 화면(docs/DESIGN.md 2·4장).
 * 기대값은 global.css의 oklch 값을 sRGB로 바꾼 것이다.
 */
const BRAND_LIGHT = '#107460';
const BRAND_DARK = '#55c1a3';
const ON_BRAND_DARK = '#030712';
const DANGER_LIGHT = '#e7000b';
const SURFACE_LIGHT = '#fff';

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

describe('앱 색(C-5b)', () => {
  test('brand는 라이트에서 청록이다', async () => {
    await mount(<Box className='bg-brand'>{null}</Box>);
    expect(rootStyle()).toMatchObject({ backgroundColor: BRAND_LIGHT });
  });

  test('brand는 다크에서 밝은 청록이다', async () => {
    await mount(<Box className='bg-brand'>{null}</Box>, 'dark');
    expect(rootStyle()).toMatchObject({ backgroundColor: BRAND_DARK });
  });

  test('다시 선언하지 않은 danger는 DS 값 그대로다', async () => {
    await mount(<Box className='bg-danger'>{null}</Box>);
    expect(rootStyle()).toMatchObject({ backgroundColor: DANGER_LIGHT });
  });
});

describe('숫자', () => {
  test('tabular-nums가 RN fontVariant로 풀린다(global.css의 임시 선언)', async () => {
    await mount(<Text className='tabular-nums'>411,600원</Text>);
    // 문자열로 나오고 RN이 네이티브로 넘길 때 배열로 나눈다(StyleSheet/processFontVariant)
    expect(screen.getByText('411,600원')).toHaveStyle({ fontVariant: 'tabular-nums' });
  });
});

describe('Chip(임시)', () => {
  test('고른 칩은 brand 표면이고 선택 상태를 알린다', async () => {
    await mount(<Chip label='식비' selected />);

    const chip = screen.getByRole('button', { name: '식비' });
    expect(chip).toHaveStyle({ backgroundColor: BRAND_LIGHT });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('식비')).toHaveStyle({ color: '#fff' });
  });

  test('누르는 동안 투명도가 내려가고 배경은 그대로다(DS 0.3.0과 같은 눌림 표시)', async () => {
    await mount(<Chip label='식비' selected className='bg-danger' />);

    const chip = screen.getByRole('button', { name: '식비' });
    await fireEvent(chip, 'pressIn');
    expect(screen.getByRole('button', { name: '식비' })).toHaveStyle({
      backgroundColor: DANGER_LIGHT,
      opacity: 0.8,
    });
  });

  test('누름 영역은 세로 hitSlop 5와 최소 폭 48이다', async () => {
    await mount(<Chip label='예' />);

    const chip = screen.getByRole('button', { name: '예' });
    expect(chip.props.hitSlop).toEqual({ top: 5, bottom: 5 });
    expect(chip).toHaveStyle({ minWidth: 48 });
  });

  test('다크에서 고른 칩의 글자는 거의 검은색이다', async () => {
    await mount(<Chip label='식비' selected />, 'dark');

    expect(screen.getByRole('button', { name: '식비' })).toHaveStyle({
      backgroundColor: BRAND_DARK,
    });
    expect(screen.getByText('식비')).toHaveStyle({ color: ON_BRAND_DARK });
  });

  test('고르지 않은 칩은 surface 표면이다', async () => {
    await mount(<Chip label='배달' />);
    expect(screen.getByRole('button', { name: '배달' })).toHaveStyle({
      backgroundColor: SURFACE_LIGHT,
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
    expect(fill).toHaveStyle({ width: '100%', backgroundColor: DANGER_LIGHT });
  });
});

describe('홈 시안', () => {
  test('남은 예산, 미기록 고정비, 초과한 카테고리, 기록 버튼을 보여 준다', async () => {
    await mount(<HomeMock />);

    expect(screen.getByText('411,600원')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '9월 예산 사용률' })).toBeOnTheScreen();
    expect(screen.getByText('휴대폰 요금')).toBeOnTheScreen();
    expect(screen.getByText('118,000 / 100,000원 · 18,000원 초과')).toHaveStyle({
      color: DANGER_LIGHT,
    });
    expect(screen.getByRole('button', { name: '기록' })).toHaveStyle({
      backgroundColor: BRAND_LIGHT,
    });
    // 같은 이름의 버튼이 여럿이면 스크린 리더 사용자가 구분하지 못한다
    expect(screen.getByRole('button', { name: /^휴대폰 요금 기록/ })).toBeOnTheScreen();
  });

  test('총예산을 넘으면 금액을 초과액으로 바꾸고 danger로 쓴다', async () => {
    await mount(<HomeMock variant='over' />);

    expect(screen.getByText('9월 예산')).toBeOnTheScreen();
    expect(screen.getByText('18,000원 초과')).toHaveStyle({ color: DANGER_LIGHT });
    expect(
      screen.getByRole('progressbar', { name: '9월 예산 사용률' }).props.accessibilityValue,
    ).toEqual({ text: '예산을 18,000원 넘었어요, 기간의 80% 지남' });
    expect(screen.queryByText(/하루 .*원까지/)).toBeNull();
  });

  test('첫 실행에는 예산을 정하라는 안내와 동작이 있다', async () => {
    await mount(<HomeMock variant='firstRun' />);

    expect(screen.getByText('아직 예산이 없어요')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '예산 정하기' })).toBeOnTheScreen();
  });
});

describe('입력 시트 시안', () => {
  test('결제수단은 미리 고르지 않는다(PRD 4.1)', async () => {
    await mount(<EntrySheetMock expanded />);

    for (const method of ['카드', '현금', '계좌이체']) {
      expect(screen.getByRole('button', { name: method }).props.accessibilityState).toMatchObject({
        selected: false,
      });
    }
  });

  test('금액과 카테고리가 있어야 저장할 수 있다', async () => {
    await mount(<EntrySheetMock />);

    const save = () => screen.getByRole('button', { name: '저장' });
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });

    await fireEvent.changeText(screen.getByLabelText('금액'), '');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    // 저장이 왜 안 되는지 글로 알린다
    expect(screen.getByText('금액을 입력해 주세요')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('금액'), '12900');
    expect(screen.getByLabelText('금액').props.value).toBe('12,900');
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
  });

  test('선택 항목은 접혀 있다가 펼치면 보인다', async () => {
    await mount(<EntrySheetMock />);

    expect(screen.queryByText('만족도')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /선택 항목 더 보기/ }));
    expect(screen.getByText('만족도')).toBeOnTheScreen();
  });

  test('수입으로 바꾸면 수입 카테고리만 남고 지출 전용 항목이 사라진다', async () => {
    await mount(<EntrySheetMock expanded />);

    await fireEvent.press(screen.getByRole('button', { name: '수입' }));

    expect(screen.getByText('수입 기록')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '급여' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '배달' })).toBeNull();
    expect(screen.getByText('카테고리를 골라 주세요')).toBeOnTheScreen();
    expect(screen.queryByText('만족도')).toBeNull();
    // 카테고리를 다시 골라야 저장할 수 있다
    expect(screen.getByRole('button', { name: '저장' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  test('선택 칩은 다시 누르면 선택이 풀리고, 필수 칩은 풀리지 않는다', async () => {
    await mount(<EntrySheetMock expanded />);

    const regret = () => screen.getByRole('button', { name: '후회' });
    await fireEvent.press(regret());
    expect(regret().props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(regret());
    expect(regret().props.accessibilityState).toMatchObject({ selected: false });

    const food = () =>
      within(screen.getByText('카테고리').parent!.parent!).getByRole('button', {
        name: '식비',
      });
    await fireEvent.press(food());
    expect(food().props.accessibilityState).toMatchObject({ selected: true });
  });

  test('고정비를 켜면 연결할 항목 칩이 나오고, 줄 전체가 스위치다', async () => {
    await mount(<EntrySheetMock expanded />);

    expect(screen.queryByText('연결할 고정비 항목')).toBeNull();
    const row = screen.getByRole('switch', { name: '고정비' });
    await fireEvent.press(row);
    expect(screen.getByRole('switch', { name: '고정비' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByText('연결할 고정비 항목')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '휴대폰 요금' })).toBeOnTheScreen();
  });

  test('저장이 안 되는 이유는 live region에 있고, 입력 칸에는 placeholder가 없다', async () => {
    await mount(<EntrySheetMock />);

    await fireEvent.changeText(screen.getByLabelText('금액'), '');
    // 이유 글자를 감싼 조상 중 live region을 찾는다
    let node: { props: Record<string, unknown>; parent: unknown } | null =
      screen.getByText('금액을 입력해 주세요');
    while (node && node.props.accessibilityLiveRegion === undefined) {
      node = node.parent as typeof node;
    }
    expect(node?.props.accessibilityLiveRegion).toBe('polite');
    // DS 0.2.0 Input의 placeholder는 플랫폼 기본색이라 대비가 모자라다(docs/DESIGN.md 5.2)
    expect(screen.getByLabelText('금액').props.placeholder).toBeUndefined();
  });
});
