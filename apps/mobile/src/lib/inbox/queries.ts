import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { inboxQueryKeys, type ConversationPage } from "@openpost/query-catalog";
import { mobileInboxAPI, listConversations } from "./api";
import { useWorkspaceId } from "../queries";

export function useConversation(id: string) {
  const workspaceId = useWorkspaceId() ?? "";
  const client = useQueryClient();
  return useQuery({
    queryKey: [...inboxQueryKeys.conversationsRoot(workspaceId), "detail", id],
    enabled: Boolean(workspaceId && id),
    initialData: () => {
      for (const [, data] of client.getQueriesData<InfiniteData<ConversationPage>>({
        queryKey: inboxQueryKeys.conversationsRoot(workspaceId),
      })) {
        const row = data?.pages?.flatMap((page) => page.items ?? []).find((row) => row.id === id);
        if (row) return row;
      }
    },
    queryFn: async ({ signal }) => {
      for (const archived of [false, true]) {
        let cursor = "";
        const seen = new Set<string>();
        do {
          const page = await listConversations(
            workspaceId,
            { archived, limit: 100 },
            cursor,
            signal,
          );
          const row = page.items?.find((row) => row.id === id);
          if (row) return row;
          const next = page.next_cursor ?? "";
          if (seen.has(next)) break;
          seen.add(next);
          cursor = next;
        } while (cursor);
      }
      throw new Error("This chat is no longer available in this Workspace.");
    },
  });
}

export function useComment(id: string) {
  const workspaceId = useWorkspaceId() ?? "";
  return useQuery({
    queryKey: [...inboxQueryKeys.engagementRoot(workspaceId), "item", id],
    enabled: Boolean(workspaceId && id),
    queryFn: async ({ signal }) => {
      for (const archived of [false, true]) {
        let cursor = "";
        const seen = new Set<string>();
        do {
          const page = await mobileInboxAPI.listEngagement(
            workspaceId,
            {
              accountId: "",
              platform: "",
              publicationId: "",
              unreadOnly: false,
              archived,
              limit: 100,
            },
            cursor,
            signal,
          );
          const item = page.items?.find((item) => item.id === id);
          if (item) return item;
          const next = page.next_cursor ?? "";
          if (seen.has(next)) break;
          seen.add(next);
          cursor = next;
        } while (cursor);
      }
      throw new Error("This comment is no longer available in this Workspace.");
    },
  });
}
