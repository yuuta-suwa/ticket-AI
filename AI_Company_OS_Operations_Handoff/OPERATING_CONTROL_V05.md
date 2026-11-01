# v0.5.0 運営と実験の統合仕様
確認：2026-10-25。実装はAI_Company_OS/src/ventures.mjs。別の未接続台帳を作る代わりに、既存の資金正本へ追加した。

## 状態
事業：PROPOSED→ACTIVE（実験）→OPERATING（稼働）→EXITING（履行と撤退処理）→CLOSED。
ACTIVEの件数だけを実験数に数える。OPERATINGへの登録には責任者、runbook、受入・SLOの参照が必要。
未確定の実験費用や未確認の超過があれば登録できない。別サービスの異常があれば追加登録も保留。
登録は本番公開でも需要の検証でもない。原文参照は本人が入力した記録。

## 資金
EXPLOREは従来の実験期限・投資額を使う。
RUNは事前に確保したoperating_grantsの期間、上限、費用種類、対象リソースを使う。
既定はRUN上限0、分離許可false。本人の方針と具体的な保護枠がなければ使用しない。
保護枠の未使用分を全社の資金露出へ加え、研究費の余力として使わせない。

全社露出＝記録した実費＋未確定操作の保守的な予約＋未使用の運営保護枠。
RUNの予約が増えた分だけ保護枠の未使用分が減り、同じ金額を二重計上しない。
保護枠が期限切れでも、将来の請求が解決するまで自動解放しない。
未使用分の解放は、全操作の照合と将来債務がないことの根拠を要求する。
新しい期間の枠を追加しても、過去の実費は全社累計から消えない。売上・返金で投資枠を勝手に回復させない。

## 結果不明の分離
未知結果はUNKNOWNのまま保持し、EXPLOREは停止。
RUNの継続には、以下の全条件を要求する。
- 本人の方針が分離運転を許可。
- 異常になる前に運営枠と対象リソースが確保済み。
- 不明操作の外部上限を本人が根拠・期限付きで記録。
- 保守を許可する運営枠IDが明示され、不明操作と同じサービスではない。
- 保護枠と不明操作の上限を合計しても全社上限内。
- 未確認の実費超過、実行中操作、全社停止等の制約がない。

上限記録で保留金を減らすことはできない。期限切れでも保留金は残り、分離運転は止まる。
上限情報は推測の見積りやAIの宣言では不十分。実接続ではproviderの課金上限等を確認する認証済み経路が必要。
現在は本人のローカル入力であり、その根拠の真正性を自動検証していない。
全社資金や共通認証が危険なら全社停止を維持し、別レーンという理由で迂回しない。

## 成長の可否
growthReadiness()は、全社方針、停止、資金、未照合に加え、稼働サービスごとの最新観測を参照する。
観測の鮮度とサンプル、SLO、重大障害、対応期限超過、費用照合、余力、運営資金を確認。
日付の古い観測が後から届いても、新しい異常観測を上書きしない。観測IDの変更再利用を拒否する。
不足時は新規実験の開始、研究費の予約・実行を止める。指定された保守・修正のRUNは別の条件で判定する。
商業計画にもoperating_readinessを表示。計画が揃うことと、成長の可否と、実行権限を区別する。

健康サンプルは顧客数ではない。監視プローブや運営観測は実購入の証拠として使わない。
現在は手動・合成の観測を使うローカル制御で、実監視が接続済みではない。
IMPROVEは業務上の優先レーンとして定義。新機能開発の独立した資金・スケジューラー実装は今後の統合。

## CLI
従来の本人用venture-cli.mjsへ以下を追加。JSONを標準入力で渡す。
- operate：idとdelivery_owner/support_owner/runbook_ref/acceptance_ref/slo_ref/health_ttl_ms。
- run_budget：venture_id、id、limit_yen、valid_from/valid_until、allowed_kinds/allowed_targets、source_ref/isolation_ref。
- health：venture_id、id、observed_at/source_ref、slo_met/costs_reconciled/spare_capacity、critical_incidents/overdue_support/samples。
- risk_bound：不明操作のid、upper_bound_yen、source_ref/expires_at、allowed_run_grants。
- close_budget：運営枠idとsource_ref。
- close_service：EXITINGの事業idと責任解消のsource_ref。
RUN予約はreserveへ lane=RUN と grant_id を指定。EXPLOREは従来どおり。
時刻は明示的なタイムゾーン付きで入力。内部保存はUTC、UIは利用者のタイムゾーンで表示する。

このCLIをそのままAIやHTTPへ公開しない。特に方針・枠作成・分離確認・超過確認・責任解消は所有者の操作。
実費・観測・上限の自動確認、権限の固定、実payload hash、外部実行前の最新検査をアダプターで接続する。

## 検証
test/service-operations.test.mjsの27試験と既存82試験、合計109件成功。
scripts/audit-operating-gaps.mjsは前回の3制約を修正後の状態遷移で確認し、examples/operating-gap-audit.jsonへ出力。
前回の出力はexamples/operating-gap-audit-v0.4.0.jsonに保持。数値はすべて架空例。
DB追加移行は既存レコードとEXPLORE再送hashを維持。実データ適用前にはバックアップを作る。
実外部接続、高並行実行、本人認証、実監視、実顧客満足、継続利益は今回の合格範囲に含めない。

次期枠の自動準備は未実装。将来は、本人が事前承認した額・周期・対象・総上限を決定的な処理で適用し、通常更新を毎回の企画承認にしない。AIが裁量で枠を作り増額する権限とは分離する。
