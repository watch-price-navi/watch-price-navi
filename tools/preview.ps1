# ローカルでサイトをプレビューする（初回は依存関係を自動インストール）
# 使い方: PowerShell でこのフォルダを開き  .\tools\preview.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path node_modules)) {
    Write-Host "依存パッケージをインストールしています..." -ForegroundColor Cyan
    npm install
}
Write-Host "http://localhost:3000/ja/ をブラウザで開いてください" -ForegroundColor Green
npm run dev
