/**
 * 평가 하네스용 GGUF를 받는다. 커밋을 고정한 URL로 받아 크기와 SHA-256을 확인한다(PRD 6장).
 *
 *   pnpm eval:models [모델 id…] [--dir <폴더>]
 *
 * 폴더 기본값은 ~/.cache/spendback/models다(Windows는 %USERPROFILE%\.cache\spendback\models).
 * 이미 있고 해시가 맞는 파일은 건너뛴다.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { MODELS, modelUrl } from '../../src/retro/models';
import { modelsDir, parseArgs } from './args';

async function sha256(file: string) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

const { models, dir } = parseArgs(process.argv.slice(2));
const directory = modelsDir(dir);
mkdirSync(directory, { recursive: true });

for (const model of MODELS.filter(m => models.includes(m.id))) {
  const file = `${directory}/${model.fileName}`;
  if (existsSync(file) && (await sha256(file)) === model.sha256) {
    console.log(`${model.id}: 있음`);
    continue;
  }
  console.log(`${model.id}: ${(model.sizeBytes / 1e9).toFixed(2)}GB 받는 중`);
  const response = await fetch(modelUrl(model));
  if (!response.ok || !response.body) throw new Error(`${model.id}: HTTP ${response.status}`);
  const partial = `${file}.part`;
  const hash = createHash('sha256');
  const body = Readable.fromWeb(response.body);
  body.on('data', chunk => hash.update(chunk));
  await pipeline(body, createWriteStream(partial));
  const digest = hash.digest('hex');
  if (digest !== model.sha256) throw new Error(`${model.id}: SHA-256이 다르다(${digest})`);
  renameSync(partial, file);
  console.log(`${model.id}: 확인함`);
}
