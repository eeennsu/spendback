import { deflateRawSync } from 'node:zlib';

import { readSheet } from '../scripts/pyunhan/xlsx';

/** 압축 방식(0 저장, 8 deflate)을 고를 수 있는 최소 zip. CRC는 읽는 쪽이 보지 않아 0으로 둔다 */
function zip(entries: Array<[name: string, text: string, method: 0 | 8]>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text, method] of entries) {
    const raw = Buffer.from(text, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const fileName = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, data);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const STRINGS = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
<si><t>&#xb0a0;&#xc9dc;</t></si>
<si><t>&#x1f35c; 회사 식비</t></si>
<si><r><t>빵 &amp; </t></r><r><t xml:space="preserve">우유</t></r></si>
<si><t/></si>
</sst>`;

const SHEET = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="20"/></cols>
<sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>금액</t></is></c></row>
<row r="2"><c r="A2" s="1"><v>46300.5</v></c><c r="C2" t="s"><v>1</v></c><c s="2" r="D2" t="s"><v>2</v></c><c r="E2" t="s"><v>3</v></c><c r="F2" t="str"><v>19430.0</v></c></row>
<row r="3"/>
<row r="4"><c r="A4"><v>1</v></c><c r="B4" s="1"/></row>
</sheetData>
</worksheet>`;

test('첫 시트를 줄과 칸의 값으로 읽는다', () => {
  const file = zip([
    ['[Content_Types].xml', '<Types/>', 0],
    ['xl/sharedStrings.xml', STRINGS, 8],
    ['xl/worksheets/sheet1.xml', SHEET, 8],
  ]);
  expect(readSheet(file)).toEqual([
    ['날짜', '금액'],
    [46300.5, null, '🍜 회사 식비', '빵 & 우유', '', '19430.0'],
    [],
    [1, null],
  ]);
});

test('공유 문자열이 없는 시트도 읽는다', () => {
  const sheet = SHEET.replace(/<row r="2">[\s\S]*?<\/row>/, '').replace(
    '<c r="A1" t="s"><v>0</v></c>',
    '',
  );
  const file = zip([['xl/worksheets/sheet1.xml', sheet, 0]]);
  expect(readSheet(file)[0]).toEqual([null, '금액']);
});

test('zip이 아니면 엑셀 파일이 아니라고 알린다', () => {
  expect(() => readSheet(Buffer.from('날짜,금액\n'))).toThrow('엑셀 파일이 아니에요');
});
