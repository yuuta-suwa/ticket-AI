> 統合再構築2026-10-26：現在の主仕様はAI_COMPANY_MASTER_BLUEPRINT.mdとSYSTEM_IMPLEMENTATION_BLUEPRINT.md、評価・出典はBUSINESS_AND_SYSTEM_REVIEW.md、実装状況はIMPLEMENTATION_STATUS.md。本資料は既存の個別仕様・履歴として参照する。

# 改訂時に確認した一次情報
確認日：2026-10-24。公式仕様の確認であり、本システムとの実接続試験ではない。

| 参照 | 確認した内容と設計への影響 |
|---|---|
| https://docs.stripe.com/webhooks | 公開HTTPS受信先、署名検証、重複・順不同を前提にする。管理画面の私有接続とは分離 |
| https://docs.stripe.com/api/idempotent_requests | 再試行時の同一操作識別。実APIの仕様を確認し、結果不明で別IDを作らない |
| https://docs.stripe.com/billing/subscriptions/overview | 定期課金と状態遷移。契約状態と全請求の支払完了を同一視しない |
| https://support.google.com/google-ads/answer/10486637?hl=ja | 平均日予算と実際の費用上限は異なる。内部投資枠と媒体側請求制御を分ける |
| https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/ | 申請APIがあっても審査・必要情報は別。申請成功とリリース・事業成功を区別 |
| https://developer.apple.com/app-store/review/guidelines/ | 類似・差異の乏しいアプリの量産を流通戦略の前提にしない |
| https://developers.google.com/android-publisher/edits | 既存アプリの更新APIと、初回登録・公開同意などの作業を分ける |
| https://support.google.com/adsense/answer/9724?hl=ja | 広告掲載収益には独自コンテンツ等の要件がある。掲載しただけで収益化できるとしない |
| https://www.anthropic.com/research/building-effective-agents | 自律性の費用と誤りの累積に注意し、試験・観測・制限を入れる。現行SDKは導入版の資料を別に確認 |

競合の存在、APIの存在、コード試験は、当社商品への需要や継続黒字化の証拠ではない。

## 運営と新規開発の再点検
https://sre.google/workbook/error-budget-policy/
https://sre.google/workbook/implementing-slos/
信頼性目標と測定に応じて新機能と修正を配分するための設計参考。数値を本事業へそのまま適用しない。
https://support.google.com/contributionpolicy/answer/7400114
Google Mapsのレビュー規約。実際に使う媒体の規約を別途確認。
