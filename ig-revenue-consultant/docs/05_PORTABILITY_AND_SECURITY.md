# Claude / 外部ホストへの移植と保護境界

## 重要：ソースと実行基盤は別
元アプリはVinext + React + TypeScript + Cloudflare Workers + D1 + Drizzleで、Sitesのサインイン境界を利用している。元のサイトのURL、所有者ID、DB、セッション、暗号化鍵、接続キーをZIPで移すことはできない。ソースにはそれらの実値を含めていない。

## 選択肢
| 方法 | 使う目的 | 必要な作業 |
|---|---|---|
| 既存コードでUI刷新 | 推奨の最初の段階 | ローカルで起動し、現行ルールを保って相談体験を実装 |
| 既存Sitesへ変更を戻す | 現行のURL/データを維持 | 対応するSitesの公開権限とフローがある環境で、正しいソースを同期・ビルド・公開 |
| 別Cloudflare環境へ移す | 自分の管理下で独立運用 | 正規のユーザー認証、D1作成/移行、秘密設定、ドメイン/Origin、公開先の検証 |
| 別のサーバー基盤へ移す | 既存資産を活かした本番化 | 認証・DB・暗号化のアダプター置換。実装前に差分とデータ移行を文書化 |

コードを開いた後に別フレームワークへ全面移植する必要があるとは決めつけない。まず既存Vinext/Reactで再現し、移植が必要ならプロダクトのドメインとUIを再利用する。

## 1. 認証ヘッダーを外部で信用しない
`app/chatgpt-auth.ts` はSitesの信頼できるゲートウェイが渡す `oai-authenticated-user-id` とメールを読む。元のゲートウェイ以外の公開サーバーで、クライアントが指定する同名ヘッダーを信用すると、なりすましにつながる。

外部本番では、署名検証済みセッションまたは正規のOIDC等を使う。所有者IDはサーバーで確定し、クライアントのownerIdやemailから決めない。既存ヘッダーのモック認証は、本番無効をCIで検証できるローカル専用の隔離モードに限定する。認証が無いなら書込みAPIは拒否する。

## 2. 開発設定
`source/.openai/hosting.json` は元Siteの識別子を含む元ソース。新規の公開先へそのまま登録しない。`scripts/execution-profile.mjs`、`scripts/run-framework.mjs`、`vite.config.ts` は元環境の管理Linux/portableを区別する。ローカルでの新たな環境設定は無視対象に保存し、元の資格情報があると仮定しない。

依存導入は既存ロックを優先。独自のグローバルツールへ依存したコマンドをREADMEに残さない。通常のローカルで必要なら `package.json` のpnpm・Node要件を満たし、差分を記録する。

元のコマンド例（外部環境での完走は未確認）：
```sh
cd source
pnpm install --frozen-lockfile
pnpm dev
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/domain.test.mjs
python3 tests/persistence_test.py
pnpm build
```

元環境ではNode v24.22.1でテストを再確認した。ソースenginesは>=22.13.0、packageManagerはpnpm@11.25.0。バージョンを無差別に最新へ置換しない。

## 3. DB
`drizzle/0000_rapid_franklin_richards.sql` と `0001_windy_morlun.sql` がある。6テーブル：`revenue_workspaces`、`revenue_connections`、`revenue_ai_usage`、`revenue_ai_jobs`、`revenue_audit_log`、`revenue_external_operations`。

JSON State v1は所有者IDに紐付く。別ホストの認証IDは同じとは限らない。移行は明示的な利用者対応表と所有権確認が必要。ローカルD1のダミーdatabase_idを、そのまま本番の接続先にしない。適用済みマイグレーションを繰り返して実行しない。

ユーザーデータを持ち出す必要があれば、本人がアプリの正規バックアップを取得する。本ZIPには入っていない。復元時も旧承認・公開状態・接続情報の再照合が必要。

## 4. 暗号化と接続
`CREDENTIAL_ENCRYPTION_KEY` はサーバー専用の32バイトBase64鍵。元の値は含まない。暗号化済みデータの認証コンテキストには利用者IDとproviderが含まれるため、鍵だけを移しても所有者IDの変化で復号できない場合がある。

元の鍵を上書きしない。新ホストの接続は、本人が正規に再接続する方法を初期方針にする。キーをログ、JSONバックアップ、URL、クライアントJS、Gitへ出さない。

## 5. Instagram
Meta公式APIのInstagram Login方式。必要なアプリ、プロアカウント、権限、トークン、有効期限、素材仕様は本人側で成立する。公開機能の実試験は、対象アカウントと完成内容について実際の承認を得て行う。モックの成功を実公開の成功と混同しない。

## 6. コスト
ユーザーが有効にするまで実際の有料生成を止める。日次上限は回数であり、金額保証ではない。Web検索、モデル、出力量などの費用を説明する。開発用のClaude契約と、アプリのAI利用料金は別に確認する。

## 7. 公開の境界
この一式から作業を始めたClaudeは、元SiteのGit書込トークンやサービスアクセストークンを持っていない。値をこの文書へ追記する運用はしない。まずローカル完成と移設差分を提出し、正規のサービス設定で必要な権限を整える。元のサイト・DB・暗号鍵を削除せず、非公開のアクセス範囲を維持する。
