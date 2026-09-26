import { Button, Card, Stack, Text } from '@eeennsu/native';
import { ANDROID_FILES_PATH } from '@op-engineering/op-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native-css/components';

import { SNAPSHOTS } from '../../scripts/eval/snapshots';
import { llamaNarrator } from '../retro/llama';
import { DEFAULT_MODEL_ID, MODELS } from '../retro/models';
import { type NarrateResult, narrate } from '../retro/narrate';

const model = MODELS.find(m => m.id === DEFAULT_MODEL_ID) ?? MODELS[0];
/**
 * 모델 관리(PRD 12장 7번) 전까지는 앱 내부 저장소에 손으로 넣는다. 외부 저장소(Android/data)는 adb가 만든
 * 폴더를 앱이 읽지 못한다.
 *   adb push <GGUF> /data/local/tmp/
 *   adb shell "run-as com.eeennsu.spendback sh -c 'mkdir -p files/models && cp /data/local/tmp/<GGUF> files/models/'"
 */
const MODEL_PATH = `${ANDROID_FILES_PATH}/models/${model.fileName}`;
/** 하네스 스냅샷 week-base(스파이크와 같은 한 주) */
const sample = SNAPSHOTS[0];

/**
 * llama.rn 회고 생성 확인 화면(PRD 12장 5번). 기기에서 narrate를 돌려 스트리밍·사후 검사·시간을 본다.
 * UI 구현(12장 6번) 때 지운다.
 */
export function LlmCheckScreen() {
  const narrator = useRef(llamaNarrator(MODEL_PATH));
  const controller = useRef<AbortController | null>(null);
  const [sentences, setSentences] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  // 화면을 나가면 모델을 내린다(PRD 6장 실행 정책)
  useEffect(() => {
    const current = narrator.current;
    return () => void current.release();
  }, []);

  const run = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setSentences([]);
    const start = Date.now();
    const lines = [`모델 ${model.name}`];
    setLog(lines);
    let first: number | undefined;
    const result: NarrateResult = await narrate({
      facts: sample.facts,
      names: sample.names,
      generate: narrator.current.generate,
      signal: abort.signal,
      onSentence: sentence => {
        first ??= Date.now() - start;
        setSentences(list => [...list, sentence.rendered]);
      },
      onRetry: attempt => {
        setSentences([]);
        setLog(list => [...list, `다시 쓰는 중(시도 ${attempt})`]);
      },
    }).catch(error => ({ status: 'fallback', reason: String(error) }) as never);
    setLog(list => [
      ...list,
      `결과 ${result.status}${'reason' in result ? `(${result.reason})` : ''}${'attempts' in result ? `, 시도 ${result.attempts}` : ''}`,
      `첫 문장 ${first === undefined ? '-' : `${(first / 1000).toFixed(1)}초`}, 전체 ${((Date.now() - start) / 1000).toFixed(1)}초`,
    ]);
    setRunning(false);
  };

  return (
    <ScrollView className='flex-1 bg-canvas' contentContainerClassName='gap-4 p-4'>
      <Text heading='1' size='2xl'>
        LLM 확인
      </Text>
      <Stack direction='row' className='gap-2'>
        <Button label='생성' onPress={run} disabled={running} />
        <Button
          label='취소'
          variant='secondary'
          onPress={() => controller.current?.abort()}
          disabled={!running}
        />
      </Stack>
      <Card>
        <Stack className='gap-2'>
          {sentences.length === 0 ? (
            <Text tone='muted'>{running ? '쓰는 중' : '생성을 누르세요'}</Text>
          ) : (
            sentences.map(line => <Text key={line}>{line}</Text>)
          )}
        </Stack>
      </Card>
      <Stack className='gap-1'>
        {log.map(line => (
          <Text key={line} size='sm' tone='muted'>
            {line}
          </Text>
        ))}
      </Stack>
    </ScrollView>
  );
}
