import { InboxSessionBoundary } from "@/components/inbox/session-boundary";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  conversationsQueryOptions,
  engagementQueryOptions,
  inboxQueryKeys,
} from "@openpost/query-catalog";
import { Screen, BodyText, Button, ContentTitle, EmptyState, TextField } from "@/components/ui";
import { XMessagingRecovery } from "@/components/inbox/account-recovery";
import { WorkspaceHeader } from "@/components/workspace-header";
import { AccountAvatar } from "@/components/account-avatar";
import { InboxSegments, AccountFilter, InboxDivider } from "@/components/inbox/controls";
import { DelayedQueryPlaceholder, QueryNotice } from "@/components/query-state";
import { useAccounts, useWorkspaceCapabilities, useWorkspaceId } from "@/lib/queries";
import {
  mobileInboxAPI,
  setConversationState,
  setCommentState,
  type Conversation,
  type Comment,
} from "@/lib/inbox/api";
import { lastSuccessfulSync } from "@/lib/inbox/refresh";
import { useInboxRefresh } from "@/lib/inbox/use-refresh";
import { useInboxUpdates } from "@/lib/inbox/lifecycle";
import { relativeTime, platformLabel } from "@/lib/format";
import { useNativeTheme } from "@/theme";
import { captureApiRequestIdentity, apiRequestIdentityIsCurrent } from "@/lib/api/client";

export default function InboxScreen() {
  const workspaceId = useWorkspaceId();
  return (
    <InboxSessionBoundary>
      <InboxContent key={workspaceId} workspaceId={workspaceId ?? ""} />
    </InboxSessionBoundary>
  );
}
function InboxContent({ workspaceId }: { workspaceId: string }) {
  const { colors, spacing } = useNativeTheme().manifest;
  const accounts = useAccounts();
  const canEdit = !!useWorkspaceCapabilities()?.can_edit;
  const queryClient = useQueryClient();
  const [view, setView] = useState<"chats" | "comments">("chats");
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    kind: "chat" | "comment";
    id: string;
    archived: boolean;
  } | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const preferenceKey = `inbox-view-${workspaceId}`;
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(preferenceKey)
      .then((value) => {
        if (active) {
          if (value === "comments") setView(value);
          setPreferenceReady(true);
        }
      })
      .catch(() => {
        if (active) setPreferenceReady(true);
      });
    return () => {
      active = false;
    };
  }, [preferenceKey]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const liveError = useInboxUpdates(view);
  const filters = {
    accountId,
    archived: filter === "archived",
    unreadOnly: filter === "unread",
    search: query,
    limit: 50,
  };
  const chats = useInfiniteQuery({
    ...conversationsQueryOptions(mobileInboxAPI, workspaceId, filters),
    enabled: !!workspaceId && view === "chats",
  });
  const comments = useInfiniteQuery({
    ...engagementQueryOptions(mobileInboxAPI, workspaceId, filters),
    enabled: !!workspaceId && view === "comments",
  });
  const activeQuery = view === "chats" ? chats : comments;
  const chatItems = [
    ...new Map(
      chats.data?.pages.flatMap((page) => page.items ?? []).map((row) => [row.id, row]) ?? [],
    ).values(),
  ];
  const commentItems = [
    ...new Map(
      comments.data?.pages.flatMap((page) => page.items ?? []).map((row) => [row.id, row]) ?? [],
    ).values(),
  ];
  const syncStates =
    view === "chats" ? chats.data?.pages[0]?.sync_states : comments.data?.pages[0]?.sync_states;
  const syncIssue = syncStates?.find(
    (state) => state.error_message || state.status === "failed" || state.status === "unavailable",
  );
  const successfulAt = lastSuccessfulSync(syncStates, accountId);
  const refresh = useInboxRefresh({
    workspaceId,
    view,
    viewKey: `${view}:${filter}:${accountId}`,
    canEdit,
    previousSuccess: successfulAt,
    reloadStored: async () => {
      const loaded = await activeQuery.refetch();
      return lastSuccessfulSync(loaded.data?.pages[0]?.sync_states, accountId);
    },
  });
  async function updateArchive(
    kind: "chat" | "comment",
    id: string,
    archived: boolean,
    previous: boolean | null,
  ) {
    if (!canEdit || archiving) return;
    const identity = captureApiRequestIdentity();
    setArchiving(id);
    setError(null);
    try {
      if (kind === "chat") await setConversationState(workspaceId, id, { archived }, canEdit);
      else await setCommentState(workspaceId, id, { archived }, canEdit);
      if (!apiRequestIdentityIsCurrent(identity)) return;
      setUndo(previous === null ? null : { kind, id, archived: previous });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey:
            kind === "chat"
              ? inboxQueryKeys.conversationsRoot(workspaceId)
              : inboxQueryKeys.engagementRoot(workspaceId),
        }),
        queryClient.invalidateQueries({ queryKey: inboxQueryKeys.summary(workspaceId) }),
      ]);
    } catch (cause) {
      if (apiRequestIdentityIsCurrent(identity))
        setError(cause instanceof Error ? cause.message : "Could not update Inbox");
    } finally {
      if (apiRequestIdentityIsCurrent(identity)) setArchiving(null);
    }
  }
  function accountName(id: string) {
    const account = accounts.data?.find((account) => account.id === id);
    return account?.alias || account?.account_username || "Connected account";
  }
  function openChat(chat: Conversation) {
    router.push({ pathname: "/inbox/[id]", params: { id: chat.id } });
  }
  function openComment(comment: Comment) {
    router.push({ pathname: "/inbox/comment/[id]", params: { id: comment.id } });
  }
  const header = (
    <View style={{ gap: 12, paddingHorizontal: spacing.large, paddingBottom: 12 }}>
      <InboxSegments
        values={[
          { value: "chats", label: "Chats" },
          { value: "comments", label: "Comments" },
        ]}
        selected={view}
        onSelect={(value) => {
          setView(value);
          setSearch("");
          if (preferenceReady)
            void SecureStore.setItemAsync(preferenceKey, value).catch(() =>
              setError("Could not remember Inbox view."),
            );
        }}
      />
      {view === "chats" ? (
        <TextField
          accessibilityLabel="Search all chats"
          placeholder="Search people and messages"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      ) : null}
      <InboxSegments
        values={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
          { value: "archived", label: "Archived" },
        ]}
        selected={filter}
        onSelect={setFilter}
      />
      <AccountFilter accounts={accounts.data ?? []} value={accountId} onChange={setAccountId} />
      {accounts.data?.some((account) => account.id === accountId && account.platform === "x") ? (
        <XMessagingRecovery accountId={accountId} workspaceId={workspaceId} />
      ) : null}
      {undo && canEdit ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <BodyText style={{ flex: 1 }}>
            {undo.kind === "chat" ? "Chat" : "Comment"} {undo.archived ? "reopened" : "archived"}
          </BodyText>
          <Button
            title="Undo"
            intent="ordinary"
            onPress={() => void updateArchive(undo.kind, undo.id, undo.archived, null)}
            disabled={!!archiving}
          />
        </View>
      ) : null}
      <BodyText>
        {successfulAt
          ? `Last successful collection: ${new Date(successfulAt).toLocaleString()}. Networks may deliver updates later.`
          : "No successful collection recorded. Showing stored items."}
      </BodyText>
      {refresh.notice ? (
        <BodyText accessibilityLiveRegion="polite">{refresh.notice}</BodyText>
      ) : null}
      {error ? <QueryNotice message={error} /> : null}
      {syncIssue ? (
        <QueryNotice
          message={
            syncIssue.error_message ||
            `${platformLabel(syncIssue.platform)} needs attention. Check account settings.`
          }
        />
      ) : null}
      {liveError ? (
        <BodyText accessibilityLiveRegion="polite">Reconnecting to Inbox…</BodyText>
      ) : null}
      <DelayedQueryPlaceholder
        pending={activeQuery.isPending}
        shape="list"
        offline={activeQuery.fetchStatus === "paused"}
      />
      {activeQuery.isError ? (
        <QueryNotice
          message={
            activeQuery.error instanceof Error ? activeQuery.error.message : "Could not load Inbox"
          }
          retry={() => void activeQuery.refetch()}
        />
      ) : null}
    </View>
  );
  return (
    <Screen>
      <WorkspaceHeader />
      <FlatList<Conversation | Comment>
        key={view}
        data={view === "chats" ? chatItems : commentItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={InboxDivider}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refresh.refreshing}
            onRefresh={() => void refresh.refresh()}
            tintColor={colors.onSurfaceVariant}
          />
        }
        onEndReached={() => {
          if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage)
            void activeQuery.fetchNextPage();
        }}
        ListFooterComponent={
          activeQuery.hasNextPage ? (
            <Button
              title={activeQuery.isFetchingNextPage ? "Loading…" : "Load more"}
              loading={activeQuery.isFetchingNextPage}
              intent="ordinary"
              onPress={() => void activeQuery.fetchNextPage()}
              style={{ margin: 16 }}
            />
          ) : null
        }
        ListEmptyComponent={
          !activeQuery.isPending && !activeQuery.isError ? (
            <EmptyState
              title={
                query
                  ? "No matching chats"
                  : filter === "unread"
                    ? "You're caught up"
                    : filter === "archived"
                      ? "Nothing archived"
                      : view === "chats"
                        ? "No chats yet"
                        : "No comments yet"
              }
              body={
                view === "chats"
                  ? "Conversations from enabled accounts appear here. Availability depends on the network and account permissions."
                  : "Public comments and replies from enabled accounts appear here."
              }
            />
          ) : null
        }
        renderItem={({ item }) =>
          "counterpart_name" in item ? (
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: spacing.large,
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.counterpart_name || item.counterpart_handle}, ${item.unread_count} unread, ${platformLabel(item.platform)}, received by ${accountName(item.social_account_id)}`}
                onPress={() => openChat(item)}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  gap: 12,
                  minHeight: 100,
                  alignItems: "center",
                  paddingVertical: 14,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <AccountAvatar
                  name={item.counterpart_name || item.counterpart_handle}
                  platform={item.platform}
                  avatarUrl={item.counterpart_avatar_url}
                  size={44}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <ContentTitle numberOfLines={1}>
                    {item.counterpart_name || item.counterpart_handle || "Conversation"}
                    {item.unread_count ? ` · ${item.unread_count}` : ""}
                  </ContentTitle>
                  <BodyText numberOfLines={2}>
                    {item.last_message_preview || "No messages"}
                  </BodyText>
                  <BodyText numberOfLines={1}>
                    {accountName(item.social_account_id)} · {relativeTime(item.last_message_at)}
                  </BodyText>
                </View>
              </Pressable>
              {canEdit ? (
                <Button
                  title={filter === "archived" ? "Reopen" : "Archive"}
                  intent="quiet"
                  disabled={!!archiving}
                  onPress={() =>
                    void updateArchive("chat", item.id, filter !== "archived", !!item.archived_at)
                  }
                />
              ) : null}
            </View>
          ) : (
            <View style={{ padding: spacing.large, gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openComment(item)}
                style={({ pressed }) => ({
                  gap: 8,
                  minHeight: 48,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                  <AccountAvatar
                    name={item.author_name || item.author_handle}
                    platform={item.platform}
                    avatarUrl={item.author_avatar_url}
                    size={36}
                  />
                  <View style={{ flex: 1 }}>
                    <ContentTitle>
                      {item.author_name || item.author_handle}
                      {item.read_at ? "" : " · Unread"}
                    </ContentTitle>
                    <BodyText>
                      {accountName(item.social_account_id)} · {platformLabel(item.platform)}
                    </BodyText>
                  </View>
                </View>
                <BodyText numberOfLines={3} style={{ color: colors.onSurface }}>
                  {item.body}
                </BodyText>
                <BodyText numberOfLines={2}>
                  On: {item.publication_title || item.publication_excerpt || "Public post"}
                </BodyText>
              </Pressable>
              {canEdit ? (
                <Button
                  title={item.archived_at ? "Reopen comment" : "Archive comment"}
                  intent="ordinary"
                  disabled={!!archiving}
                  onPress={() =>
                    void updateArchive("comment", item.id, !item.archived_at, !!item.archived_at)
                  }
                  style={{ alignSelf: "flex-start" }}
                />
              ) : null}
            </View>
          )
        }
      />
    </Screen>
  );
}
