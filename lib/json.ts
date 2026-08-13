import fs from 'node:fs';

/** UTF-8 BOM の文字コード。ソースに不可視文字を直接書かないため定数で持つ */
const BOM = 0xfeff;

/**
 * BOM付きで書き出されたJSONも読めるようにする。
 * PowerShell の Out-File / Set-Content 経由で書かれたファイルは UTF-8 BOM が付き、
 * 素の JSON.parse は先頭の U+FEFF で必ず落ちる。
 */
export function readJson<T>(file: string): T {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw.charCodeAt(0) === BOM ? raw.slice(1) : raw) as T;
}
