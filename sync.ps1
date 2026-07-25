# 一键同步：拉队友的最新改动 -> 提交自己的 -> 推上去
# 用法： .\sync.ps1 "style: 换主色为汽水橙"
param([string]$msg = "")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[1/3] 拉取队友最新改动..." -ForegroundColor Cyan
git pull --rebase
if (-not $?) {
  Write-Host "!! 拉取有冲突，先解决冲突再跑一次。CSS 冲突听样式线的，JS 冲突听功能线的。" -ForegroundColor Red
  exit 1
}

$dirty = git status --porcelain
if (-not $dirty) {
  Write-Host "本地没有改动，已是最新。" -ForegroundColor Green
  exit 0
}

if (-not $msg) {
  Write-Host "!! 有未提交改动，请带上提交说明： .\sync.ps1 `"你干了啥`"" -ForegroundColor Red
  git status --short
  exit 1
}

Write-Host "[2/3] 提交本地改动..." -ForegroundColor Cyan
git add -A
git commit -m $msg

Write-Host "[3/3] 推送..." -ForegroundColor Cyan
git pull --rebase
git push

Write-Host "同步完成。线上部署请另跑： npx wrangler deploy" -ForegroundColor Green
