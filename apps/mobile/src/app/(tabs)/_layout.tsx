import { InboxSessionBoundary } from "@/components/inbox/session-boundary";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColors } from "@/components/ui";
import { navigationPresentation, useNativeTheme } from "@/theme";
import { resolveNativeThemeNavigationIcon } from "@/theme/native-tab-icons";

export default function TabLayout() {
  return (
    <InboxSessionBoundary>
      <NativeTabLayout />
    </InboxSessionBoundary>
  );
}
function NativeTabLayout() {
  const colors = useColors();
  const theme = useNativeTheme();
  const drafts = resolveNativeThemeNavigationIcon(theme.manifest, "drafts");
  const inbox = resolveNativeThemeNavigationIcon(theme.manifest, "inbox");
  const media = resolveNativeThemeNavigationIcon(theme.manifest, "media");
  const more = resolveNativeThemeNavigationIcon(theme.manifest, "more");
  const analytics = resolveNativeThemeNavigationIcon(theme.manifest, "analytics");
  const navigation = navigationPresentation(theme.manifest);
  const label = theme.manifest.typography.labelMedium;

  // Expo's native UIKit and Material tab hosts own their physical height and safe-area inset.
  // NativeTabs exposes no height prop, so the validated requestedHeight remains available to
  // custom navigation renderers instead of being faked with content padding here.
  return (
    <NativeTabs
      backgroundColor={navigation.backgroundColor}
      blurEffect="none"
      disableIndicator={navigation.disableIndicator}
      disableTransparentOnScrollEdge
      iconColor={{
        default: navigation.defaultColor,
        selected: navigation.selectedColor,
      }}
      indicatorColor={navigation.indicatorColor}
      labelStyle={{
        default: {
          color: navigation.defaultColor,
          fontFamily: label.fontFamily,
          fontSize: label.fontSize,
          fontWeight: label.fontWeight,
        },
        selected: {
          color: navigation.selectedColor,
          fontFamily: label.fontFamily,
          fontSize: label.fontSize,
          fontWeight: label.fontWeight,
        },
      }}
      labelVisibilityMode="labeled"
      minimizeBehavior="never"
      rippleColor={colors.primaryContainer}
      shadowColor={navigation.shadowColor}
      tintColor={navigation.selectedColor}
    >
      <NativeTabs.Trigger name="posts">
        <NativeTabs.Trigger.Label>Posts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon renderingMode="template" src={drafts} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon renderingMode="template" src={inbox} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon renderingMode="template" src={analytics} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="media">
        <NativeTabs.Trigger.Label>Media</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon renderingMode="template" src={media} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon renderingMode="template" src={more} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="drafts" hidden />
      <NativeTabs.Trigger name="calendar" hidden />
      <NativeTabs.Trigger name="queue" hidden />
      <NativeTabs.Trigger name="projects" hidden />
    </NativeTabs>
  );
}
