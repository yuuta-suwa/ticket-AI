# Third-party services
| Service | Role | Data | Where configured |
|---|---|---|---|
| Supabase | DB/Auth/Edge | account + app data | env |
| Vercel | Web hosting/admin | request data | project |
| RevenueCat (+Apple/Google billing) | subscriptions | app user id, purchase status | SDK keys (public), webhook secret (server) |
| Expo Push / APNs / FCM | notifications | push token, message | server token |
| Google AdMob + UMP | ads (FREE only) | ad interaction, consent | app/unit IDs |
| OpenAI (or other LLM) | plain-language explanations only | structured deal summary, no PII | server key |
| Flight data provider(s) (mock now) | prices | search params | server key; **terms must be reviewed** |
No third-party analytics/crash vendor is enabled in production yet.
