# Account deletion
In-app: Account → Delete account → info + subscription notice → confirm → `delete-account` Edge Function (JWT-verified, rate-limited, `confirm:true`) → `delete_user_data(uid)` (explicit deletes + anonymise audit/cost rows) → `auth.admin.deleteUser` → local cache wipe → login.
Web: `/account-deletion` — email one-time code (proves ownership) → same function. URL for Google Play "Account deletion" field.
Subscriptions are NOT cancelled by deletion (Apple/Google bill); both UIs say so and link to store management.
Verified by tests: `tests/src/rls.test.ts › Account deletion`, `packages/api-client demo delete`.
