# Data retention
| Data | Retention | Deletion trigger |
|---|---|---|
| Account, profile, preferences | While account exists | Account deletion (`delete_user_data` + auth user removal) |
| Watchlist, saved deals, search history | While account exists | Account deletion; user can remove items any time |
| Push tokens | Until sign-out / invalid token / deletion | `DeviceNotRegistered`, sign-out, deletion |
| Notification history/jobs | `[PROPOSED: 90 days]` — add a purge cron | Deletion |
| Entitlements/subscription records | While account exists | Deletion (store-side purchase records remain with Apple/Google) |
| price_snapshots, recommendations, model_outcomes | Aggregate, not user-linked; retained for model improvement | n/a |
| cost_events / audit_logs | `[PROPOSED: 12 months]`; user reference nulled on deletion | Anonymised on deletion |
| rate_limits | 1 day (auto-purged in `rate_limit_hit`) | Auto |
Items in `[ ]` are proposals the operator must confirm and then implement as cron purges.
