import { Text } from '@eeennsu/native';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { View } from 'react-native-css/components';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { runMigrations } from './db';
import { Navigation } from './navigation';
import { useCardSync } from './state/cards';

/**
 * 앱 루트. 마이그레이션을 마치면 화면을 띄운다(로컬 DB라 금방 끝난다). 헤더·탭 바·시트의 색은 DS 클래스가 그리고,
 * React Navigation 테마는 화면 사이로 비치는 바탕만 맡는다
 */
export default function App() {
  const dark = useColorScheme() === 'dark';
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  // 카드 알림 대기열은 마이그레이션이 끝난 뒤에 DB로 옮긴다(PRD 4.9)
  useCardSync(ready);

  useEffect(() => {
    runMigrations().then(
      () => setReady(true),
      e => setError(String(e)),
    );
  }, []);

  return (
    <SafeAreaProvider>
      {/*
        edge-to-edge는 상태 바를 투명하게만 하고 아이콘 색은 테마에 맡긴다. 첫 프레임은 앱 테마(styles.xml)가,
        그 뒤는 여기서 색 구성표에 맞춘다(docs/DESIGN.md 3.5)
      */}
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      {ready ? (
        <Navigation theme={dark ? DarkTheme : DefaultTheme} />
      ) : (
        <View className='flex-1 items-center justify-center bg-canvas px-6'>
          {error !== undefined && <Text tone='danger'>{`기록을 열지 못했어요. ${error}`}</Text>}
        </View>
      )}
    </SafeAreaProvider>
  );
}
