/**
 * 카드 알림 E2E(PRD 9장). Maestro는 흐름 안에서 알림을 올릴 수 없어, 흐름 사이에 adb로 개발용 형식의 알림을 올린다
 * (src/cards/parse.ts DEV_APP). 개발 빌드를 설치하고 Metro를 켠 뒤 `pnpm e2e:card`로 돌린다. Windows와 macOS 모두 돈다.
 */
import { spawnSync } from 'node:child_process';

const APP = 'com.eeennsu.spendback';
const LISTENER = `${APP}/${APP}.cards.CardNotificationService`;

function run(command: string, args: string[]) {
  // Windows에서 maestro는 .bat이라 셸로 부른다
  const result = spawnSync(command, args, { stdio: 'inherit', shell: command === 'maestro' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const day = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;

/**
 * adb shell은 인자를 공백으로 이어 기기 셸에 넘긴다. 본문은 작은따옴표로 묶는다. 태그는 실행마다 다르게 한다. 미뤄 둔
 * 알림과 키가 같으면 새로 올려도 미룬 채로 남는다
 */
const runId = now.getTime();
const post = (tag: string, text: string) =>
  run('adb', [
    'shell',
    'cmd',
    'notification',
    'post',
    '-t',
    '테스트카드',
    `${tag}-${runId}`,
    `'${text}'`,
  ]);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 알림창에 남은 흉내 알림을 하루 동안 미룬다(cmd notification에는 지우기가 없다). 남아 있으면 리스너가 다시 연결될 때
// 훑어 대기열에 다시 들어온다
const listed = spawnSync('adb', ['shell', 'cmd', 'notification', 'list'], { encoding: 'utf8' });
for (const key of listed.stdout
  .split(/\r?\n/)
  .filter(line => line.includes('|com.android.shell|'))) {
  run('adb', ['shell', 'cmd', 'notification', 'snooze', '--for', '86400000', `'${key.trim()}'`]);
}

run('maestro', ['test', '.maestro/card/open.yaml']);
// 앱 데이터를 지우면 알림 접근이 풀릴 수 있어 다시 허용한다
run('adb', ['shell', 'cmd', 'notification', 'allow_listener', LISTENER]);
await wait(3000);
post('e2e-approve', `승인 12,300원 ${day} 12:00 스타벅스 역삼점`);
post('e2e-unreadable', '승인 거절 안내');
run('maestro', ['test', '.maestro/card/approve.yaml']);
post('e2e-again', `승인 4,500원 ${day} 12:10 스타벅스 역삼점`);
post('e2e-cancel', `취소 12,300원 ${day} 12:20 스타벅스 역삼점`);
run('maestro', ['test', '.maestro/card/cancel.yaml']);
