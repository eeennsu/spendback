import { inflateRawSync } from 'node:zlib';

/**
 * 엑셀(.xlsx)의 첫 시트를 값 배열로 읽는다. 편한가계부 내보내기 한 장만 읽으면 되어 라이브러리를 들이지 않는다.
 * xlsx는 XML 파일을 담은 zip이다. 서식, 수식, 날짜 형식은 보지 않고 저장된 값만 읽는다(날짜는 일련번호 숫자다)
 */

export type Cell = string | number | boolean | null;

/** zip의 중앙 디렉터리를 읽어 파일 이름마다 내용을 낸다. 저장(0)과 deflate(8)만 쓴다 */
function unzip(data: Uint8Array) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  // 끝 레코드는 마지막 22바이트에 있고, 주석이 있으면 그만큼 앞에 있다
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('엑셀 파일이 아니에요');
  const files = new Map<string, Buffer>();
  let at = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    // 크기는 중앙 디렉터리 것을 쓴다. 로컬 헤더는 데이터 서술자를 쓰면 0이다
    const local = buf.readUInt32LE(at + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 8) files.set(name, inflateRawSync(raw));
    else if (method === 0) files.set(name, raw);
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}

function decode(text: string) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

/** 문자열 칸(공유 문자열, 인라인)의 글자. 서식이 다른 조각(<r>)은 이어 붙이고 발음 표기(<rPh>)는 뺀다 */
function textOf(xml: string) {
  const runs = xml
    .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
    .matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g);
  return decode([...runs].map(run => run[1] ?? '').join(''));
}

/** 열 글자(A, B, …, AA)를 0부터 세는 번호로 */
function columnIndex(letters: string) {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export function readSheet(data: Uint8Array): Cell[][] {
  const files = unzip(data);
  const sheetName = files.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : [...files.keys()].filter(name => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort()[0];
  const sheet = sheetName && files.get(sheetName)?.toString('utf8');
  if (!sheet) throw new Error('엑셀 파일에 시트가 없어요');
  const strings = [
    ...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map(m => textOf(m[1]));

  const table: Cell[][] = [];
  for (const row of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? table.length + 1);
    const cells: Cell[] = [];
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [attrs, body = ''] = [cell[1], cell[2]];
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const column = ref ? columnIndex(ref) : cells.length;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let cellValue: Cell = null;
      if (type === 'inlineStr') cellValue = textOf(body);
      else if (value === undefined) cellValue = null;
      else if (type === 's') cellValue = strings[Number(value)] ?? null;
      else if (type === 'str' || type === 'e') cellValue = decode(value);
      else if (type === 'b') cellValue = value === '1';
      else cellValue = Number(value);
      while (cells.length < column) cells.push(null);
      cells[column] = cellValue;
    }
    while (table.length < rowNumber - 1) table.push([]);
    table[rowNumber - 1] = cells;
  }
  return table;
}
