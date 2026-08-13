# ローカルでサイトをプレビューする（初回は依存関係を自動インストール）
# 使い方: PowerShell でこのフォルダを開き  .\tools\preview.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path node_modules)) {
    Write-Host "依存パッケージをインストールしています..." -ForegroundColor Cyan
    npm install
}
# next dev は .env の NEXT_PUBLIC_BASE_PATH の配下で配信される
$basePath = ''
$envLine = Select-String -Path .env -Pattern '^\s*NEXT_PUBLIC_BASE_PATH\s*=\s*(\S+)' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($envLine) { $basePath = $envLine.Matches[0].Groups[1].Value }
Write-Host "http://localhost:3000$basePath/ja/ をブラウザで開いてください" -ForegroundColor Green
npm run dev
