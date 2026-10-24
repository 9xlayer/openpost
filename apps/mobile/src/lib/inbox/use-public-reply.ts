import { useEffect, useMemo, useSyncExternalStore } from "react";
import { commentAction } from "./api";
import { getInboxOnline } from "./connection";
import { PublicReplySession } from "./reply";
import {
  inboxStorageScope,
  newInboxOperationId,
  readConversationDraft,
  saveConversationDraft,
} from "./storage";
import { useInboxJob } from "./use-job";

export function usePublicReply(workspaceId: string, itemId: string, canEdit: boolean) {
  const session = useMemo(() => {
    const scope = inboxStorageScope(workspaceId);
    const draftId = `comment-${itemId}`;
    return new PublicReplySession({
      read: () => readConversationDraft(scope, draftId),
      write: (draft, admission) => saveConversationDraft(scope, draftId, draft, admission),
      admit: (body, operationId) => commentAction(workspaceId, itemId, "reply", body, operationId),
      newOperationId: newInboxOperationId,
      current: scope.current,
      canEdit: () => false,
      online: getInboxOnline,
    });
  }, [workspaceId, itemId]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  const receipt = useInboxJob(workspaceId, state.operation?.jobId);
  useEffect(() => {
    session.setAccess(canEdit, true);
    return () => session.setAccess(false, false);
  }, [session, canEdit]);
  useEffect(() => {
    void session.restore();
  }, [session]);
  useEffect(() => {
    if (receipt.job) void session.observe(receipt.job);
  }, [session, receipt.job]);
  return {
    ...state,
    receipt,
    setText: (text: string) => {
      void session.setText(text);
    },
    submit: () => {
      void session.submit();
    },
    startNewReply: (text?: string) => {
      void session.startNewReply(text);
    },
  };
}
