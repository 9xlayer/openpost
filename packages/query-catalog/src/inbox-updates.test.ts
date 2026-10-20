import { QueryClient } from "@tanstack/query-core";
import { describe, expect, it } from "vitest";
import { reconcileInboxChanges, startInboxUpdates } from "./inbox-updates";
import { inboxQueryKeys, type MessagePage } from "./inbox";

function message(id: string, body: string, day: string): NonNullable<MessagePage["items"]>[number] {
  return {
    id,
    body,
    conversation_id: "chat",
    workspace_id: "ws",
    direction: "inbound",
    remote_message_id: id,
    author_remote_id: "person",
    attachments_json: "[]",
    send_status: "received",
    error_message: "",
    created_at: day,
    updated_at: day,
    remote_created_at: day,
  };
}
describe("foreground inbox updates", () => {
  it("patches older loaded messages and removes reconciled echoes without fetching history", () => {
    const client = new QueryClient();
    const key = inboxQueryKeys.messages("ws", "chat", {});
    const otherKey = inboxQueryKeys.messages("other", "chat", {});
    const old = {
      pages: [
        { items: [message("new", "new", "2026-10-20")], next_cursor: "older" },
        {
          items: [
            message("old", "before", "2026-10-19"),
            message("echo", "duplicate", "2026-10-19"),
          ],
        },
      ],
      pageParams: ["", "older"],
    };
    client.setQueryData(key, old);
    client.setQueryData(otherKey, old);
    reconcileInboxChanges(client, "ws", {
      cursor: "next",
      reset: false,
      changes: [
        { revision: 1, kind: "message", conversation_id: "chat", message_id: "old" },
        {
          revision: 2,
          kind: "message",
          conversation_id: "chat",
          message_id: "echo",
          deleted: true,
        },
      ],
      messages: [message("old", "after", "2026-10-19")],
    });
    expect(client.getQueryData(key)).toEqual({
      pages: [old.pages[0], { items: [message("old", "after", "2026-10-19")] }],
      pageParams: ["", "older"],
    });
    expect(client.getQueryData(otherKey)).toEqual(old);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });
  it("discards a response that arrives after its identity owner is cancelled", async () => {
    const client = new QueryClient();
    const controller = new AbortController();
    let deliver: ((page: { cursor: string; reset: boolean; changes: [] }) => void) | undefined;
    const stop = startInboxUpdates({
      queryClient: client,
      workspaceId: "ws",
      clientId: "device",
      view: "chats",
      signal: controller.signal,
      api: {
        inboxActivity: async () => {},
        inboxChanges: () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
      },
    });
    controller.abort();
    deliver?.({ cursor: "late", reset: true, changes: [] });
    await Promise.resolve();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    stop();
    client.clear();
  });
});
