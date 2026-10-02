import { Button, Stack, Text, cn } from '@eeennsu/native';
import { type ReactElement, useEffect, useEffectEvent, useState } from 'react';
import { Animated, PanResponder, StyleSheet } from 'react-native';
import { KeyboardAvoidingView, Pressable, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardShown } from './keyboard';

/** 이만큼(dp) 끌거나 빠르게 내리면 닫는다 */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 1;
/** 닫히면 화면이 사라지는 동안(투명 모달 fade) 시트를 제자리로 되돌리지 않는다. 닫기를 막았으면 그 뒤에 돌아온다 */
const RETURN_DELAY = 400;

/**
 * 바텀 시트(docs/DESIGN.md 4.1, 4.3). 화면은 투명 모달로 띄우고 시트는 앱이 그린다. React Navigation의 formSheet는
 * 키보드가 뜨면 네이티브가 시트를 위로 옮기는데 JS의 measureInWindow가 그 이동을 몰라(에뮬레이터에서 74dp인 시트
 * 위쪽을 194dp로 잼) 저장 버튼을 키보드 위에 맞출 수 없었다. 모달은 창 전체라 KeyboardAvoidingView가 그대로 맞는다.
 * 펼치면(expanded) 위로 커지고, 넘치는 만큼 가운데 스크롤이 줄어 제목과 아래 버튼이 늘 보인다.
 * 손잡이와 제목 줄을 아래로 끌면 닫는다. 닫기는 onClose 하나로 모여 입력이 있으면 화면이 버릴지 묻는다
 */
export function Sheet({
  title,
  onClose,
  expanded = false,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  expanded?: boolean;
  footer: ReactElement;
  children: ReactElement;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();

  // 제스처는 한 번 만든다. 끌어서 닫으면 요청 수를 올리고, 효과가 마지막으로 받은 onClose를 부른다
  const [closeRequests, setCloseRequests] = useState(0);
  const requestClose = useEffectEvent(() => onClose());
  useEffect(() => {
    if (closeRequests > 0) requestClose();
  }, [closeRequests]);
  const [drag] = useState(() => new Animated.Value(0));
  const [pan] = useState(() => {
    const settle = (delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }),
      ]).start();
    return PanResponder.create({
      // 아래로 끄는 움직임만 받는다. 누르기는 "닫기" 버튼이 그대로 받는다
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
          setCloseRequests(n => n + 1);
          settle(RETURN_DELAY);
        } else settle(0);
      },
      onPanResponderTerminate: () => settle(0),
    });
  });

  const bottom = keyboard ? 0 : insets.bottom;
  return (
    <KeyboardAvoidingView behavior='padding' className='flex-1'>
      {/* scrim. 스크린 리더는 시트 안의 "닫기"를 쓴다 */}
      <Pressable
        onPress={onClose}
        accessible={false}
        importantForAccessibility='no'
        className='absolute inset-0 bg-overlay'
      />
      {/* 시트 위로 부모 화면이 48만큼 보이게 남긴다. 그 틈을 누르면 scrim이 받는다 */}
      <Animated.View
        pointerEvents='box-none'
        style={[styles.frame, { paddingTop: insets.top + 48, transform: [{ translateY: drag }] }]}
      >
        <View
          accessibilityViewIsModal
          // 다크에서는 시트(zinc-900)와 scrim 아래 배경의 대비가 낮아 테두리로 경계를 긋는다(DESIGN.md 8.1)
          className={cn(
            'rounded-t-xl bg-surface pt-2 dark:border dark:border-border',
            expanded ? 'flex-1' : 'max-h-full',
          )}
        >
          <View {...pan.panHandlers}>
            <View className='h-1 w-12 self-center rounded-full bg-border' />
            <Stack
              direction='row'
              align='center'
              justify='between'
              className='gap-3 px-6 pb-2 pt-3'
            >
              <Text heading='1' size='xl' className='flex-1'>
                {title}
              </Text>
              <Button label='닫기' icon='x' variant='ghost' size='sm' onPress={onClose} />
            </Stack>
          </View>
          {children}
          <View style={{ paddingBottom: bottom }}>{footer}</View>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

// Animated.View는 className을 받지 않아 스타일 객체로 둔다
const styles = StyleSheet.create({ frame: { flex: 1, justifyContent: 'flex-end' } });
