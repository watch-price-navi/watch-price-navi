import fs from 'node:fs';

/** UTF-8 BOM の文字コード。ソースに不可視文字を直接書かないため定数で持つ */
const BOM = 0xfeff;

/**
 * BOM付きで書き出されたJSONも読めるようにする。
 * PowerShell の Out-File / Set-Content 経由で書かれたファイルは UTF-8 BOM が付き、
 * 素の JSON.parse は先頭の U+FEFF で必ず落ちる。
 */
export function readJson(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.charCodeAt(0) === BOM ? raw.slice(1) : raw);
}

/** BOMなし UTF-8 で書き出す。Node の writeFileSync は BOM を付けないが、意図を明示するため経由させる */
export function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
