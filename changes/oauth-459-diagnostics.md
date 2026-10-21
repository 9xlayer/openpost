### Fixed

- Explain which stage of a social account connection failed and preserve safe provider error codes and trace IDs in Settings and server logs, without exposing tokens or raw provider responses. (#459)
- Accept a single wrapped Instagram direct-login profile and keep its professional account ID separate from the authorization subject. Preserve selected destination IDs when saving connections for every provider.
