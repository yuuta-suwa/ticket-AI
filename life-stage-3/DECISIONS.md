# DECISIONS（Gate-0 技術記録）

> このリポジトリは公開されているため、ここには技術的な判断と検証の記録だけを置く。
> 事業・契約・会員・金額に関わる決定（D-01〜D-12 の本文）は、非公開の引き継ぎパック側の DECISIONS.md で管理する。

## 確定（2026-11-06）
- 構成：domain → application（ports）→ adapters/http（標準Request/Response）→ adapters/sites → web
- 本人の識別は内部UUID（users.id）。認証済みのメールは正規化して紐付ける
- 会員状態：`pending → active → suspended / cancelled`（cancelledは終端）。active以外は会員機能に入れない
- D1にはRLSが無いため、全リポジトリで ownerId を必須にし、他人のデータを取得する経路を作らない
- 状態変更・初代管理者の付与は、監査ログと同じトランザクション（D1 batch）で記録する
- バックアップ：管理者専用のJSONエクスポート＋SHA-256照合値。データが空のサイトにだけ復元できる（docs/BACKUP.md）

## 暫定（Sitesの実機確認で変更し得る）
- 接続名：D1 `DB` / R2 `FILES`（`.openai/hosting.json`。project_id は Sites が付与する）
- 実行形式：Workers互換の `export default { fetch }`（公式スターターの形式は文書化されていない）
- 画面：Gate-0ではビルド不要のHTML。React＋TypeScriptへの移行はフェーズA（A01）で、スターターの形式を確認してから行う
- 初代管理者：ADMIN_EMAILS に載っていて、有効な管理者が0人の時だけ（2人目以降の付与UIはA03）
- 否認：pending → cancelled として扱う（仕様の状態に「rejected」が無いため）
- 日本語氏名ヘッダーの符号化：百分率エンコード / UTF-8 / そのまま、のどれでも読めるようにしてある

## 未決定・ブロッカー
| ID | 内容 | 必要なこと |
|---|---|---|
| D-01 | LIFE STAGE 1.0 のコード | 所在の確認（2.0 は `feature/life-stage-2` にある。Supabase版のため、ロール設計の考え方だけを参照） |
| D-07 | 本番バックアップの保管先 | 暗号化した保管先の決定 |
| D-09 | Sites実機互換 | iMacのデスクトップアプリで実施する（docs/GATE0.md の確認項目） |
| — | データ保存地域 | help.openai.com で確認（このセッションからは読めない） |

## S00 チェックリスト（guide/05）
| ID | 状態 | 証跡 |
|---|---|---|
| S00-01 環境・既存資産 | 済 | Node 22.23 / npm / Git。2.0を確認、1.0は未発見 |
| S00-02 公式ドキュメント・構成選定 | 済（スターター形式は未公開） | learn.chatgpt.com/docs/sites/* |
| S00-03 HOME・/health・型検査 | 済 | `npm run typecheck`、`npm test`、`/health` |
| S00-04 サインイン・pending/active | ローカル済／**実機未** | test/worker.test.ts |
| S00-05 D1保存・再ログイン復元 | ローカル済／**実機未** | test/worker.test.ts、test/smoke.mjs |
| S00-06 B→AのID推測アクセス拒否・管理権限 | ローカル済／**実機未** | test/worker.test.ts |
| S00-07 R2 本人取得・他人禁止 | ローカル済／**実機未** | test/worker.test.ts、test/smoke.mjs |
| S00-08 Sites互換チェック・保存・公開URL | **未** | iMacで実施 |
| S00-09 運用費・利用枠・バックアップ | バックアップ済／利用枠は**実機未** | docs/BACKUP.md、test/backup.test.ts |

**Gate-0判定：未完了**（S00-08と実機確認が残っているため、「Sites対応完了」とはまだ言わない）

## 実機ゲートの合格記録（実施時に記入）
| 日時 | アカウントA/Bの種別 | URL | Gitコミット | 結果 | 失敗した操作 | 利用枠の変化 |
|---|---|---|---|---|---|---|
| | | | | | | |
