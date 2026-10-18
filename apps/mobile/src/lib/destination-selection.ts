export type KnownDestination = {
  id: string;
  platform?: string | null;
};

export type StoredDestinationRendition = {
  social_account_id?: string | null;
  platform?: string | null;
};

export type UnavailableDestination = {
  accountId: string;
  platform: string;
};

/**
 * Split a destination selection into ids the workspace can still publish to
 * and ids whose account is gone (disconnected) but still has an authored
 * rendition. Unknown ids never survive into `selectable`, so callers can send
 * it to the rendition upsert without tripping the server's active-account
 * check, while `unavailable` keeps every dropped id visible for an explicit,
 * removable drawer row instead of a silent delete.
 */
export function reconcileDestinationSelection(
  selected: Iterable<string>,
  known: readonly KnownDestination[],
  renditions?: readonly StoredDestinationRendition[] | null,
): { selectable: string[]; unavailable: UnavailableDestination[] } {
  const knownIds = new Set(known.map((account) => account.id));
  const platformByAccount = new Map<string, string>();
  for (const rendition of renditions ?? []) {
    if (rendition.social_account_id && rendition.platform) {
      if (!platformByAccount.has(rendition.social_account_id)) {
        platformByAccount.set(rendition.social_account_id, rendition.platform);
      }
    }
  }
  const seen = new Set<string>();
  const selectable: string[] = [];
  const unavailable: UnavailableDestination[] = [];
  for (const accountId of selected) {
    if (seen.has(accountId)) continue;
    seen.add(accountId);
    if (knownIds.has(accountId)) {
      selectable.push(accountId);
    } else {
      unavailable.push({ accountId, platform: platformByAccount.get(accountId) ?? "" });
    }
  }
  return { selectable, unavailable };
}
