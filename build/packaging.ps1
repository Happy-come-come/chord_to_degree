# パッケージング設定
$EXTENSION_NAME = "chordwiki-degree"
$VERSION = "1.0.0.5"
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
$content = Get-Content "..\chord_to_degree.js" -Raw
$headerEnd = $content.IndexOf("// ==/UserScript==")
if ($headerEnd -ge 0) {
    $headerEndLine = $content.Substring(0, $headerEnd).Split("`n").Length
    $lines = Get-Content "..\chord_to_degree.js"
    $contentLines = $lines[$headerEndLine..($lines.Length - 1)]
    $contentLines | Out-File -FilePath "$TEMP_DIR\content.js" -Encoding UTF8
} else {
    Write-Error "UserScriptヘッダが見つかりません"
    exit 1
}

# iconsディレクトリの作成とアイコンのコピー
New-Item -ItemType Directory -Path "$TEMP_DIR\icons" -Force | Out-Null
Copy-Item "..\icons\128.png" "$TEMP_DIR\icons\"

# Chrome用manifest.json（v3）の作成
Write-Host "🔧 Chrome用manifest.json作成中..." -ForegroundColor Cyan
$chromeManifest = @{
    "manifest_version" = 3
    "name" = "ChordWiki: コード → ディグリー"
    "description" = "ChordWikiのコード名をディグリー表示に変換します。"
    "version" = $VERSION
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
    "version" = $VERSION
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
$chromeZipPath = "$DIST_DIR\${EXTENSION_NAME}_chrome_v${VERSION}.zip"
Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $chromeZipPath -Exclude "manifest_firefox.json", "manifest_chrome.json" -Force

# Firefox用パッケージの作成
Write-Host "📦 Firefox用パッケージ作成中..." -ForegroundColor Green
Copy-Item "$TEMP_DIR\manifest_firefox.json" "$TEMP_DIR\manifest.json" -Force
$firefoxZipPath = "$DIST_DIR\${EXTENSION_NAME}_firefox_v${VERSION}.zip"
Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $firefoxZipPath -Exclude "manifest_firefox.json", "manifest_chrome.json" -Force

# LICENSEとREADMEをコピー（オプション）
if (Test-Path "..\LICENSE") {
    Copy-Item "..\LICENSE" "$TEMP_DIR\"
}

if (Test-Path "..\README.md") {
    Copy-Item "..\README.md" "$TEMP_DIR\"
}

# 完全パッケージの作成（開発用）
Write-Host "📦 完全パッケージ作成中..." -ForegroundColor Green
$completeZipPath = "$DIST_DIR\${EXTENSION_NAME}_complete_v${VERSION}.zip"
Compress-Archive -Path "$TEMP_DIR\*" -DestinationPath $completeZipPath -Force

# クリーンアップ
Write-Host "🧹 一時ファイルをクリーンアップ中..." -ForegroundColor Yellow
Remove-Item -Recurse -Force $TEMP_DIR

Write-Host "✅ パッケージング完了!" -ForegroundColor Green
Write-Host "📁 出力ディレクトリ: $DIST_DIR/" -ForegroundColor White
Write-Host "📦 Chrome用: ${EXTENSION_NAME}_chrome_v${VERSION}.zip" -ForegroundColor White
Write-Host "📦 Firefox用: ${EXTENSION_NAME}_firefox_v${VERSION}.zip" -ForegroundColor White
Write-Host "📦 完全版: ${EXTENSION_NAME}_complete_v${VERSION}.zip" -ForegroundColor White

# ファイルサイズを表示
Write-Host ""
Write-Host "📊 ファイルサイズ:" -ForegroundColor Cyan
Get-ChildItem "$DIST_DIR\*.zip" | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "$($_.Name): ${size} KB" -ForegroundColor White
}
