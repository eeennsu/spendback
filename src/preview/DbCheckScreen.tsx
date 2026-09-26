import { Card, Stack, Text } from '@eeennsu/native';
import { asc, eq } from 'drizzle-orm';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native-css/components';

import { db, runMigrations } from '../db';
import { categories, reasonTags } from '../db/schema';

/**
 * op-sqlite와 drizzle 연동 확인 화면(PRD 12장 4번). 마이그레이션을 적용하고 기본값을 읽는다.
 * proxy 드라이버의 all(여러 행)·get(한 행)과 boolean 열 변환을 본다. UI 구현(12장 6번) 때 지운다.
 */
export function DbCheckScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    (async () => {
      await runMigrations();
      const all = await db
        .select()
        .from(categories)
        .orderBy(asc(categories.type), asc(categories.sortOrder));
      const tags = await db.select().from(reasonTags);
      const first = await db.select().from(categories).where(eq(categories.id, 1)).get();
      setLines([
        `카테고리 ${all.length}개: ${all.map(c => c.name).join(', ')}`,
        `이유 태그 ${tags.length}개: ${tags.map(t => t.name).join(', ')}`,
        `id 1: ${first?.name}, isDefault ${typeof first?.isDefault} ${first?.isDefault}`,
      ]);
    })().catch(e => setError(String(e)));
  }, []);

  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-4 p-4'>
      <Text heading='1' size='2xl'>
        DB 확인
      </Text>
      <Card>
        <Stack className='gap-2'>
          {error ? (
            <Text tone='danger'>{error}</Text>
          ) : lines.length === 0 ? (
            <Text tone='muted'>마이그레이션 중</Text>
          ) : (
            lines.map(line => <Text key={line}>{line}</Text>)
          )}
        </Stack>
      </Card>
    </ScrollView>
  );
}
