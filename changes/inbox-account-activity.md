### Added

- Collect incoming Bluesky, Mastodon and Threads mentions independently of posts created in OpenPost. Collect Google Business reviews, including anonymous and rating-only reviews, with durable pagination and account permission checks.
- Google Business owner replies use durable, serialized operations and expose moderation state separately from submission acceptance. Review collection preserves existing Inbox read and archive state.
- Web, mobile, API, CLI, SDK and MCP expose incoming mentions and reviews with matching filters, shared read state and inspectable action receipts. Mobile can explicitly select a fitted image copy for one account without replacing the original.
