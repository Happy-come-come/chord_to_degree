#!/bin/bash

# パッケージング設定
EXTENSION_NAME="chordwiki-degree"
VERSION="1.0.0.5"
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
sed -n '/^\/\/ ==/UserScript==/,$p' ../chord_to_degree.js | tail -n +2 > "$TEMP_DIR/content.js"

# iconsディレクトリの作成とアイコンのコピー
mkdir -p "$TEMP_DIR/icons"
cp ../icons/128.png "$TEMP_DIR/icons/"

# Chrome用manifest.json（v3）の作成
echo "🔧 Chrome用manifest.json作成中..."
cat > "$TEMP_DIR/manifest_chrome.json" << 'EOF'
{
  "manifest_version": 3,
  "name": "ChordWiki: コード → ディグリー",
  "description": "ChordWikiのコード名をディグリー表示に変換します。",
  "version": "1.0.0.5",
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
cat > "$TEMP_DIR/manifest_firefox.json" << 'EOF'
{
  "manifest_version": 2,
  "name": "ChordWiki: コード → ディグリー",
  "description": "ChordWikiのコード名をディグリー表示に変換します。",
  "version": "1.0.0.5",
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
zip -r "../$DIST_DIR/${EXTENSION_NAME}_chrome_v${VERSION}.zip" . -x "manifest_firefox.json" "manifest_chrome.json"
cd ..

# Firefox用パッケージの作成
echo "📦 Firefox用パッケージ作成中..."
cp "$TEMP_DIR/manifest_firefox.json" "$TEMP_DIR/manifest.json"
cd "$TEMP_DIR"
zip -r "../$DIST_DIR/${EXTENSION_NAME}_firefox_v${VERSION}.zip" . -x "manifest_firefox.json" "manifest_chrome.json"
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
cd "$TEMP_DIR"
zip -r "../$DIST_DIR/${EXTENSION_NAME}_complete_v${VERSION}.zip" .
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
ls -lh "$DIST_DIR"/*.zip | awk '{print $9 ": " $5}'