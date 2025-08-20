# chord_to_degree
ja.chordwiki.orgのキーが明記されいるページのコード名をディグリーに変換（キー未表記ページは推定）

<br>
- 右下の「Ⅰ」ボタン「C」ボタンを押すとコード名とディグリーの切り替え
- 「推」ボタンを押すと手動でキーの推論ができる。
  - ただし、推論の精度はそこまでよくないのでそこは勘弁……
-「ｘ」ボタンは個別に設定されたキーを一括削除できます

キーの推論はAIに手伝ってもらった<br>

# インストール
[Tampermonkey](https://www.tampermonkey.net/) をインストールして、 https://greasyfork.org/ja/scripts/546170 ユーザースクリプトとしてインストールするのがオススメ！！<br>
自動更新してくれるから不具合を気にせず使えるし！<br>

どうしても上の方法が嫌な場合<br>
拡張機能としてインストール<br>
自動更新されないし、更新するときも上書きじゃなくてもとのを消してインストールし直さないといけないからめんどくさいけど！
## Chrome<br>
```
chrome://extensions/
```
<img src="https://raw.githubusercontent.com/Happy-come-come/chord_to_degree/refs/heads/main/img/install_chrome.png"><br>
拡張機能のページ(chrome://extensions/)にZIPファイルをドラッグ・アンド・ドロップすればOK<br>

## FireFox
```
about:addons
```
にZIPファイルをドラッグ・アンド・ドロップするんだけど、署名されてない拡張機能はデフォルトだとインストールできない。<br>
一応方法はあるんだけど、めんどくさいのでTampermonkey使うのがいいと思います！
