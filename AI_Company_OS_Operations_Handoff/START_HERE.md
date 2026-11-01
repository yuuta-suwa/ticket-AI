# AI会社OS｜統合再構築版
更新：2026-11-01。コードv0.6.0（最新の到達点は DELIVERY_REPORT_2026-11-01.md）。設計改訂2026-10-26-rebuild。FRIDAY連携は対象外。

主目的は、AIが国内外の市場から機会を見つけ、顧客・商品・価格・経路を選び、開発・販売/収益化・提供・運営・改善を実証すること。
YouTube・Instagramを含む多様な情報源、海外向け動画、アプリ、サービス、商品、サブスク、広告等を対象にする。
本人は商品を先に決めず、目的・資金・権限・禁止領域と重大例外を判断する。

## 読む順
1. AI_COMPANY_MASTER_BLUEPRINT.md：事業・会社・組織・業務・収益・運用の統合設計。
2. SYSTEM_IMPLEMENTATION_BLUEPRINT.md：データ、API、状態、実行、スマホ、指標、復旧の実装契約。
3. BUSINESS_AND_SYSTEM_REVIEW.md：完成版の分析、反証、リスク、実装と市場実証の限界。
4. IMPLEMENTATION_STATUS.md：確認した実装、今回の変更、未接続。
5. CLAUDE_CODE_START.txt：継続実装の全文指示。

## 補助の現行仕様
- MARKET_RESEARCH_SPEC.md：収集対象、原本、偏り、取得範囲。
- OPERATING_CONTROL_V05.md：現行の運営保護・未知費用・状態の詳細。
- ROLE_EXECUTION_CONTRACTS.md：42役割の契約とruntimeへの反映先。
- REBUILD_ACCEPTANCE_MATRIX.json：新要件60件の受入条件。2026-11-01時点でLOCAL_PASS 56／部分3／NOT_RUN 1（証拠と確認範囲付き）。
- review/：検証ログ、役割の反映記録、架空の原価例と検算。

## 今回の変更
統合設計と実装契約を再構築し、完成版を経営・顧客・財務・技術・反証の観点で評価。
42役割の実際の指示文と、役割文書・Obsidian見本の計126ファイルへ同じ契約を反映した。
新しい外部道具・認証・SNS取得・スマホ本番・実決済の機能を実装した意味ではない。
初期支出は無効・0円。実顧客、視聴・購入、継続利益は未実証。

## 検証
AI_Company_OSでNode.js 24以上を利用。
依存がなければnpm ci --ignore-scriptsを先に実行。
~~~bash
npm test
npm run typecheck
node scripts/audit-operating-gaps.mjs
~~~
設計と架空の計算例の確認は、このフォルダで実行。
~~~bash
python3 review/verify_design.py
~~~
ローカル109試験の結果と新要件60件の未実行状態を混同しない。

## Claude Codeへ渡す
このZIPを解凍したフォルダをClaude Codeで開き、次だけを伝える。
「CLAUDE_CODE_START.txtを全文読み、現行の実装と試験を保全して、統合仕様に沿った一事業の調査・提供・運営の接続から着手してください。」

旧資料は履歴・既存の個別仕様。現在の設計と状態は上記の文書を優先。
