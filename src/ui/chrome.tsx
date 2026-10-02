import { Icon, Text, cn } from '@eeennsu/native';
import type { BottomTabBarProps, BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * 헤더와 탭 바(docs/DESIGN.md 4.1). React Navigation 기본 헤더는 색을 JS 값으로 받아, DS의 CSS 색을 쓰려면 앱이
 * 색을 한 벌 더 들고 있어야 한다(DESIGN.md 2장). 그래서 같은 자리를 DS 클래스로 그린다. 화면 전환과 시트는 네이티브다
 */

/** 헤더 오른쪽 아이콘 버튼. DS에 아이콘만 있는 Button이 없어(DS 알려진 동작 9) Pressable과 Icon으로 만든다 */
export function HeaderIcon({
  icon,
  label,
  onPress,
}: {
  icon: 'settings' | 'plus' | 'trash';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      className='h-12 w-12 items-center justify-center rounded-full active:bg-surface-hover'
    >
      <Icon name={icon} />
    </Pressable>
  );
}

/** 헤더 오른쪽 글자 버튼("필터", "다시 만들기") */
export function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole='button'
      onPress={onPress}
      className='min-h-12 min-w-12 items-center justify-center rounded-md px-3 active:bg-surface-hover'
    >
      <Text className='text-fg-brand'>{label}</Text>
    </Pressable>
  );
}

function Bar({ back, title, right }: { back?: () => void; title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className='bg-canvas' style={{ paddingTop: insets.top }}>
      <View className={cn('h-14 flex-row items-center gap-1 pr-2', back ? 'pl-1' : 'pl-4')}>
        {back && (
          <Pressable
            accessibilityRole='button'
            accessibilityLabel='뒤로'
            onPress={back}
            className='h-12 w-12 items-center justify-center rounded-full active:bg-surface-hover'
          >
            <Icon name='arrow-left' />
          </Pressable>
        )}
        <View className='flex-1'>
          <Text heading='1' size='lg'>
            {title}
          </Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function StackHeader({ navigation, options, route, back }: NativeStackHeaderProps) {
  return (
    <Bar
      back={back ? navigation.goBack : undefined}
      title={options.title ?? route.name}
      right={options.headerRight?.({ canGoBack: back !== undefined })}
    />
  );
}

export function TabHeader({ options, route }: BottomTabHeaderProps) {
  return (
    <Bar title={options.title ?? route.name} right={options.headerRight?.({ canGoBack: false })} />
  );
}

const TAB_ICONS = { Home: 'home', History: 'list', Retro: 'chart-pie' } as const;

/** 탭 바. 고른 탭은 brand 글자와 아이콘이다(색만이 아니라 선택됨 상태로도 알린다) */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole='tablist'
      className='flex-row bg-surface'
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const selected = state.index === index;
        const { options } = descriptors[route.key];
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
        const icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS];
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole='tab'
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={onPress}
            className='min-h-16 flex-1 items-center justify-center gap-1 active:bg-surface-hover'
          >
            <Icon name={icon} className={selected ? 'text-fg-brand' : 'text-fg-muted'} />
            <Text size='sm' className={selected ? 'text-fg-brand' : 'text-fg-muted'}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
