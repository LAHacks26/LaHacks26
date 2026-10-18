# Anonymous saves and shares

The user approved anonymous browser ownership for the MVP on 2026-10-18. Google sign-in and account linking are deferred. The existing database schema supports this without a migration.

## What the user gets

- Save keeps the current recipe, tips, undo history, ready-by deadline, and up to 200 chat messages in My Kitchen. `/my/[savedId]` loads only for the owning browser. Recipe and chat changes autosave after one second.
- Share first saves current changes, then returns an unguessable `/s/[slug]` link. Repeated sharing returns the same link. Anyone with the link can read the current recipe, including later saved edits and tips. Chat, undo history, deadline, owner identity, and private saved IDs are excluded from the public response.
- Make it mine opens an independent, unsaved draft. Saving resolves the public share slug on the server and records the parent in `forked_from_id`. The caller cannot supply a private parent ID.
- Allergy settings apply in the browser immediately and sync to its anonymous user row. Initial local/server lists merge; explicit changes replace the list. Failed sync retains local choices with a retry action. Supported inputs are at most 30 distinct names, each 1–80 characters after trimming.

## Ownership and request checks

The server creates a random UUID v4 bearer cookie only on save creation or allergy sync: `__Host-saffron_uid` in production and `saffron_uid` in development. It is HttpOnly, SameSite=Lax, host-only, has path `/`, expires after one year, and is Secure in production. The production prefix prevents sibling domains from planting a Domain cookie; production never falls back to the development name. `users.google_sub` contains `anon:<SHA-256 digest>`; raw bearer credentials never appear in response JSON, localStorage, or user identifiers. An unknown caller-provided cookie is never adopted when creating a user.

Every private recipe/chat query includes the cookie-derived owner. Absent, unknown, and other-owner saved IDs receive the same private 404. Public access requires the deliberate 192-bit random share slug, not the private ID. Private API responses are `no-store`. Mutations require the exact configured Origin, reject cross-site fetch metadata, validate JSON and size limits, and reject caller ownership overrides. Production fails closed unless `APP_URL` is a valid HTTPS URL. Forwarded host headers never establish a trusted Origin.

Create and allergy requests hold a named Web Lock across the complete request/response. This serializes first-use identity creation across tabs. A current browser supporting Web Locks on HTTPS or localhost is required; unsupported environments receive a save error before any identity request. `APP_URL` must match the public origin, including the local development port. `npm run dev` is the local development entry point; a production-mode server requires HTTPS configuration for mutations.

Recipe, undo, deadline, and chat writes are transactional. Autosave includes an opaque `updatedAt` token preserving PostgreSQL microseconds. A stale token returns 409 without changing recipe/chat. Sharing keeps that token unchanged. The client serializes writes and includes newer changes made while a request is running before reporting the save complete.

## Recovery and limitations

- Clearing, losing, or expiring the cookie loses access to anonymous saves. Another browser/device, private window, or browser profile is a different owner. There is no recovery, account linking, logout, deletion, or share-revocation UI in this MVP. Anyone using the same browser profile can access its kitchen. Keep share links only for recipes intended to be public to their recipients.
- A share is a live read-only view, not an immutable snapshot. Changing the saved recipe changes what link holders see. Sharing does not expose private chat, but anything entered directly into recipe text or tips is part of the shared recipe.
- Pending saved recipe/chat changes are stored per tab in sessionStorage, tied to their server revision. They survive refresh and in-app navigation in that tab; a memory fallback covers in-app navigation if storage is blocked. They are restored only after an owner-checked read. If the server changed, the user chooses Save as new recipe or Reload saved version. A failed Save as new keeps subsequent changes and its separate-copy intent in recovery; reopening it requires an explicit retry and cannot silently update the original. Reload discards the pending draft. Closing a tab can lose unsynced work; the exit guard warns while changes are pending. Keep the tab open after a save error.
- A network timeout can occur after the server committed. Check My Kitchen before retrying initial creation to avoid duplicate saves. An unsuccessful initial creation may leave an unused anonymous user row without sending its cookie; cleanup is deferred. There is no claim of exactly-once creation under network failure.
- Chat text and line context move to database persistence on save. Transient AI-result attachments and version-specific Undo buttons are intentionally not reconstructed after reload; recipe undo history is retained.
- Browser interaction, actual PostgreSQL concurrency, and deployment acceptance still need live validation. Automated tests use mocked HTTP and a scripted driver that exercises actual generated Drizzle SQL. No production migration is needed or performed for this feature.

Before deployment, verify save → edit/autosave → reload → share in a separate browser profile → Make it mine → save fork; concurrent first-use tabs; immediate navigation during the debounce; two-tab conflicts; cookie-loss 404; and allergy sync failure/retry. Deployment and production migrations require approval.
