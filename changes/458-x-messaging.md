### Added

- Separate X OAuth2 authorization for legacy direct messages, preserving OAuth1 publishing, with signed event receipts and explicit operator budget controls for paid X Activity subscriptions.

### Fixed

- X messaging now shares durable REST quota admission across OAuth1 and OAuth2 and rejects send responses that lack a message ID.
