#!/bin/bash

# パッケージング設定
EXTENSION_NAME="chordwiki-degree"
DIST_DIR="dist"
TEMP_DIR="temp"

# ディレクトリのクリーンアップ
echo "🧹 クリーンアップ中..."
rm -rf "$DIST_DIR"
rm -rf "$TEMP_DIR"

# ディレクトリの作成
mkdir -p "$DIST_DIR"
mkdir -p "$TEMP_DIR"

echo "📦 拡張機能パッケージング開始..."

# UserScriptのヘッダを削除してcontent.jsを作成
echo "✂️  UserScriptヘッダを削除中..."

# 方法: sedを使用して特定の行から特定の行まで削除
# 1. // ==UserScript== から // ==/UserScript== まで削除
# 2. 空行を削除
# 3. (async function(){ の行を削除
sed -e '/^\/\/ ==UserScript==/,/^\/\/ ==\/UserScript==$/d' \
    -e '/^[[:space:]]*$/d' \
    -e '/^(async function(){$/d' \
    ../chord_to_degree.js > "$TEMP_DIR/content.js"

# より確実な方法: 行番号ベースで削除
# ==/UserScript== の行番号を取得
END_LINE=$(grep -n "^// ==/UserScript==$" ../chord_to_degree.js | cut -d: -f1)
if [ -n "$END_LINE" ]; then
    # ==/UserScript== の次の行から開始
    SKIP_LINES=$((END_LINE + 1))
    
    # 次の2行（空行と (async function(){）もスキップする可能性を考慮
    tail -n +$SKIP_LINES ../chord_to_degree.js | sed -e '1{/^[[:space:]]*$/d;}' -e '1{/^(async function(){$/d;}' > "$TEMP_DIR/content.js"
else
    echo "❌ エラー: ==/UserScript== が見つかりません"
    exit 1
fi

# 生成されたファイルの確認
if [ ! -s "$TEMP_DIR/content.js" ]; then
    echo "❌ エラー: content.js が空です。UserScriptヘッダーの削除に失敗しました。"
    echo "🔍 ../chord_to_degree.js の内容を確認中..."
    head -20 ../chord_to_degree.js
    exit 1
fi

# ファイルの最初の数行を確認
echo "📝 生成されたcontent.jsの最初の5行:"
head -5 "$TEMP_DIR/content.js"

echo "✅ content.js 生成完了 ($(wc -l < "$TEMP_DIR/content.js") 行)"

# バージョン取得
VERSION=$(grep "@version" ../chord_to_degree.js | sed 's/.*@version[[:space:]]*//' | tr -d '\t\r')
echo "📋 バージョン: $VERSION"

# iconsディレクトリの作成とアイコンのコピー
mkdir -p "$TEMP_DIR/icons"
if [ -f "../icons/128.png" ]; then
    cp ../icons/128.png "$TEMP_DIR/icons/"
    echo "✅ アイコンファイル コピー完了"
else
    echo "⚠️  警告: ../icons/128.png が見つかりません"
fi

# Chrome用manifest.json（v3）の作成
echo "🔧 Chrome用manifest.json作成中..."
cat > "$TEMP_DIR/manifest_chrome.json" << EOF
{
  "manifest_version": 3,
  "name": "ChordWiki: コード → ディグリー",
  "description": "ChordWikiのコード名をディグリー表示に変換します。",
  "version": "$VERSION",
  "icons": {
    "128": "icons/128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://ja.chordwiki.org/wiki*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "host_permissions": ["https://ja.chordwiki.org/*"],
  "action": {
    "default_title": "ChordWiki Degree"
  }
}
EOF

# Firefox用manifest.json（v2）の作成
echo "🦊 Firefox用manifest.json作成中..."
cat > "$TEMP_DIR/manifest_firefox.json" << EOF
{
  "manifest_version": 2,
  "name": "ChordWiki: コード → ディグリー",
  "description": "ChordWikiのコード名をディグリー表示に変換します。",
  "version": "$VERSION",
  "icons": {
    "128": "icons/128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://ja.chordwiki.org/wiki*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "permissions": ["https://ja.chordwiki.org/*"],
  "browser_action": {
    "default_title": "ChordWiki Degree"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "chordwiki-degree@example.com",
      "strict_min_version": "109.0"
    }
  }
}
EOF

# Chrome用パッケージの作成
echo "📦 Chrome用パッケージ作成中..."
cp "$TEMP_DIR/manifest_chrome.json" "$TEMP_DIR/manifest.json"
cd "$TEMP_DIR"
if command -v zip > /dev/null; then
    zip -r "../$DIST_DIR/${EXTENSION_NAME}_chrome_v${VERSION}.zip" . -x "manifest_firefox.json" "manifest_chrome.json"
    echo "✅ Chrome版ZIP作成完了"
else
    echo "⚠️  zip コマンドが見つかりません"
fi
cd ..

# Firefox用パッケージの作成
echo "📦 Firefox用パッケージ作成中..."
cp "$TEMP_DIR/manifest_firefox.json" "$TEMP_DIR/manifest.json"
cd "$TEMP_DIR"
if command -v zip > /dev/null; then
    zip -r "../$DIST_DIR/${EXTENSION_NAME}_firefox_v${VERSION}.zip" . -x "manifest_firefox.json" "manifest_chrome.json"
    echo "✅ Firefox版ZIP作成完了"
else
    echo "⚠️  zip コマンドが見つかりません"
fi
cd ..

# LICENSEとREADMEをコピー（オプション）
if [ -f "../LICENSE" ]; then
    cp ../LICENSE "$TEMP_DIR/"
fi

if [ -f "../README.md" ]; then
    cp ../README.md "$TEMP_DIR/"
fi

# 完全パッケージの作成（開発用）
echo "📦 完全パッケージ作成中..."
cp "$TEMP_DIR/manifest_chrome.json" "$TEMP_DIR/manifest.json"
cd "$TEMP_DIR"
if command -v zip > /dev/null; then
    zip -r "../$DIST_DIR/${EXTENSION_NAME}_complete_v${VERSION}.zip" .
    echo "✅ 完全版ZIP作成完了"
fi
cd ..

# クリーンアップ
echo "🧹 一時ファイルをクリーンアップ中..."
rm -rf "$TEMP_DIR"

echo "✅ パッケージング完了!"
echo "📁 出力ディレクトリ: $DIST_DIR/"
echo "📦 Chrome用: ${EXTENSION_NAME}_chrome_v${VERSION}.zip"
echo "📦 Firefox用: ${EXTENSION_NAME}_firefox_v${VERSION}.zip"
echo "📦 完全版: ${EXTENSION_NAME}_complete_v${VERSION}.zip"

# ファイルサイズを表示
echo ""
echo "📊 ファイルサイズ:"
if [ -d "$DIST_DIR" ]; then
    ls -lh "$DIST_DIR"/*.zip | awk '{print $9 ": " $5}'
fi
