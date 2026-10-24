import { api } from "./api/client";
import { mobileQueryTransportRequest } from "./query-api";
import { createOpenPostQueryError, type MentionLookupQueryAPI } from "@openpost/query-catalog";
export const nativeMentionLookupAPI: MentionLookupQueryAPI = {
  async lookupMentions(_workspaceId, accountId, query, signal) {
    const { data, error, response } = await mobileQueryTransportRequest(signal, (signal) =>
      api().GET("/accounts/{account_id}/mentions", {
        params: { path: { account_id: accountId }, query: { query } },
        signal,
      }),
    );
    if (error || !data)
      throw createOpenPostQueryError(response.status, error, "Could not search mentions");
    return { ...data, candidates: data.candidates ?? [] };
  },
};
