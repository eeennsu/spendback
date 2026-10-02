import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 간격 클래스는 DS 간격 키 안에서 쓴다(docs/DESIGN.md 3.3). DS 테마에 없는 숫자는 클래스가 만들어지지 않아 아무
 * 스타일도 붙지 않는다. 헤더의 `h-14`가 그래서 빠졌고, 헤더 높이가 오른쪽 버튼 유무에 따라 탭마다 달라졌다(에뮬레이터)
 */
const KEYS = new Set(['0', '1', '2', '3', '4', '6', '8', '12', '16', '20', '24']);

const SPACING =
  /(?<![\w-])-?(?:p[xytblr]?|m[xytblr]?|gap(?:-[xy])?|[hw]|min-[hw]|max-[hw]|top|bottom|left|right|inset(?:-[xy])?|size)-(\d+(?:\.\d+)?)(?![\w.])/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test('앱 코드의 간격 클래스는 DS 간격 키만 쓴다', () => {
  const outside = sources(join(__dirname, '../src')).flatMap(file =>
    [...readFileSync(file, 'utf8').matchAll(SPACING)]
      .filter(match => !KEYS.has(match[1]))
      .map(match => `${file}: ${match[0]}`),
  );
  expect(outside).toEqual([]);
});
