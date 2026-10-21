### Changed

- Composer destination checks keep the previous readiness answer usable while a refresh runs. Readiness warnings and publish actions no longer disappear and reappear during ordinary typing, and submitting still resolves accuracy first.
- Required destination pickers for multiple accounts now load together instead of one account at a time, and one account's option request can no longer discard another account's result.
- Capability resolution no longer cancels the in-flight request immediately while typing, so completed provider work can populate the capability cache.
- Capability resolution sends per-account segment overrides only for accounts that actually customize text, media, alt text, a poll, or an AI attachment requirement.
- Destination capability resolution runs a bounded number of accounts in parallel, preserving response order and the first error in request order.
- One resolve request now shares provider-scoped readiness facts across destinations and operations, caches the capability catalog, and reuses certification digests for canonical capabilities.
- Provider capability cache keys follow the inputs each adapter declares, so unrelated destination settings no longer re-fetch provider state. Entries are bounded.

### Fixed

- A capability cache write failure no longer marks a verified destination as incompatible.
- Text-card projection no longer rewrites caller-owned segments, which would race when destinations resolve together.
