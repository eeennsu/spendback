import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { type StaticParamList, createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { BackupScreen } from './screens/BackupScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { CardsScreen } from './screens/CardsScreen';
import { CategoriesScreen } from './screens/CategoriesScreen';
import { EntrySheet } from './screens/EntrySheet';
import { FixedCostEditScreen } from './screens/FixedCostEditScreen';
import { FixedCostsScreen } from './screens/FixedCostsScreen';
import { HistoryFilterSheet } from './screens/HistoryFilterSheet';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ModelsScreen } from './screens/ModelsScreen';
import { RetroDetailScreen } from './screens/RetroDetailScreen';
import { RetroListScreen } from './screens/RetroListScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StackHeader, TabBar, TabHeader } from './ui/chrome';

/**
 * 화면 구조(docs/DESIGN.md 4.1 Nav Read). 탭은 홈·내역·회고 3개이고, 탭에서 들어가는 하위 화면은 모두 루트 스택에
 * 두어 탭 바를 덮는다. 입력과 내역 필터는 바텀 시트다(투명 모달 + src/ui/sheet.tsx)
 */
const Tabs = createBottomTabNavigator({
  tabBar: props => <TabBar {...props} />,
  screenOptions: { header: props => <TabHeader {...props} /> },
  screens: {
    // 홈 헤더 제목은 진행 중인 달("9월")이라 탭 이름은 따로 둔다
    Home: { screen: HomeScreen, options: { title: '홈', tabBarLabel: '홈' } },
    History: { screen: HistoryScreen, options: { title: '내역', tabBarLabel: '내역' } },
    Retro: { screen: RetroListScreen, options: { title: '회고', tabBarLabel: '회고' } },
  },
});

const RootStack = createNativeStackNavigator({
  screenOptions: {
    header: props => <StackHeader {...props} />,
    contentStyle: { backgroundColor: 'transparent' },
  },
  screens: {
    Tabs: { screen: Tabs, options: { headerShown: false } },
    Settings: { screen: SettingsScreen, options: { title: '설정' } },
    RetroDetail: { screen: RetroDetailScreen, options: { title: '회고' } },
    Budget: { screen: BudgetScreen, options: { title: '예산' } },
    FixedCosts: { screen: FixedCostsScreen, options: { title: '고정비' } },
    FixedCostEdit: { screen: FixedCostEditScreen, options: { title: '고정비 항목' } },
    Categories: { screen: CategoriesScreen, options: { title: '카테고리' } },
    ReasonTags: { screen: CategoriesScreen, options: { title: '이유 태그' } },
    Models: { screen: ModelsScreen, options: { title: '모델 관리' } },
    Backup: { screen: BackupScreen, options: { title: '백업' } },
    Cards: { screen: CardsScreen, options: { title: '카드 알림' } },
  },
  groups: {
    Sheets: {
      // 시트는 투명 모달 위에 앱이 그린다(src/ui/sheet.tsx). formSheet는 키보드에 맞춰 시트를 옮기는 위치를
      // JS가 잴 수 없었다(docs/DESIGN.md 4.3)
      screenOptions: {
        presentation: 'transparentModal',
        animation: 'fade',
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      },
      screens: {
        Entry: { screen: EntrySheet },
        HistoryFilter: { screen: HistoryFilterSheet },
      },
    },
  },
});

export const Navigation = createStaticNavigation(RootStack);

type RootStackParamList = StaticParamList<typeof RootStack>;

// useNavigation()이 화면 이름과 params를 알게 하는 React Navigation의 전역 타입 선언 방식이다
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
