> 更新：2026-10-25。現在の主仕様はBUSINESS_IMPROVEMENT_20261025.mdとOPERATING_CONTROL_V05.md。前回の3制約はv0.5.0のローカル制御で改修済み。以下の旧時点の未実装記述・状態・数値より、IMPLEMENTATION_STATUS.mdを優先する。実接続と市場実証は未完。

# 事前投資の資金制御｜v0.3.0
実装：AI_Company_OS/src/ventures.mjs と src/venture-cli.mjs。既存Companyと同じSQLite接続を利用。
顧客注文の台帳とは分離し、注文なしで事業仮説と投資枠を扱う。

## 実装した制御

- 初期はenabled=false、許可支出0円。資金方針はローカルの本人操作で明示する。
- 支出上限は累計の総支出＋未確定の予約。日替わり・方針更新で累計をリセットしない。
- 事業案に仮説・課題・主要指標・停止条件・判断期限・上限・根拠参照を登録。同じIDで内容を上書きしない。
- 活動中の実験数を制限し、全社・事業・実験の上限を予約時と開始直前に検査する。
- 一度に1つの外部費用処理だけ進める保守的な試作。実行中も追加支出を保留する。
- 操作対象、申告されたリクエストhash、費用上限、方針版を結び付ける。
- 方針変更、期限切れ、事業停止、全社停止後は新規の実行を開始できない。
- 実行中・結果不明は資金を保持。時間経過で未実行扱いにしない。
- 未着手だけ予約を取り消せる。結果不明は外部照会で確定してから実費へ。
- 実費が予約を超えても事実を記録し、次の支出を止める。本人による原因確認後も実額は残す。
- 外部費用参照は一意。参照は provider:account:live_or_test:charge_id 等の形式で正規化して使う運用。
- 収入や返金による自動の投資枠回復は行わない。費用返金の仕訳機能は今後の統合。

## 状態

事業：PROPOSED → ACTIVE → STOPPED。事業停止は顧客対応や契約解約の完了ではない。
操作：RESERVED → IN_FLIGHT → SETTLED。通信結果不明ならUNKNOWNを経てSETTLED。RESERVEDだけCANCELLEDへ進める。
IN_FLIGHTでプロセスが落ちても予約はDBに残り、追加支出を保留する。照合なしに開始をやり直さない。

資金の露出額＝SETTLEDの実費＋RESERVED/IN_FLIGHT/UNKNOWNの予約最大額。
未確定の実請求は予約最大額を超える可能性がある。これは接続先の課金上限を保証する仕組みではない。
不明な上限や無制限従量課金・自動更新契約を、そのまま実行できると解釈しない。
広告の平均日予算、API使用報告の遅延、将来支払を、実行アダプター側で追加管理する必要がある。

## CLI

Node.js 24以上でAI_Company_OSから実行。

~~~bash
node src/venture-cli.mjs status
node src/venture-cli.mjs policy < policy.json
node src/venture-cli.mjs propose < venture.json
node src/venture-cli.mjs activate < venture-id.json
node src/venture-cli.mjs reserve < operation.json
node src/venture-cli.mjs begin < operation-start.json
node src/venture-cli.mjs unknown < operation-reason.json
node src/venture-cli.mjs settle < operation-actual.json
node src/venture-cli.mjs cancel < operation-reason.json
node src/venture-cli.mjs stop < venture-reason.json
~~~

policyは同梱のPOLICY.example.jsonを参考にする。初期値は支出無効であり、値を変更しただけで実アカウントの権限が付与されることはない。
proposeの必須項目：id/title/hypothesis/customer_problem/success_metric/failure_rule/budget_yen/learning_deadline/evidence_refs。
reserve：id/venture_id/kind/ceiling_yen/target_ref/request_hash。kindはresearch/compute/hosting/ads/toolsのうち方針で許可されたもの。
begin：id/target_ref/request_hash。settle：id/actual_yen/provider_ref/source_ref。
unknown/cancel/stopはidとreason。reviewはid/source_ref/corrective_actionで超過の原因確認を残す。

## 正確な限界

これは認証済みのWeb APIではない。configurePolicyとreviewOverrunをAI用ツールとして公開しない。
予約と外部実行は未連結。外部APIや銀行残高に接続せず、証憑参照は本人入力。外部副作用のexactly-onceを保証しない。
request_hashは入力された文字列の照合だけ。実payloadをサーバー側でhashする機能は未接続。
既存eveのモデル呼出しや他のコードが本制御を通る統合は未実施。迂回する処理があれば会社全体の支出を防げない。
事業と既存注文の費用が同じ請求を参照した場合に、全体集計で二重計上しない連結が必要。
将来支払、広告請求の報告遅延、外貨、返金・会計仕訳、銀行着金、顧客の利用権・サービス終了は追加対象。
初期は1費用操作ずつのため処理量に限界がある。外部照合と障害回復が実証できてから並列化する。

仮説・成功指標・停止条件は現段階では自由記述の保存です。根拠の真偽や需要を自動判定する実装ではありません。テストはメモリ内・一時DBで実行し、実口座用データへサンプルを入れません。live/test/simulationの体系的な分離も実接続前の追加項目です。
