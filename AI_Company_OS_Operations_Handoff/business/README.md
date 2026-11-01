> 過去の研修商品候補と見本。確定事業ではありません。今回のAIによる商品選定では候補の1つとして扱い、主仕様は上位フォルダのAUTONOMOUS_BUSINESS_SPEC.mdを優先します。

# 最初の売上を作る実行パック｜改善版
更新：2026-10-24。先に ../AUDIT_AND_IMPROVEMENTS.md と ../IMPROVED_WORKFLOW.md を読んでください。

初期商品は、使用予定日の近い小規模営業・接客組織へ提供する「1職種・1テーマの現場研修パック」です。
10ページのPDFと編集原稿、3ロープレ、評価表、講師進行案、45分ヒアリング、範囲内の修正1回、30分の納品説明を提供します。
33,000円は最初の最大3件程度の有料検証価格案、55,000円は未検証の標準候補です。
顧客が買い、使い、継続する証拠は会話と成果物ではまだ確認できていません。

07_UNIT_ECONOMICS.json と unit_economics.py を更新し、制作等5時間と、失注分を含む獲得営業8時間を分けました。
この仮定では33,000円から残るのは2,812円で、税・固定費控除前です。実測の利益ではありません。

## 内容

- 01_BUSINESS_AND_FIRST_SALE.md：対象、価値、販売、見直し条件。
- 02_CUSTOMER_OFFER.md：公開前の商品説明案。
- 03_INTAKE_AND_ACCEPTANCE.md：面談、適合、発注と検収。
- 04_FULFILLMENT.md：提供工程と時間記録。
- 05_REVENUE_SYSTEM_SPEC.md：追加台帳の現状と今後の連結。
- 06_CLAUDE_CODE_REVENUE_PROMPT.txt：継続実装の参照先。
- 07_UNIT_ECONOMICS.json / unit_economics.py / 08_ECONOMICS_SCENARIOS.json：仮定と再計算。
- sample/Customer_Discovery_Training.pdf と .md：架空ケースの見本。実績ではない。
- SOURCES.md：一次情報。

最初は商談・証憑確認・最終送付を本人が担当し、AIが制作と記録を補助します。
顧客への送信、申込窓口公開、決済契約、販売は今回実行していません。
受注制御のコードは ../AI_Company_OS/src/revenue.mjs に追加済みです。本人のローカル操作用で、無認証の公開APIにしないでください。
