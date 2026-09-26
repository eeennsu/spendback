import { homedir } from 'node:os';
import { join } from 'node:path';

import { MODELS } from '../../src/retro/models';

/**
 * 하네스 명령의 인자. 모델 id(없으면 전부), --dir <폴더>, --runs <횟수>, --only <스냅샷 id,…>,
 * 샘플링 비교용 --temp <온도>, --repeat <반복 벌점>
 */
export function parseArgs(argv: string[]) {
  const option = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i < 0 ? undefined : argv[i + 1];
  };
  const optionValues = new Set(
    ['dir', 'runs', 'only', 'temp', 'repeat']
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
  return {
    models: ids.length ? ids : MODELS.map(m => m.id),
    dir: option('dir'),
    runs: Number(option('runs') ?? 1),
    only: option('only')?.split(','),
    temperature: option('temp') === undefined ? undefined : Number(option('temp')),
    repeatPenalty: option('repeat') === undefined ? undefined : Number(option('repeat')),
  };
}

export const modelsDir = (dir?: string) => dir ?? join(homedir(), '.cache', 'spendback', 'models');
