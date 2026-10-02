import { homedir } from 'node:os';
import { join } from 'node:path';

import { MODELS } from '../../src/retro/models';
import { PROMPT_VERSION, PROMPT_VERSIONS, type PromptVersion } from '../../src/retro/prompt';

/**
 * 하네스 명령의 인자. 모델 id(없으면 전부), --dir <폴더>, --runs <횟수>, --only <스냅샷 id,…>,
 * 샘플링 비교용 --temp <온도>, --repeat <반복 벌점>, --top-p <값>, --presence <존재 벌점>,
 * 프롬프트 비교용 --prompt <버전>(src/retro/prompt.ts PROMPT_VERSIONS)
 */
export function parseArgs(argv: string[]) {
  const option = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i < 0 ? undefined : argv[i + 1];
  };
  const optionValues = new Set(
    ['dir', 'runs', 'only', 'temp', 'repeat', 'top-p', 'presence', 'prompt']
      .map(option)
      .filter((v): v is string => v !== undefined),
  );
  const ids = argv.filter(a => !a.startsWith('--') && !optionValues.has(a));
  const unknown = ids.filter(id => !MODELS.some(m => m.id === id));
  if (unknown.length) {
    throw new Error(
      `모르는 모델: ${unknown.join(', ')}. 있는 것: ${MODELS.map(m => m.id).join(', ')}`,
    );
  }
  const prompt = (option('prompt') ?? PROMPT_VERSION) as PromptVersion;
  if (!PROMPT_VERSIONS.includes(prompt)) {
    throw new Error(`모르는 프롬프트: ${prompt}. 있는 것: ${PROMPT_VERSIONS.join(', ')}`);
  }
  return {
    prompt,
    models: ids.length ? ids : MODELS.map(m => m.id),
    dir: option('dir'),
    runs: Number(option('runs') ?? 1),
    only: option('only')?.split(','),
    temperature: option('temp') === undefined ? undefined : Number(option('temp')),
    repeatPenalty: option('repeat') === undefined ? undefined : Number(option('repeat')),
    topP: option('top-p') === undefined ? undefined : Number(option('top-p')),
    presencePenalty: option('presence') === undefined ? undefined : Number(option('presence')),
  };
}

export const modelsDir = (dir?: string) => dir ?? join(homedir(), '.cache', 'spendback', 'models');
