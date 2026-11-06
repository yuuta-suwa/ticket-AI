# LIFE STAGE 2.0 ワーク（ログイン不要・2アプリ）

共通ソース `src/` から、2つの独立したアプリを作ります。

| アプリ | 内容 | 保存キー（端末内） |
|---|---|---|
| A：統合版 `dist/integrated/` | 全メンバー向け＋コアメンバー向け | `life-stage2:integrated:v1` |
| B：全メンバー版 `dist/members/` | 全メンバー向けのみ（コアのコード・教材・画面はビルド時に削除） | `life-stage2:members:v1` |

- ログイン・メール認証・会員判定はありません。URLを開けばすぐ使えます。
- 記録はその端末・ブラウザの中だけに保存されます（サーバーには送りません）。端末間の同期はありません。バックアップ（JSON）と復元で移せます。
- **A はURLを知っている人なら誰でもコア向けワークを使えます。** コア教材を特定の人だけに見せる仕組みはありません。
- AI は、依頼文を作ってコピーし、各自のAIに貼り付ける方式だけです（アプリからの外部送信はありません）。

## コマンド
```
node apps/life-stage-2/build.mjs                  # dist/integrated と dist/members を作る（コアが残っていれば失敗する）
node apps/life-stage-2/tests/variants.test.mjs    # 2アプリの受入テスト（Playwright + Chromium が必要）
cd apps/life-stage-2/dist && python3 -m http.server 8080
#   → http://localhost:8080/integrated/  と  http://localhost:8080/members/
```

## ソースの書き方
- コア専用のコードは `src/app.js` の `//@core-begin` 〜 `//@core-end` の中に書きます。HTML 側は `<!--@core-begin-->` 〜 `<!--@core-end-->` です。
- 全メンバー版のビルドではこの範囲を削除します。そのあと `build.mjs` の `CORE_MARKERS`（コア教材の目印になる文字列）が配信物に残っていないかを検査します。
- アプリの種類（`__VARIANT__`）はビルド時に固定されます。URLや端末内の設定では切り替えられません。

## フォルダ
- `src/`：2アプリ共通のソース
- `build.mjs`：ビルドと検査
- `tests/variants.test.mjs`：受入テスト
- `legacy/`：旧ログイン版（変更前の本番）の配信ファイル。ロールバックと記録の移行に使います
- `supabase/`、`tests/rls.test.mjs`：旧ログイン版のDB定義とテスト。旧DBはそのまま保持します
- `docs/current-state.md`：変更前の調査
- `docs/HANDOFF.md`：完了報告、配備・切替・ロールバックの手順
- `docs/life-stage2-change/`：今回の仕様書
