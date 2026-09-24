import { useState } from 'react';
import { StatusBar } from 'react-native';
import { ScrollView, View } from 'react-native-css/components';

import { DsCheckScreen } from './preview/DsCheckScreen';
import { EntrySheetMock } from './preview/EntrySheetMock';
import { HomeMock } from './preview/HomeMock';
import { Chip } from './ui/Chip';

const PREVIEWS = [
  { key: 'home', label: '홈', render: () => <HomeMock /> },
  { key: 'firstRun', label: '홈 처음', render: () => <HomeMock variant='firstRun' /> },
  { key: 'entry', label: '입력 시트', render: () => <EntrySheetMock /> },
  { key: 'entryMore', label: '입력 시트 펼침', render: () => <EntrySheetMock expanded /> },
  { key: 'ds', label: 'DS 확인', render: () => <DsCheckScreen /> },
] as const;

type PreviewKey = (typeof PREVIEWS)[number]['key'];

// 시안 전용 근사. 안전 영역 라이브러리가 아직 없어(docs/DESIGN.md 6장 후보) 상태 바 높이만 비우고
// 아래는 pb-12로 내비게이션 바 자리를 남긴다. 12장 6번에서 useSafeAreaInsets로 바꾼다.
const statusBarInset = { paddingTop: StatusBar.currentHeight ?? 0 };

/**
 * UI(12장 6번) 전까지 띄우는 디자인 시안 모음. 위의 칩으로 화면을 바꾼다.
 * 가짜 데이터로 그리며 DB와 내비게이션은 붙이지 않는다(docs/DESIGN.md 4장).
 */
export default function App() {
  const [current, setCurrent] = useState<PreviewKey>('home');
  const preview = PREVIEWS.find(item => item.key === current) ?? PREVIEWS[0];

  return (
    <View className='flex-1 bg-canvas pb-12' style={statusBarInset}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className='grow-0 border-b border-border'
        contentContainerClassName='gap-2 px-4 py-3'
      >
        {PREVIEWS.map(item => (
          <Chip
            key={item.key}
            label={item.label}
            selected={item.key === current}
            onPress={() => setCurrent(item.key)}
          />
        ))}
      </ScrollView>
      <View className='flex-1'>{preview.render()}</View>
    </View>
  );
}
