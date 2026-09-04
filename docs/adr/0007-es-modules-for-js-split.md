# main.jsの分割にES Modulesを採用する

`main.js`が800行を超え機能ごとの境界が分かりにくくなったため、`public/js/`配下の機能ごとのファイルに分割した。CSS分割（`public/css/*.css`を`<link>`で列挙し、グローバルなクラス名で疎結合にする方式）と同じ発想で複数の classic `<script>` タグに分ける案もあったが、JS側は`selectedItemId`や`enterToSendEnabled`のようにファイルをまたいで直接参照される可変状態が複数あり、暗黙のグローバル共有のままではファイルを分けても依存関係が読み取れない。そのためES Modules（`<script type="module">` + `import`/`export`）を採用し、モジュール間の依存を`import`文で明示することにした。Vite開発サーバーはバンドルせずネイティブESMをそのまま配信できるため、追加のビルド設定は不要。

## Considered Options

- classic scriptの並列読み込み（CSS分割と同方式）: 書き換えは最小限だが、ファイルをまたぐ状態共有が暗黙のグローバル変数のままになり、分割の目的（見通しの良さ）を十分に達成できないため見送った。
