import { type ReactNode, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { KeyboardAvoidingView, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 키보드가 떠 있는지. 떠 있으면 내비게이션 바 자리는 키보드 아래라 비우지 않는다 */
export function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * 입력 칸이 있는 스택 화면의 바탕(docs/DESIGN.md 4.4). edge-to-edge라 키보드가 떠도 창이 줄지 않아 아래 입력 칸과
 * 저장 버튼이 키보드에 가렸다(에뮬레이터 확인). KeyboardAvoidingView는 부모 안의 위치(onLayout)로 키보드와 겹친 만큼을
 * 재는데, native-stack은 헤더와 화면 내용을 같은 부모에 두어 그 위치에 헤더 높이가 이미 들어 있다. offset을 주면 헤더
 * 높이만큼 더 올라간다(에뮬레이터). 키보드가 없을 때는 제스처 막대 자리를 비운다
 */
export function FormFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const bottom = useKeyboardShown() ? 0 : insets.bottom;
  return (
    <KeyboardAvoidingView behavior='padding' className='flex-1 bg-canvas'>
      <View className='flex-1' style={{ paddingBottom: bottom }}>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}
