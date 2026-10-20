import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { engagementQueryOptions } from "@openpost/query-catalog";
import { mobileInboxAPI } from "./api";
import { useWorkspaceId } from "../queries";

/** Select a stored comment through the canonical paginated inventory, including archives. */
export function useComment(id: string, accountId = "", remoteIdentity = false) {
  const workspaceId = useWorkspaceId() ?? "";
  const active = useInfiniteQuery({
    ...engagementQueryOptions(mobileInboxAPI, workspaceId, {
      accountId,
      archived: false,
      limit: 100,
    }),
    enabled: !!id && !!workspaceId,
  });
  const matches = (item: { id: string; remote_id: string }) =>
    remoteIdentity ? item.remote_id === id : item.id === id;
  const current = active.data?.pages.flatMap((page) => page.items ?? []).find(matches);
  const archived = useInfiniteQuery({
    ...engagementQueryOptions(mobileInboxAPI, workspaceId, {
      accountId,
      archived: true,
      limit: 100,
    }),
    enabled: !!id && !!workspaceId && !current && !active.isPending && !active.hasNextPage,
  });
  const data = current ?? archived.data?.pages.flatMap((page) => page.items ?? []).find(matches);
  const {
    hasNextPage: activeNext,
    isFetchingNextPage: activeFetching,
    fetchNextPage: nextActive,
  } = active;
  const {
    hasNextPage: archivedNext,
    isFetchingNextPage: archivedFetching,
    fetchNextPage: nextArchived,
  } = archived;
  useEffect(() => {
    if (id && !data && activeNext && !activeFetching) void nextActive();
  }, [id, data, activeNext, activeFetching, nextActive]);
  useEffect(() => {
    if (id && !data && !activeNext && archivedNext && !archivedFetching) void nextArchived();
  }, [id, data, activeNext, archivedNext, archivedFetching, nextArchived]);
  const pending =
    !!id &&
    !data &&
    (active.isPending ||
      activeNext ||
      activeFetching ||
      archived.isPending ||
      archivedNext ||
      archivedFetching);
  const error = active.error ?? archived.error;
  return {
    data,
    isPending: pending,
    isError: !!error,
    error: error instanceof Error ? error : new Error("Could not load comment"),
    refetch: () => Promise.all([active.refetch(), archived.refetch()]),
  };
}
