// 버릴 코드(PROTOTYPE): PC에서 스파이크 앱을 실행하고 logcat과 메모리를 모아 results/에 저장한다.
//
//   pnpm spike -- --suite threads --models qwen --threads 2,4,6,8
//   pnpm spike -- --suite full --models qwen,kanana,exaone --threads 6 --runs 3
//
// 옵션: --install(APK 설치) --models-dir <GGUF 폴더>(기본 SPIKE_MODELS_DIR) --timeout-min <분>
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'com.llmspike';
const DEVICE_DIR = `/storage/emulated/0/Android/data/${PKG}/files/models`;
const FILES = {
  qwen: 'Qwen3.5-2B-Q4_K_M.gguf',
  kanana: 'kakaocorp.kanana-1.5-2.1b-instruct-2505.Q4_K_M.gguf',
  exaone: 'EXAONE-4.0-1.2B-Q4_K_M.gguf',
};

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : argv[i + 1];
};
const suite = opt('suite', 'full');
const models = opt('models', 'qwen,kanana,exaone').split(',');
const threads = opt('threads', '6');
const runs = opt('runs', '3');
const modelsDir = opt('models-dir', process.env.SPIKE_MODELS_DIR);
const timeoutMs = Number(opt('timeout-min', '60')) * 60_000;

const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8'}).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. 기기와 APK
const devices = adb('devices').split('\n').slice(1).filter(l => l.trim().endsWith('device'));
if (devices.length !== 1) throw new Error(`기기가 하나만 연결돼 있어야 한다: ${JSON.stringify(devices)}`);
if (argv.includes('--install')) {
  const apk = join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
  console.log('APK 설치:', adb('install', '-r', apk));
}

// 2. 모델 파일(앱을 한 번 띄워 외부 파일 폴더를 만든 뒤 크기가 다를 때만 push)
adb('shell', `am start -W -n ${PKG}/.MainActivity`);
await sleep(1500);
adb('shell', `mkdir -p ${DEVICE_DIR}`);
for (const m of models) {
  const remote = `${DEVICE_DIR}/${FILES[m]}`;
  const remoteSize = Number(adb('shell', `stat -c %s ${remote} 2>/dev/null || echo 0`));
  if (!modelsDir) throw new Error('--models-dir 또는 SPIKE_MODELS_DIR가 필요하다');
  const local = join(modelsDir, FILES[m]);
  const localSize = statSync(local).size;
  if (remoteSize === localSize) continue;
  console.log(`push ${FILES[m]} (${(localSize / 1e9).toFixed(2)}GB)`);
  execFileSync('adb', ['push', local, remote], {stdio: 'inherit'});
}
adb('shell', `am force-stop ${PKG}`);
await sleep(1000);

// 3. 측정
const thermal = () => adb('shell', 'dumpsys thermalservice').match(/Thermal Status: (\d+)/)?.[1] ?? '?';
const meta = {
  date: new Date().toISOString(),
  model: adb('shell', 'getprop ro.product.model'),
  soc: adb('shell', 'getprop ro.soc.model'),
  android: adb('shell', 'getprop ro.build.version.release'),
  thermalBefore: thermal(),
  battery: adb('shell', 'dumpsys battery').match(/level: (\d+)/)?.[1],
};
const params = {suite, models, threads, runs};
const url = `llmspike://run?suite=${suite}&models=${models.join(',')}&threads=${threads}&runs=${runs}`;

adb('logcat', '-c');
const events = [];
const chunks = new Map();
let phase = 'start';
let done = false;
const logcat = spawn('adb', ['logcat', '-v', 'epoch', '-s', 'ReactNativeJS:V', 'AndroidRuntime:E', 'RNLlama:V']);
let buf = '';
logcat.stdout.on('data', d => {
  buf += d.toString('utf8');
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    const m = line.match(/SPIKE (\d+) (\d+)\/(\d+) (.*?)\r?$/);
    if (!m) {
      if (/AndroidRuntime|FATAL| E RNLlama/.test(line)) console.log('[logcat]', line);
      continue;
    }
    const [, id, i, n, part] = m;
    const parts = chunks.get(id) ?? [];
    parts[Number(i) - 1] = part;
    chunks.set(id, parts);
    if (parts.filter(x => x !== undefined).length < Number(n)) continue;
    chunks.delete(id);
    const ev = JSON.parse(parts.join(''));
    events.push(ev);
    if (ev.ev === 'phase') phase = ev.phase;
    if (ev.ev === 'suite-done' || ev.ev === 'suite-error') done = true;
    const {text, systemInfo, rendered, ...brief} = ev;
    if (ev.ev !== 'phase') console.log(JSON.stringify(brief));
    if (rendered) console.log('  ' + rendered.join('\n  '));
  }
});

const mem = [];
const sampler = (async () => {
  while (!done) {
    try {
      const out = adb('shell', `dumpsys meminfo ${PKG}`);
      const pss = Number(out.match(/TOTAL PSS:\s+(\d+)/)?.[1]);
      const rss = Number(out.match(/TOTAL RSS:\s+(\d+)/)?.[1]);
      if (pss) mem.push({t: Date.now(), phase, pssKB: pss, rssKB: rss});
    } catch {}
    await sleep(1500);
  }
})();

console.log('실행:', url);
adb('shell', `am start -W -a android.intent.action.VIEW -d '${url}' ${PKG}`);
const t0 = Date.now();
while (!done && Date.now() - t0 < timeoutMs) await sleep(1000);
await sleep(2000);
logcat.kill();
done = true;
await sampler;
meta.thermalAfter = thermal();

// 4. 저장과 요약
const peaks = {};
for (const s of mem) {
  const key = s.phase.replace(/#\d+$/, '');
  const p = (peaks[key] ??= {pssMB: 0, rssMB: 0});
  p.pssMB = Math.max(p.pssMB, Math.round(s.pssKB / 1024));
  p.rssMB = Math.max(p.rssMB, Math.round(s.rssKB / 1024));
}
mkdirSync(join(ROOT, 'results'), {recursive: true});
const file = join(ROOT, 'results', `${meta.date.replace(/[:.]/g, '-')}-${suite}.json`);
writeFileSync(file, JSON.stringify({meta, params, events, memPeaks: peaks, mem}, null, 2));
console.log('\n기기:', JSON.stringify(meta));
console.log('메모리 최대치(MB):');
console.table(peaks);
console.log('저장:', file, done && events.some(e => e.ev === 'suite-done') ? '' : '(시간 초과 또는 오류)');
