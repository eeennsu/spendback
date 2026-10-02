import { Card, Icon, Stack, Text } from '@eeennsu/native';
import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { ScrollView } from 'react-native-css/components';

import { allBudgets } from '../db/budgets';
import { getSetting } from '../db/settings';
import { insertSample } from '../dev/sample';
import { budgetForMonth } from '../domain/budget';
import { formatWon } from '../domain/format';
import { hasModel } from '../native/files';
import { mutate, useQuery, useToday } from '../state/data';
import { useLists } from '../state/lists';
import { modelFor } from '../state/retro';
import { Row } from '../ui/layout';

/**
 * 설정(docs/DESIGN.md 4.4). 홈 헤더 톱니로 연다. 묶은 목록이고 줄은 하위 화면으로 간다.
 * 파괴적 동작(가져오기 전체 교체)은 백업 화면 안, 맨 아래에 있다
 */
export function SettingsScreen() {
  const navigation = useNavigation();
  const today = useToday();
  const lists = useLists();
  const data = useQuery('settings', async db => ({
    budgets: await allBudgets(db),
    modelId: await getSetting(db, 'model'),
  }));
  if (!lists || !data) return null;

  const budget = budgetForMonth(data.budgets, today.slice(0, 7));
  const model = modelFor(data.modelId);
  const items = lists.fixedCosts.filter(f => !f.hidden).length;

  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-3 px-4 pb-8 pt-1'>
      <Group title='기록'>
        <Link label='카테고리' onPress={() => navigation.navigate('Categories')} />
        <Link label='이유 태그' onPress={() => navigation.navigate('ReasonTags')} />
      </Group>
      {/* 묶음 제목과 줄 이름이 같아지지 않게("예산" 안의 "예산") 예산과 고정비를 한 묶음으로 둔다 */}
      <Group title='예산과 고정비'>
        <Link
          label='예산'
          detail={
            budget ? `월 ${formatWon(budget.total)} · 이번 달부터 적용` : '아직 정하지 않았어요'
          }
          onPress={() => navigation.navigate('Budget')}
        />
        <Link
          label='고정비 항목'
          detail={items > 0 ? `${items}개` : '아직 없어요'}
          onPress={() => navigation.navigate('FixedCosts')}
        />
      </Group>
      <Group title='회고'>
        <Link
          label='모델 관리'
          detail={hasModel(model) ? `사용 중 · ${model.name}` : '모델 없음'}
          onPress={() => navigation.navigate('Models')}
        />
      </Group>
      <Group title='데이터'>
        <Link
          label='백업'
          detail='내보내기 · 가져오기'
          onPress={() => navigation.navigate('Backup')}
        />
      </Group>
      {__DEV__ && (
        <Group title='개발'>
          <Link
            label='샘플 데이터 넣기'
            detail='개발 빌드에만 있어요. 지난 두 달의 기록을 더해요'
            onPress={() =>
              Alert.alert('샘플 데이터를 넣을까요?', '지금 기록에 더해져요.', [
                { text: '취소', style: 'cancel' },
                { text: '넣기', onPress: () => void mutate(db => insertSample(db, today)) },
              ])
            }
          />
        </Group>
      )}
    </ScrollView>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactElement | React.ReactElement[];
}) {
  return (
    <Card className='gap-1 py-3'>
      <Text heading='2' size='sm' tone='muted'>
        {title}
      </Text>
      {children}
    </Card>
  );
}

/** 하위 화면으로 가는 줄. 꺾쇠로 이동을 알린다 */
function Link({ label, detail, onPress }: { label: string; detail?: string; onPress: () => void }) {
  return (
    <Row label={detail ? `${label}, ${detail}` : label} onPress={onPress}>
      <Stack className='flex-1 gap-1'>
        <Text>{label}</Text>
        {detail !== undefined && (
          <Text size='sm' tone='muted' className='tabular-nums'>
            {detail}
          </Text>
        )}
      </Stack>
      <Icon name='chevron-right' tone='muted' />
    </Row>
  );
}
