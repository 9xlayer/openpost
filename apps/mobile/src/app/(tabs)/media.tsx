import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { mediaListQueryOptions } from "@openpost/query-catalog";
import { Screen, BodyText, Button, ContentTitle, EmptyState, TextField } from "@/components/ui";
import { WorkspaceHeader } from "@/components/workspace-header";
import { MediaImage } from "@/components/media-image";
import { InboxSegments } from "@/components/inbox/controls";
import { DelayedQueryPlaceholder, QueryNotice } from "@/components/query-state";
import { mobileMediaAPI } from "@/lib/inbox/api";
import { useWorkspaceId } from "@/lib/queries";
import { useNativeTheme } from "@/theme";

export default function MediaScreen() {
  const workspaceId = useWorkspaceId() ?? "";
  const { colors, spacing } = useNativeTheme().manifest;
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | "image" | "video" | "audio">("");
  const [offset, setOffset] = useState(0);
  const media = useQuery(
    mediaListQueryOptions(mobileMediaAPI, workspaceId, {
      search,
      type,
      limit: 40,
      offset,
      lifecycle: "library",
    }),
  );
  return (
    <Screen>
      <WorkspaceHeader />
      <View style={{ paddingHorizontal: spacing.large, paddingBottom: 12, gap: 12 }}>
        <TextField
          accessibilityLabel="Search media library"
          placeholder="Search media"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setOffset(0);
          }}
        />
        <InboxSegments
          values={[
            { value: "", label: "All" },
            { value: "image", label: "Images" },
            { value: "video", label: "Video" },
            { value: "audio", label: "Audio" },
          ]}
          selected={type}
          onSelect={(value) => {
            setType(value);
            setOffset(0);
          }}
        />
      </View>
      <FlatList
        data={media.data?.media ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.large, paddingBottom: 32, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={media.isRefetching}
            onRefresh={() => void media.refetch()}
            tintColor={colors.onSurfaceVariant}
          />
        }
        ListHeaderComponent={
          <>
            <DelayedQueryPlaceholder pending={media.isPending} />
            {media.isError ? (
              <QueryNotice
                message={
                  media.error instanceof Error ? media.error.message : "Could not load media"
                }
                retry={() => void media.refetch()}
              />
            ) : null}
            {media.data ? <BodyText>{media.data.total} items</BodyText> : null}
          </>
        }
        ListEmptyComponent={
          !media.isPending && !media.isError ? (
            <EmptyState
              title="No media found"
              body="Uploaded and saved assets appear in your Workspace library."
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {offset > 0 ? (
              <Button
                title="Previous"
                intent="ordinary"
                onPress={() => setOffset(Math.max(0, offset - 40))}
                style={{ flex: 1 }}
              />
            ) : null}
            {offset + 40 < (media.data?.total ?? 0) ? (
              <Button
                title="Next"
                intent="ordinary"
                onPress={() => setOffset(offset + 40)}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              minHeight: 88,
              borderBottomWidth: 1,
              borderBottomColor: colors.outlineVariant,
              paddingBottom: 12,
            }}
          >
            {item.mime_type.startsWith("image/") || item.mime_type.startsWith("video/") ? (
              <MediaImage
                uri={item.url}
                size="sm"
                accessibilityLabel={item.alt_text || item.original_filename}
                contentFit="cover"
                style={{ width: 76, height: 76, borderRadius: 10 }}
              />
            ) : null}
            <View style={{ flex: 1, gap: 6 }}>
              <ContentTitle numberOfLines={2}>
                {item.original_filename || "Untitled media"}
              </ContentTitle>
              <BodyText>
                {item.mime_type} · {Math.ceil(item.size / 1024)} KB
              </BodyText>
              {item.processing_status && item.processing_status !== "ready" ? (
                <BodyText>{item.processing_status}</BodyText>
              ) : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
