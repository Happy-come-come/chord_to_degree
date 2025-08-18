# ChordWiki Degree Extension Build Instructions

このディレクトリには、ChordWiki UserScriptをブラウザ拡張機能にパッケージングするためのスクリプトが含まれています。

## � ディレクトリ構造

```
chord_to_degree/
├── chord_to_degree.js      # メインのUserScriptファイル
├── icons/
│   └── 128.png             # 拡張機能アイコン
├── build/                  # ビルドスクリプト類（このディレクトリ）
│   ├── package.bat         # Windows用バッチファイル
│   ├── packaging.ps1       # PowerShellスクリプト
│   ├── pakaging.sh         # Bash/シェルスクリプト
│   └── BUILD_README.md     # このファイル
├── manifest.json
├── LICENSE
└── README.md
```

## �📦 パッケージング方法

⚠️ **重要**: `build/` ディレクトリ内でスクリプトを実行してください！

### Windows環境

#### 方法1: バッチファイル実行（推奨）
```batch
cd build
package.bat
```

#### 方法2: PowerShellスクリプト直接実行
```powershell
cd build
powershell -ExecutionPolicy Bypass -File packaging.ps1
```

### Linux/macOS環境

```bash
cd build
chmod +x pakaging.sh
./pakaging.sh
```

## 📁 出力ファイル

パッケージング後、`build/dist/` フォルダに以下のファイルが作成されます：

- `chordwiki-degree_chrome_v1.0.0.5.zip` - Chrome用拡張機能
- `chordwiki-degree_firefox_v1.0.0.5.zip` - Firefox用拡張機能  
- `chordwiki-degree_complete_v1.0.0.5.zip` - 開発用完全パッケージ

## 🔧 パッケージング処理内容

1. **UserScriptヘッダの削除**: `../chord_to_degree.js` から `// ==/UserScript==` までの行を削除
2. **manifest.json の生成**: Chrome（v3）とFirefox（v2）用のmanifestを自動生成
3. **アイコンファイルのコピー**: `../icons/128.png` を `icons/` フォルダにコピー
4. **Zipファイルの作成**: ブラウザ別にパッケージング

## 📋 ファイル構成

```
temp/ (一時フォルダ)
├── content.js          # UserScriptヘッダを削除したメインスクリプト
├── manifest.json       # ブラウザ別のmanifest
├── icons/
│   └── 128.png         # 拡張機能アイコン
├── LICENSE             # ライセンスファイル（存在する場合）
└── README.md           # READMEファイル（存在する場合）
```

## 🚀 拡張機能のインストール

### Chrome
1. `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. 解凍したフォルダを選択

### Firefox
1. `about:debugging` を開く
2. 「この Firefox」をクリック
3. 「一時的なアドオンを読み込む」をクリック
4. manifest.json ファイルを選択

## ⚙️ カスタマイズ

### バージョン番号の変更
各スクリプトファイル内の `VERSION` 変数を修正してください：

- `packaging.ps1`: `$VERSION = "1.0.0.5"`
- `pakaging.sh`: `VERSION="1.0.0.5"`

### 拡張機能名の変更
`EXTENSION_NAME` 変数を修正してください：

- `packaging.ps1`: `$EXTENSION_NAME = "chordwiki-degree"`
- `pakaging.sh`: `EXTENSION_NAME="chordwiki-degree"`

## 🐛 トラブルシューティング

### PowerShell実行ポリシーエラー
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Bashスクリプトが実行できない
```bash
chmod +x pakaging.sh
```

### Zipコマンドが見つからない（Linux）
```bash
sudo apt-get install zip  # Ubuntu/Debian
sudo yum install zip      # CentOS/RHEL
```
