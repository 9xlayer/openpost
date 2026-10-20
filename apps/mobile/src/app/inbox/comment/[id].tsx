import { InboxSessionBoundary } from "@/components/inbox/session-boundary";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { inboxQueryKeys } from "@openpost/query-catalog";
import { AccountAvatar } from "@/components/account-avatar";
import { BodyText, Button, ContentTitle, Screen, TextField } from "@/components/ui";
import { DelayedQueryPlaceholder, QueryNotice } from "@/components/query-state";
import { MediaImage } from "@/components/media-image";
import { useComment } from "@/lib/inbox/queries";
import { commentAction, markCommentRead } from "@/lib/inbox/api";
import { useInboxUpdates } from "@/lib/inbox/lifecycle";
import {
  inboxStorageScope,
  readConversationDraft,
  saveConversationDraft,
} from "@/lib/inbox/storage";
import { useAccounts, useWorkspaceCapabilities, useWorkspaceId } from "@/lib/queries";
import { platformLabel } from "@/lib/format";
import { useNativeTheme } from "@/theme";

export default function CommentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = useWorkspaceId() ?? "";
  return (
    <InboxSessionBoundary>
      <CommentContent key={`${workspaceId}:${id}`} workspaceId={workspaceId} id={id} />
    </InboxSessionBoundary>
  );
}
function CommentContent({ workspaceId, id }: { workspaceId: string; id: string }) {
  const { colors, spacing, shape } = useNativeTheme().manifest;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const item = useComment(id);
  const comment = item.data;
  const accounts = useAccounts();
  const account = accounts.data?.find((row) => row.id === comment?.social_account_id);
  const canEdit = !!useWorkspaceCapabilities()?.can_edit;
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scope = useMemo(() => inboxStorageScope(workspaceId), [workspaceId]);
  const draftId = `comment-${id}`;
  const liveError = useInboxUpdates("comments");
  const parentQuery = useComment(
    comment?.parent_remote_id ?? "",
    comment?.social_account_id ?? "",
    true,
  );
  const parent = parentQuery.data;
  useEffect(() => {
    let active = true;
    void readConversationDraft(scope, draftId)
      .then((draft) => {
        if (active && scope.current()) {
          setText(draft.text);
          setReady(true);
        }
      })
      .catch(() => setError("Could not read the saved reply. Reopen this comment."));
    return () => {
      active = false;
    };
  }, [scope, draftId]);
  const commentRead = comment?.read_at;
  const commentId = comment?.id;
  useEffect(() => {
    if (!commentId || commentRead) return;
    void markCommentRead(workspaceId, id)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: inboxQueryKeys.engagementRoot(workspaceId) }),
      )
      .catch(() => setError("Could not mark this comment read. Try again."));
  }, [commentId, commentRead, workspaceId, id, queryClient]);
  function changeText(value: string) {
    setText(value);
    void saveConversationDraft(scope, draftId, { text: value, sends: [] }).catch(() =>
      setError("Could not save your reply on this device."),
    );
  }
  async function action(kind: "reply" | "hide" | "delete" | "like" | "unlike") {
    if (!comment || busy || !scope.current()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const submitted = text.trim();
    try {
      await commentAction(workspaceId, id, kind, kind === "reply" ? submitted : undefined);
      if (!scope.current()) return;
      setNotice(kind === "reply" ? "Public reply queued" : "Action queued");
      if (kind === "reply") {
        setText((current) => (current.trim() === submitted ? "" : current));
        await saveConversationDraft(scope, draftId, { text: "", sends: [] });
      }
      await queryClient.invalidateQueries({ queryKey: inboxQueryKeys.engagementRoot(workspaceId) });
    } catch (cause) {
      if (scope.current())
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not confirm this action. Check the thread before trying again.",
        );
    } finally {
      if (scope.current()) setBusy(false);
    }
  }
  const replyable = canEdit && !!comment?.can_reply && !comment.deleted_at;
  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: "Comment", headerBackTitle: "Inbox", headerShown: true }} />
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.large, gap: 20 }}
        >
          <DelayedQueryPlaceholder pending={item.isPending} shape="detail" />
          {item.isError ? (
            <QueryNotice message={item.error.message} retry={() => void item.refetch()} />
          ) : null}
          {comment ? (
            <>
              <View
                style={{
                  gap: 8,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.outlineVariant,
                }}
              >
                <ContentTitle>Original post</ContentTitle>
                <BodyText selectable style={{ color: colors.onSurface }}>
                  {comment.publication_title ||
                    comment.publication_excerpt ||
                    "Post context is unavailable."}
                </BodyText>
                {comment.publication_title && comment.publication_excerpt ? (
                  <BodyText selectable>{comment.publication_excerpt}</BodyText>
                ) : null}
                {comment.provider_post_url && /^https?:\/\//.test(comment.provider_post_url) ? (
                  <Button
                    title="Open original post"
                    intent="link"
                    onPress={() => void Linking.openURL(comment.provider_post_url!)}
                  />
                ) : null}
              </View>
              {comment.parent_remote_id ? (
                <View style={{ gap: 6 }}>
                  <ContentTitle>Replying to</ContentTitle>
                  {parent ? (
                    <>
                      <BodyText>{parent.author_name || parent.author_handle}</BodyText>
                      <BodyText selectable>{parent.body}</BodyText>
                    </>
                  ) : (
                    <BodyText>
                      {parentQuery.isPending
                        ? "Loading parent comment…"
                        : "The parent comment is not available in stored history."}
                    </BodyText>
                  )}
                </View>
              ) : null}
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <AccountAvatar
                    name={comment.author_name || comment.author_handle}
                    platform={comment.platform}
                    avatarUrl={comment.author_avatar_url}
                    size={40}
                  />
                  <View style={{ flex: 1 }}>
                    <ContentTitle>{comment.author_name || comment.author_handle}</ContentTitle>
                    <BodyText>
                      {comment.author_handle} · {platformLabel(comment.platform)}
                    </BodyText>
                  </View>
                </View>
                <BodyText selectable style={{ color: colors.onSurface }}>
                  {comment.deleted_at ? "This comment was deleted." : comment.body}
                </BodyText>
                {comment.hidden ? <BodyText>Hidden on the network</BodyText> : null}
                {comment.attachments?.map((attachment, index) =>
                  attachment.type === "image" ? (
                    <MediaImage
                      key={index}
                      uri={attachment.url}
                      accessibilityLabel={attachment.name || "Comment attachment"}
                      contentFit="contain"
                      style={{ height: 180, width: "100%", borderRadius: shape.medium }}
                    />
                  ) : null,
                )}
              </View>
              {canEdit && !comment.deleted_at ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {comment.can_like && !comment.liked ? (
                    <Button
                      title="Like"
                      intent="ordinary"
                      disabled={busy}
                      onPress={() => void action("like")}
                    />
                  ) : null}
                  {comment.can_unlike && comment.liked ? (
                    <Button
                      title="Unlike"
                      intent="ordinary"
                      disabled={busy}
                      onPress={() => void action("unlike")}
                    />
                  ) : null}
                  {comment.can_hide && !comment.hidden ? (
                    <Button
                      title="Hide"
                      intent="ordinary"
                      disabled={busy}
                      onPress={() => void action("hide")}
                    />
                  ) : null}
                  {comment.can_delete ? (
                    <Button
                      title="Delete"
                      intent="destructive"
                      disabled={busy}
                      onPress={() =>
                        Alert.alert(
                          "Delete comment?",
                          "This removes the comment from the network. This cannot be undone.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => void action("delete"),
                            },
                          ],
                        )
                      }
                    />
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
          {liveError ? <BodyText>Reconnecting to Inbox…</BodyText> : null}
          {error ? <QueryNotice message={error} /> : null}
          {notice ? <BodyText accessibilityLiveRegion="polite">{notice}</BodyText> : null}
        </ScrollView>
        {comment ? (
          <View
            style={{
              paddingHorizontal: spacing.large,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
              borderTopWidth: 1,
              borderTopColor: colors.outlineVariant,
              gap: 8,
            }}
          >
            <BodyText>
              Public reply as{" "}
              {account?.alias ||
                comment.account_username ||
                account?.account_username ||
                "receiving account"}{" "}
              · {platformLabel(comment.platform)}
            </BodyText>
            {!replyable ? (
              <BodyText>
                {comment.deleted_at
                  ? "This comment has been deleted."
                  : !canEdit
                    ? "Your Workspace role cannot reply."
                    : "This network or account does not support replies here."}
              </BodyText>
            ) : null}
            <TextField
              accessibilityLabel="Public reply"
              placeholder="Write a public reply"
              multiline
              editable={replyable && ready && !busy}
              value={text}
              onChangeText={changeText}
              style={{ minHeight: 64, maxHeight: 144, paddingVertical: 12 }}
            />
            <Button
              title="Reply publicly"
              intent="focal"
              loading={busy}
              disabled={!replyable || !ready || !text.trim()}
              onPress={() => void action("reply")}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
