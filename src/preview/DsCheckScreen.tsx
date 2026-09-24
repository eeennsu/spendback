import { Badge, Box, Button, Card, Label, Stack, Text, Textarea } from '@eeennsu/native';
import { useState } from 'react';
import { ScrollView } from 'react-native-css/components';

/**
 * 디자인 시스템 연동 확인 화면(PRD 12장 3번). Button과 0.2.0에 더해진 Textarea·Label·Badge·Box를 띄운다.
 * 기기에서 볼 항목은 PRD 12장 3번에 있다. UI 구현(12장 6번) 때 지운다.
 */
export function DsCheckScreen() {
  const [memo, setMemo] = useState('');
  const [saved, setSaved] = useState(0);

  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-4 p-4'>
      <Text heading='1' size='2xl'>
        디자인 시스템 확인
      </Text>

      <Card>
        <Stack className='gap-4'>
          <Stack direction='row' align='center' wrap className='gap-2'>
            <Badge variant='primary'>primary</Badge>
            <Badge>secondary</Badge>
            <Badge variant='danger' size='md'>
              danger
            </Badge>
          </Stack>

          <Stack className='gap-1'>
            <Label htmlFor='memo'>메모</Label>
            <Textarea
              id='memo'
              label='메모'
              placeholder='무엇을 샀나요'
              value={memo}
              onValueChange={setMemo}
            />
          </Stack>

          <Box className='rounded-md bg-brand p-8'>{null}</Box>

          <Button label={`저장 ${saved}회`} onPress={() => setSaved(count => count + 1)} />
          <Button label='취소' variant='secondary' />
        </Stack>
      </Card>
    </ScrollView>
  );
}
