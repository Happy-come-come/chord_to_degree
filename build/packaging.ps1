# 修正版 パッケージング設定
$EXTENSION_NAME = "chordwiki-degree"
$DIST_DIR = "dist"
$TEMP_DIR = "temp"

# ディレクトリのクリーンアップ
Write-Host "🧹 クリーンアップ中..." -ForegroundColor Yellow
if (Test-Path $DIST_DIR) { Remove-Item -Recurse -Force $DIST_DIR }
if (Test-Path $TEMP_DIR) { Remove-Item -Recurse -Force $TEMP_DIR }

# ディレクトリの作成
New-Item -ItemType Directory -Path $DIST_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null

Write-Host "📦 拡張機能パッケージング開始..." -ForegroundColor Green

# UserScriptのヘッダを削除してcontent.jsを作成
Write-Host "✂️  UserScriptヘッダを削除中..." -ForegroundColor Cyan

# chord_to_degree.js を読み込み
$lines = Get-Content "..\chord_to_degree.js" -Encoding UTF8

# ==/UserScript== の行を見つける
$endIndex = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match "^// ==/UserScript==$") {
        $endIndex = $i
        break
    }
}

if ($endIndex -eq -1) {
    Write-Host "❌ エラー: ==/UserScript== が見つかりません" -ForegroundColor Red
    Write-Host "🔍 ファイルの最初の15行:" -ForegroundColor Cyan
    $lines[0..14] | ForEach-Object { Write-Host $_ }
    exit 1
}

# ==/UserScript== の次の行から開始
$startIndex = $endIndex + 1

# 空行と (async function(){ をスキップ
while ($startIndex -lt $lines.Length) {
    $line = $lines[$startIndex]
    
    # 空行をスキップ
    if ($line -match "^\s*$") {
        $startIndex++
        continue
    }
    
    # (async function(){ の行をスキップ
    if ($line -match "^\(async function\(\)\{") {
        $startIndex++
        break
    }
    
    # その他の行が来たら、そこから開始
    break
}

if ($startIndex -ge $lines.Length) {
    Write-Host "❌ エラー: ==/UserScript== の後に有効なコードがありません" -ForegroundColor Red
    exit 1
}

# 実際のコンテンツ部分を取得
$contentLines = $lines[$startIndex..($lines.Length - 1)]
$contentLines | Out-File -FilePath "$TEMP_DIR\content.js" -Encoding UTF8

# 生成されたファイルの確認
$contentInfo = Get-Item "$TEMP_DIR\content.js"
if ($contentInfo.Length -eq 0) {
    Write-Host "❌ エラー: content.js が空です" -ForegroundColor Red
    exit 1
}

# ファイルの最初の数行を確認
Write-Host "📝 生成されたcontent.jsの最初の5行:" -ForegroundColor Cyan
Get-Content "$TEMP_DIR\content.js" -Head 5 | ForEach-Object { Write-Host "  $_" }

Write-Host "✅ content.js 生成完了 ($($contentLines.Length) 行, $($contentInfo.Length) bytes)" -ForegroundColor Green

# バージョン取得
$versionLine = $lines | Where-Object { $_ -match "@version" } | Select-Object -First 1
$version = if ($versionLine) {
    ($versionLine -replace ".*@version\s+", "").Trim()
} else {
    "1.0.0"
}

Write-Host "📋 バージョン: $version" -ForegroundColor Cyan

# iconsディレクトリの作成とアイコンのコピー
New-Item -ItemType Directory -Path "$TEMP_DIR\icons" -Force | Out-Null
if (Test-Path "..\icons\128.png") {
    Copy-Item "..\icons\128.png" "$TEMP_DIR\icons\"
    Write-Host "✅ アイコンファイル コピー完了" -ForegroundColor Green
} else {
    Write-Host "⚠️  警告: ..\icons\128.png が見つかりません" -ForegroundColor Yellow
}

# Chrome用manifest.json（v3）の作成
Write-Host "🔧 Chrome用manifest.json作成中..." -ForegroundColor Cyan
$chromeManifest = @{
    "manifest_version" = 3
    "name" = "ChordWiki: コード → ディグリー"
    "description" = "ChordWikiのコード名をディグリー表示に変換します。"
    "version" = $version
    "icons" = @{
        "128" = "icons/128.png"
    }
    "content_scripts" = @(
        @{
            "matches" = @("https://ja.chordwiki.org/wiki*")
            "js" = @("content.js")
            "run_at" = "document_idle"
        }
    )
    "host_permissions" = @("https://ja.chordwiki.org/*")
    "action" = @{
        "default_title" = "ChordWiki Degree"
    }
}

$chromeManifest | ConvertTo-Json -Depth 10 | Out-File -FilePath "$TEMP_DIR\manifest_chrome.json" -Encoding UTF8

# Firefox用manifest.json（v2）の作成
Write-Host "🦊 Firefox用manifest.json作成中..." -ForegroundColor Cyan
$firefoxManifest = @{
    "manifest_version" = 2
    "name" = "ChordWiki: コード → ディグリー"
    "description" = "ChordWikiのコード名をディグリー表示に変換します。"
    "version" = $version
    "icons" = @{
        "128" = "icons/128.png"
    }
    "content_scripts" = @(
        @{
            "matches" = @("https://ja.chordwiki.org/wiki*")
            "js" = @("content.js")
            "run_at" = "document_idle"
        }
    )
    "permissions" = @("https://ja.chordwiki.org/*")
    "browser_action" = @{
        "default_title" = "ChordWiki Degree"
    }
    "browser_specific_settings" = @{
        "gecko" = @{
            "id" = "chordwiki-degree@example.com"
            "strict_min_version" = "109.0"
        }
    }
}

$firefoxManifest | ConvertTo-Json -Depth 10 | Out-File -FilePath "$TEMP_DIR\manifest_firefox.json" -Encoding UTF8

# Chrome用パッケージの作成
Write-Host "📦 Chrome用パッケージ作成中..." -ForegroundColor Green
Copy-Item "$TEMP_DIR\manifest_chrome.json" "$TEMP_DIR\manifest.json"
$chromeZipPath = "$DIST_DIR\${EXTENSION_NAME}_chrome_v${version}.zip"
try {
    Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $chromeZipPath -Exclude "manifest_firefox.json", "manifest_chrome.json" -Force
    Write-Host "✅ Chrome版ZIP作成完了" -ForegroundColor Green
} catch {
    Write-Host "⚠️  ZIP作成エラー: $_" -ForegroundColor Yellow
}

# Firefox用パッケージの作成
Write-Host "📦 Firefox用パッケージ作成中..." -ForegroundColor Green
Copy-Item "$TEMP_DIR\manifest_firefox.json" "$TEMP_DIR\manifest.json" -Force
$firefoxZipPath = "$DIST_DIR\${EXTENSION_NAME}_firefox_v${version}.zip"
try {
    Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $firefoxZipPath -Exclude "manifest_firefox.json", "manifest_chrome.json" -Force
    Write-Host "✅ Firefox版ZIP作成完了" -ForegroundColor Green
} catch {
    Write-Host "⚠️  ZIP作成エラー: $_" -ForegroundColor Yellow
}

# LICENSEとREADMEをコピー（オプション）
if (Test-Path "..\LICENSE") {
    Copy-Item "..\LICENSE" "$TEMP_DIR\"
}

if (Test-Path "..\README.md") {
    Copy-Item "..\README.md" "$TEMP_DIR\"
}

# 完全パッケージの作成（開発用）
Write-Host "📦 完全パッケージ作成中..." -ForegroundColor Green
Copy-Item "$TEMP_DIR\manifest_chrome.json" "$TEMP_DIR\manifest.json" -Force
$completeZipPath = "$DIST_DIR\${EXTENSION_NAME}_complete_v${version}.zip"
try {
    Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $completeZipPath -Force
    Write-Host "✅ 完全版ZIP作成完了" -ForegroundColor Green
} catch {
    Write-Host "⚠️  ZIP作成エラー: $_" -ForegroundColor Yellow
}

# クリーンアップ
Write-Host "🧹 一時ファイルをクリーンアップ中..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $TEMP_DIR

Write-Host ""
Write-Host "✅ パッケージング完了!" -ForegroundColor Green
Write-Host "📁 出力ディレクトリ: $DIST_DIR\" -ForegroundColor White
Write-Host "📦 Chrome用: ${EXTENSION_NAME}_chrome_v${version}.zip" -ForegroundColor White
Write-Host "📦 Firefox用: ${EXTENSION_NAME}_firefox_v${version}.zip" -ForegroundColor White
Write-Host "📦 完全版: ${EXTENSION_NAME}_complete_v${version}.zip" -ForegroundColor White

# ファイルサイズを表示
Write-Host ""
Write-Host "📊 ファイルサイズ:" -ForegroundColor Cyan
if (Test-Path $DIST_DIR) {
    Get-ChildItem "$DIST_DIR\*.zip" | ForEach-Object {
        $size = [math]::Round($_.Length / 1KB, 2)
        Write-Host "$($_.Name): ${size} KB" -ForegroundColor White
    }
}
