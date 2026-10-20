import { InboxSessionBoundary } from "@/components/inbox/session-boundary";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useHeaderHeight, useIsFocused } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountFeaturesQueryOptions,
  inboxQueryKeys,
  messagesQueryOptions,
} from "@openpost/query-catalog";
import { XMessagingRecovery } from "@/components/inbox/account-recovery";
import { AccountAvatar } from "@/components/account-avatar";
import { BodyText, Button, EmptyState, Screen, TextField } from "@/components/ui";
import { DelayedQueryPlaceholder, QueryNotice } from "@/components/query-state";
import { MediaImage } from "@/components/media-image";
import { useAccounts, useWorkspaceCapabilities, useWorkspaceId } from "@/lib/queries";
import {
  mobileInboxAPI,
  listConversationMessages,
  requestOlderHistory,
  retryMessage,
  setConversationState,
  type DirectMessage,
} from "@/lib/inbox/api";
import { useChatComposer } from "@/lib/inbox/use-composer";
import { uniqueMessages, type PendingSend } from "@/lib/inbox/state";
import { useInboxUpdates } from "@/lib/inbox/lifecycle";
import { platformLabel } from "@/lib/format";
import { useNativeTheme } from "@/theme";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = useWorkspaceId() ?? "";
  return (
    <InboxSessionBoundary>
      <ChatContent key={`${workspaceId}:${id}`} workspaceId={workspaceId} conversationId={id} />
    </InboxSessionBoundary>
  );
}
function ChatContent({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  const { colors, spacing, shape } = useNativeTheme().manifest;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const focused = useIsFocused();
  const accounts = useAccounts();
  const canEdit = !!useWorkspaceCapabilities()?.can_edit;
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({
    ...messagesQueryOptions(mobileInboxAPI, workspaceId, conversationId, { limit: 50 }),
    queryFn: ({ pageParam, signal }) =>
      listConversationMessages(workspaceId, conversationId, 50, pageParam, signal),
  });
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const messages = useMemo(() => uniqueMessages(history.data?.pages ?? []), [history.data]);
  const composer = useChatComposer(workspaceId, conversationId, messages);
  const list = useRef<FlatList<DirectMessage | PendingSend>>(null);
  const nearLatest = useRef(true);
  const [atLatest, setAtLatest] = useState(true);
  const [newMessages, setNewMessages] = useState(false);
  const newest = useRef<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stateBusy, setStateBusy] = useState(false);
  const chat = history.data?.pages[0]?.conversation;
  const account = accounts.data?.find((row) => row.id === chat?.social_account_id);
  const features = useQuery(
    accountFeaturesQueryOptions(mobileInboxAPI, workspaceId, chat ? [chat.social_account_id] : []),
  );
  const messaging = features.data?.find(
    (row) => row.social_account_id === chat?.social_account_id && row.feature === "messaging",
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const expired =
    !!chat?.messaging_window_expires_at && Date.parse(chat.messaging_window_expires_at) < now;
  const canSend =
    canEdit && messaging?.effective_enabled === true && !expired && !!chat && !chat.archived_at;
  const liveError = useInboxUpdates("conversation", conversationId);
  const readInFlight = useRef(false);
  useEffect(() => {
    if (
      !canEdit ||
      !focused ||
      !atLatest ||
      !chat ||
      chat.unread_count === 0 ||
      readInFlight.current
    )
      return;
    readInFlight.current = true;
    void setConversationState(workspaceId, conversationId, { read: true }, canEdit)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: inboxQueryKeys.conversationsRoot(workspaceId) }),
      )
      .catch(() => setActionError("Could not mark this chat read. Reopen it to retry."))
      .finally(() => {
        readInFlight.current = false;
      });
  }, [canEdit, chat, focused, atLatest, workspaceId, conversationId, queryClient]);
  useEffect(() => {
    const latest = messages[0]?.id;
    if (latest && newest.current && latest !== newest.current && !nearLatest.current)
      setNewMessages(true);
    newest.current = latest;
  }, [messages]);
  async function archive() {
    if (!canEdit || !chat || stateBusy) return;
    setStateBusy(true);
    setActionError(null);
    try {
      await setConversationState(
        workspaceId,
        conversationId,
        { archived: !chat.archived_at },
        canEdit,
      );
      await Promise.all([
        history.refetch(),
        queryClient.invalidateQueries({ queryKey: inboxQueryKeys.conversationsRoot(workspaceId) }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update chat");
    } finally {
      setStateBusy(false);
    }
  }
  async function olderHistory() {
    if (!canEdit || historyBusy) return;
    setHistoryBusy(true);
    setHistoryNotice(null);
    try {
      await requestOlderHistory(workspaceId, conversationId);
      setHistoryNotice("Older history requested. It will appear here when the network responds.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not load older history");
    } finally {
      setHistoryBusy(false);
    }
  }
  async function retryServer(messageId: string) {
    if (!canSend) return;
    try {
      await retryMessage(workspaceId, conversationId, messageId);
      await history.refetch();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not retry this message");
    }
  }
  const rows: (DirectMessage | PendingSend)[] = [...composer.draft.sends].reverse();
  rows.push(...messages);
  const blocked = expired
    ? "The network's reply window has closed."
    : chat?.archived_at
      ? "Reopen this chat to reply."
      : messaging && !messaging.effective_enabled
        ? messaging.unavailable_reason || "Messaging is disabled for this receiving account."
        : !canEdit
          ? "You can read this chat. Your Workspace role cannot send replies."
          : features.isError
            ? "Could not check messaging permission. Try again before sending."
            : undefined;
  return (
    <Screen safeTop={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: chat?.counterpart_name || chat?.counterpart_handle || "Chat",
          headerBackTitle: "Inbox",
          headerLeft: router.canGoBack()
            ? undefined
            : () => (
                <Button
                  title="Inbox"
                  intent="quiet"
                  onPress={() => router.replace("/(tabs)/inbox")}
                />
              ),
        }}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={headerHeight}
      >
        {chat ? (
          <View
            style={{
              paddingHorizontal: spacing.large,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.outlineVariant,
            }}
          >
            <AccountAvatar
              name={chat.counterpart_name || chat.counterpart_handle}
              platform={chat.platform}
              avatarUrl={chat.counterpart_avatar_url}
              size={40}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <BodyText>{chat.counterpart_handle || chat.counterpart_name}</BodyText>
              <BodyText>
                Via {platformLabel(chat.platform)} ·{" "}
                {account?.alias || account?.account_username || "Receiving account"}
              </BodyText>
            </View>
            {canEdit ? (
              <Button
                title={chat.archived_at ? "Reopen" : "Archive"}
                intent="quiet"
                loading={stateBusy}
                onPress={() => void archive()}
              />
            ) : null}
          </View>
        ) : null}
        <DelayedQueryPlaceholder pending={history.isPending} shape="detail" />
        {history.isError ? (
          <QueryNotice
            message={
              history.error instanceof Error ? history.error.message : "Could not load Inbox"
            }
            retry={() => void history.refetch()}
          />
        ) : null}
        {liveError ? (
          <BodyText accessibilityLiveRegion="polite" style={{ paddingHorizontal: 16 }}>
            Reconnecting… Your messages remain here.
          </BodyText>
        ) : null}
        {actionError ? (
          <QueryNotice
            message={actionError}
            retry={() => {
              setActionError(null);
              void history.refetch();
            }}
          />
        ) : null}
        <FlatList<DirectMessage | PendingSend>
          ref={list}
          inverted
          data={rows}
          keyExtractor={(row) => ("operationId" in row ? row.operationId : row.id)}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          onScroll={({ nativeEvent }) => {
            nearLatest.current = nativeEvent.contentOffset.y < 80;
            setAtLatest(nearLatest.current);
            if (nearLatest.current) setNewMessages(false);
          }}
          scrollEventThrottle={100}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.large,
            paddingVertical: 12,
            gap: 10,
            flexGrow: 1,
          }}
          onEndReached={() => {
            if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            <View style={{ gap: 8 }}>
              {history.hasNextPage ? (
                <Button
                  title="Load older messages"
                  intent="ordinary"
                  loading={history.isFetchingNextPage}
                  onPress={() => void history.fetchNextPage()}
                />
              ) : canEdit && history.data?.pages.some((page) => page.history_available) ? (
                <Button
                  title="Load older history from network"
                  intent="ordinary"
                  loading={historyBusy}
                  onPress={() => void olderHistory()}
                />
              ) : null}
              {historyNotice ? <BodyText>{historyNotice}</BodyText> : null}
            </View>
          }
          ListEmptyComponent={
            !history.isPending && !history.isError ? (
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  title="No stored messages"
                  body="Older history depends on what this network makes available."
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              retry={
                canSend
                  ? () => {
                      if ("operationId" in item) void composer.submit(item);
                      else void retryServer(item.id);
                    }
                  : undefined
              }
            />
          )}
        />
        {newMessages ? (
          <Button
            title="New messages ↓"
            intent="ordinary"
            onPress={() => {
              list.current?.scrollToOffset({ offset: 0, animated: true });
              setNewMessages(false);
            }}
            style={{ alignSelf: "center", margin: 8 }}
          />
        ) : null}
        <View
          style={{
            paddingHorizontal: spacing.large,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 12),
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.outlineVariant,
          }}
        >
          {chat?.platform === "x" && blocked ? (
            <XMessagingRecovery accountId={chat.social_account_id} workspaceId={workspaceId} />
          ) : null}
          {blocked ? <BodyText>{blocked}</BodyText> : null}
          {composer.error ? <BodyText accessibilityRole="alert">{composer.error}</BodyText> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextField
              accessibilityLabel="Message"
              placeholder={canSend ? "Message" : "Reply unavailable"}
              value={composer.draft.text}
              onChangeText={composer.setText}
              editable={canSend && composer.ready}
              multiline
              maxLength={10000}
              style={{
                flex: 1,
                maxHeight: 160,
                minHeight: 48,
                paddingVertical: 12,
                borderRadius: shape.medium,
              }}
            />
            <Button
              title="Send"
              intent="focal"
              disabled={!canSend || !composer.ready || !composer.draft.text.trim()}
              onPress={() => {
                nearLatest.current = true;
                list.current?.scrollToOffset({ offset: 0, animated: false });
                void composer.submit();
              }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
function MessageBubble({
  message,
  retry,
}: {
  message: DirectMessage | PendingSend;
  retry?: () => void;
}) {
  const { colors, shape, spacing } = useNativeTheme().manifest;
  const local = "operationId" in message;
  const outgoing = local || message.direction === "outbound";
  const failed = local
    ? message.state === "failed" || message.state === "ambiguous"
    : message.send_status === "failed";
  const status = local
    ? message.state === "sending"
      ? "Sending…"
      : message.state === "queued"
        ? "Queued"
        : message.state === "failed"
          ? "Failed"
          : "Delivery unconfirmed"
    : message.provider_read_at
      ? "Read"
      : message.send_status === "sent"
        ? "Sent"
        : message.send_status === "queued"
          ? "Queued"
          : message.send_status === "failed"
            ? "Failed"
            : message.send_status;
  return (
    <View style={{ alignSelf: outgoing ? "flex-end" : "flex-start", maxWidth: "88%", gap: 4 }}>
      <View
        style={{
          backgroundColor: outgoing ? colors.secondaryContainer : colors.surfaceContainer,
          borderRadius: shape.large,
          padding: spacing.medium,
          gap: 8,
        }}
      >
        <BodyText
          selectable
          style={{ color: outgoing ? colors.onSecondaryContainer : colors.onSurface }}
        >
          {!local && message.deleted_at ? "This message was deleted." : message.body}
        </BodyText>
        {!local && !message.deleted_at ? (
          <MessageAttachments value={message.attachments_json} />
        ) : null}
      </View>
      <BodyText style={{ alignSelf: outgoing ? "flex-end" : "flex-start" }}>
        {new Date(
          local ? message.createdAt : message.remote_created_at || message.created_at,
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {outgoing ? ` · ${status}` : ""}
      </BodyText>
      {failed ? (
        <>
          <BodyText accessibilityRole="alert">
            {local ? message.error : message.error_message}
          </BodyText>
          {retry ? <Button title="Retry safely" intent="ordinary" onPress={retry} /> : null}
        </>
      ) : null}
    </View>
  );
}
function MessageAttachments({ value }: { value: string }) {
  let attachments: unknown;
  try {
    attachments = JSON.parse(value || "[]");
  } catch {
    return <BodyText>Attachment unavailable</BodyText>;
  }
  if (!Array.isArray(attachments)) return null;
  return (
    <>
      {attachments.map((attachment, index) => {
        if (
          !attachment ||
          typeof attachment !== "object" ||
          typeof attachment.url !== "string" ||
          !/^https?:\/\//.test(attachment.url)
        )
          return null;
        return attachment.type === "image" ||
          (typeof attachment.mime_type === "string" &&
            attachment.mime_type.startsWith("image/")) ? (
          <MediaImage
            key={index}
            uri={attachment.url}
            style={{ width: 220, maxWidth: "100%", height: 180, borderRadius: 8 }}
            contentFit="contain"
            accessibilityLabel="Message attachment"
          />
        ) : (
          <Button
            key={index}
            title="Open attachment"
            intent="link"
            onPress={() => void Linking.openURL(attachment.url)}
          />
        );
      })}
    </>
  );
}
