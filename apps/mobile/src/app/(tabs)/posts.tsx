import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import * as SecureStore from "expo-secure-store";
import DraftsScreen from "@/screens/posts-drafts";
import CalendarScreen from "@/screens/posts-calendar";
import QueueScreen from "@/screens/posts-queue";
import { InboxSegments } from "@/components/inbox/controls";
import { useWorkspaceId } from "@/lib/queries";

type PostsView = "drafts" | "calendar" | "queue";
function isPostsView(value: unknown): value is PostsView {
  return value === "drafts" || value === "calendar" || value === "queue";
}
export default function PostsScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const workspaceId = useWorkspaceId();
  const { hasShareIntent } = useShareIntentContext();
  const [remembered, setRemembered] = useState<PostsView>("drafts");
  const key = `posts-view-${workspaceId ?? "default"}`;
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(key)
      .then((value) => {
        if (active) setRemembered(isPostsView(value) ? value : "drafts");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key]);
  const view = hasShareIntent ? "drafts" : isPostsView(params.view) ? params.view : remembered;
  const navigation = (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <InboxSegments
        values={[
          { value: "drafts", label: "Drafts" },
          { value: "calendar", label: "Calendar" },
          { value: "queue", label: "Queue" },
        ]}
        selected={view}
        onSelect={(value) => {
          setRemembered(value);
          router.setParams({ view: value });
          void SecureStore.setItemAsync(key, value).catch(() => undefined);
        }}
      />
    </View>
  );
  return view === "calendar" ? (
    <CalendarScreen navigation={navigation} />
  ) : view === "queue" ? (
    <QueueScreen navigation={navigation} />
  ) : (
    <DraftsScreen navigation={navigation} />
  );
}
