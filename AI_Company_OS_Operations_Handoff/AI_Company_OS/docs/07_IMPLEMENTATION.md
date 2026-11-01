# 実装・検証・残作業
## ファイルの責任
config/organization.json：社員台帳。42職務、所属、上司、使命、成果物、指標。
scripts/generate-organization.mjs：社員別のeve定義と職務書を再生成。
agent/agent.ts：AI社長。subagents以下に部長、課長、担当を階層化。監査役はAI社長から呼出せる専門職として配置するが、組織台帳ではオーナー直属。
agent/lib/tools.ts：固定社員IDを業務台帳の操作に結び付ける。
src/company.mjs：SQLite、権限、タスク状態、検収、履歴、模擬費用、検索、スコアカード、ノート出力。
src/demo.mjs：固定ロジックで25件を回す。LLMは呼ばない。
src/cli.mjs：本人のローカル操作。
test/company.test.mjs：重要な制御の試験。

## データ
employees / control / projects / tasks / dependencies / artifacts / evidence / messages / ledger / events / exports。
eventsは説明可能な業務イベントであり、モデルの非公開の内部思考過程を保存するものではない。
台帳とメッセージに利用者入力が含まれるため、本番の匿名化・保存期限は別途設計する。

## 道具
company_status、task_context、issue_work、claim_work、submit_work、review_work、message、record_evidence、search_memory、scorecard、pause_company、recover_work、create_project。
社員の階層に応じて道具を減らす。監査役に制作・納品、担当に他社員への発行は与えない。

## 検証の読み方
npm test：業務制御の実行検証。
npm run typecheck：TypeScript定義の整合。
eve info --json：eveが階層と道具を読み込めることの確認。
後二者が成功しても、モデルでの自律協働や市場での収益性を検証したことにはならない。

## 本番までの順序
1. モデル接続を本人の環境で設定し、一部署の指示→納品→検収を実証。
2. 上司と部下の再呼出し、監査役検収、依存成果物の引継ぎを実証。
3. 永続タスクの起動と待機を一つのオーケストレーターへ統合。現在は発行とeve呼出しが別操作。
4. 必要な会話の取込と削除・保持期限、プロジェクト単位の権限を追加。
5. 一事業、一販路、一つの提供方法に限定して接続。
6. 外部操作ID、Webhook重複防止、未知結果の照合、決済と提供の例外を試験。
7. 実費と顧客品質の基準を満たしてから定期運転・複数事業へ進む。

## 本番向けに必要な項目
認証とアクセス制御、TLS、機密情報管理、複数事業間の分離、PostgreSQL等への移行、永続キュー、全社実費管理、障害監視、復元試験。
UIは会社・部署・社員・仕事・知識・収支・例外の7画面を想定する。今回はCLIとObsidianを実装し、独自のWeb運営画面は未実装。

## 運営画面の要件
会社：目的、進捗、費用、例外。
部署：目標、担当課、受ける仕事、納品状況。
社員：所属、上司、職務、道具、現在の仕事、評価。
仕事：入力、責任者、依存、成果物、検収、履歴。
知識：出典、適用条件、反例、更新時期。
収支：売上、返金、予約費用、確定費用、採算。
例外：異常、停止対象、必要な具体判断、復旧記録。

