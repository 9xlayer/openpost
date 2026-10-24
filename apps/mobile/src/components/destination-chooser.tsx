// One destination chooser for the native post composer and Ideate.
//
// Both surfaces decide the same thing (which accounts a post goes to, with an
// optional saved Social Set), so they share this drawer body: the same
// checkbox rows, the same default-first set chips, the same loading, offline
// and error states, and a Done action that is disabled with an explanation
// when nothing is selected. Each screen keeps its own selection state and its
// own mutation owners; the composer passes its per-account text overrides
// through the optional row slots.

import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AccountAvatar } from "@/components/account-avatar";
import { NativeText as Text } from "@/components/native-text";
import { DelayedQueryPlaceholder, QueryNotice } from "@/components/query-state";
import { ThemeIcon } from "@/components/theme-icon";
import { BodyText, Button, ContentSection } from "@/components/ui";
import { orderedSocialSets, reconcileDestinationSelection } from "@/lib/destination-selection";
import { accountHandle, platformLabel } from "@/lib/format";
import { useNativeTheme, withAlpha } from "@/theme";

export type DestinationChooserAccount = {
  id: string;
  platform: string;
  account_username?: string | null;
  alias?: string | null;
  account_avatar_url?: string | null;
};

export type DestinationChooserSet = {
  id: string;
  name?: string | null;
  is_default?: boolean | null;
  accounts?: readonly { social_account_id: string }[] | null;
};

export type DestinationChooserRendition = {
  social_account_id?: string | null;
  platform?: string | null;
};

type CatalogQuery<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => unknown;
};

export function DestinationChooser({
  accounts,
  socialSets,
  selectedIds,
  activeSetId,
  renditions,
  notice,
  onApplySet,
  onToggle,
  onConfirm,
  rowAction,
  rowNote,
  expandedContent,
}: {
  accounts: CatalogQuery<readonly DestinationChooserAccount[]>;
  socialSets: CatalogQuery<readonly DestinationChooserSet[]>;
  /** Full selection in the order the user chose, including members whose account is gone. */
  selectedIds: readonly string[];
  activeSetId: string;
  renditions?: readonly DestinationChooserRendition[] | null;
  /** Extra notice shown with the catalog states, e.g. a readiness error. */
  notice?: ReactNode;
  onApplySet: (setId: string, accountIds: string[]) => void;
  onToggle: (accountId: string) => void;
  onConfirm: () => void;
  /** Optional per-row trailing action, e.g. the composer Edit/Hide affordance. */
  rowAction?: (accountId: string, selected: boolean) => ReactNode;
  /** Optional per-row note below the platform label, e.g. a readiness warning. */
  rowNote?: (accountId: string) => ReactNode;
  /** Optional content below a selected row, e.g. per-account text overrides. */
  expandedContent?: (accountId: string) => ReactNode;
}) {
  const theme = useNativeTheme();
  const { colors, typography } = theme.manifest;
  const catalogFailed = accounts.isError || socialSets.isError;
  const catalogPending =
    (accounts.data === undefined && accounts.isPending) ||
    (socialSets.data === undefined && socialSets.isPending);
  const catalogOffline =
    (accounts.data !== undefined || socialSets.data !== undefined) &&
    (accounts.fetchStatus === "paused" || socialSets.fetchStatus === "paused");
  const showOfflinePlaceholder =
    accounts.data === undefined &&
    socialSets.data === undefined &&
    (accounts.fetchStatus === "paused" || socialSets.fetchStatus === "paused");
  const { unavailable } =
    accounts.data === undefined
      ? { unavailable: [] as { accountId: string; platform: string }[] }
      : reconcileDestinationSelection(selectedIds, accounts.data, renditions);
  const accountsLoadedEmpty = (accounts.data?.length ?? 0) === 0 && accounts.data !== undefined;
  const retryCatalog = () => {
    void accounts.refetch();
    void socialSets.refetch();
  };

  return (
    <View style={styles.body}>
      {(socialSets.data?.length ?? 0) > 0 ? (
        <View style={styles.chipRow}>
          {orderedSocialSets(socialSets.data ?? []).map((set) => (
            <Pressable
              key={set.id}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSetId === set.id }}
              hitSlop={8}
              onPress={() =>
                onApplySet(
                  set.id,
                  (set.accounts ?? []).map((account) => account.social_account_id),
                )
              }
              style={({ pressed }) => [
                styles.chip,
                pressed && { opacity: 0.6 },
                {
                  backgroundColor:
                    activeSetId === set.id ? withAlpha(colors.primary, 0.15) : colors.surface,
                  borderColor: activeSetId === set.id ? colors.primary : colors.outlineVariant,
                },
              ]}
            >
              <Text
                style={[
                  typography.labelMedium,
                  { color: activeSetId === set.id ? colors.primary : colors.onSurface },
                ]}
              >
                {set.name ?? "Social Set"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <BodyText>Choose a saved set or fine-tune the accounts below.</BodyText>
      {catalogPending ? (
        <DelayedQueryPlaceholder pending shape="list" offline={showOfflinePlaceholder} />
      ) : null}
      {catalogFailed ? (
        <QueryNotice
          message={
            accounts.data !== undefined || socialSets.data !== undefined
              ? "Could not refresh every destination. Current destinations remain visible."
              : "Could not load your Social Sets and accounts."
          }
          retry={retryCatalog}
        />
      ) : null}
      {catalogOffline ? (
        <QueryNotice message="You are offline. Current destinations remain visible." offline />
      ) : null}
      {notice}
      {accountsLoadedEmpty && unavailable.length === 0 && !catalogFailed ? (
        <ContentSection>
          <BodyText>No connected accounts. Connect them in the web app first.</BodyText>
        </ContentSection>
      ) : (
        <View style={styles.accountList}>
          {(accounts.data ?? []).map((account) => {
            const selected = selectedIds.includes(account.id);
            return (
              <View key={account.id}>
                <View
                  style={[
                    styles.accountRow,
                    {
                      backgroundColor: colors.background,
                      borderColor: selected ? colors.primary : colors.outlineVariant,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => onToggle(account.id)}
                    style={({ pressed }) => [styles.accountSelection, pressed && { opacity: 0.65 }]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: selected ? colors.primary : colors.outlineVariant,
                          backgroundColor: selected ? colors.primary : "transparent",
                        },
                      ]}
                    >
                      {selected ? (
                        <ThemeIcon role="check" size={15} tintColor={colors.onPrimary} />
                      ) : null}
                    </View>
                    <AccountAvatar
                      name={
                        account.alias || account.account_username || platformLabel(account.platform)
                      }
                      platform={account.platform}
                      avatarUrl={account.account_avatar_url}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={[typography.labelLarge, { color: colors.onSurface }]}
                      >
                        {accountHandle(
                          account.account_username,
                          platformLabel(account.platform),
                          account.platform,
                          account.alias ?? "",
                        )}
                      </Text>
                      <BodyText>{platformLabel(account.platform)}</BodyText>
                      {rowNote?.(account.id)}
                    </View>
                  </Pressable>
                  {rowAction?.(account.id, selected)}
                </View>
                {selected ? expandedContent?.(account.id) : null}
              </View>
            );
          })}
          {unavailable.map((destination) => (
            <View key={destination.accountId}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: true }}
                accessibilityLabel={
                  destination.platform
                    ? `Unavailable destination, ${platformLabel(destination.platform)}. Remove from this post.`
                    : "Unavailable destination. Remove from this post."
                }
                onPress={() => onToggle(destination.accountId)}
                style={({ pressed }) => [
                  styles.accountRow,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.primary,
                  },
                  pressed && { opacity: 0.65 },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary,
                    },
                  ]}
                >
                  <ThemeIcon role="check" size={15} tintColor={colors.onPrimary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={2}
                    style={[typography.labelLarge, { color: colors.onSurface }]}
                  >
                    {destination.platform
                      ? `Unavailable destination, ${platformLabel(destination.platform)}`
                      : "Unavailable destination"}
                  </Text>
                  <BodyText>This account was disconnected. Tap to remove it.</BodyText>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {selectedIds.length === 0 ? (
        <BodyText>Select at least one destination to continue.</BodyText>
      ) : null}
      <Button title="Done" onPress={onConfirm} disabled={selectedIds.length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  accountList: {
    gap: 8,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  accountSelection: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
