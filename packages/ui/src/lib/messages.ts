import { getContext, setContext } from "svelte";

export type UiMessages = {
  calendar_next: () => string;
  calendar_previous: () => string;
  calendar_label: () => string;
  color_picker_pick_from_screen: () => string;
  color_picker_brand_colors: () => string;
  color_picker_recent_colors: () => string;
  color_picker_hex_color: () => string;
  color_picker_hue: () => string;
  color_picker_saturation: () => string;
  color_picker_lightness: () => string;
  color_picker_opacity: () => string;
  common_close: () => string;
  common_toggle_sidebar: () => string;
  common_mobile_sidebar_description: () => string;
  common_sidebar: () => string;
};
const messagesKey = Symbol("openpost-ui-messages");
const english: UiMessages = {
  calendar_next: () => "Next month",
  calendar_previous: () => "Previous month",
  calendar_label: () => "Calendar",
  color_picker_pick_from_screen: () => "Pick a color from the screen",
  color_picker_brand_colors: () => "Brand colors",
  color_picker_recent_colors: () => "Recent colors",
  color_picker_hex_color: () => "Hex color",
  color_picker_hue: () => "Hue",
  color_picker_saturation: () => "Saturation",
  color_picker_lightness: () => "Lightness",
  color_picker_opacity: () => "Opacity",
  common_close: () => "Close",
  common_toggle_sidebar: () => "Toggle sidebar",
  common_mobile_sidebar_description: () => "Displays the mobile sidebar.",
  common_sidebar: () => "Sidebar",
};
export function provideUiMessages(messages: Partial<UiMessages>) {
  setContext(messagesKey, { ...english, ...messages });
}
export function getUiMessages(): UiMessages {
  return getContext<UiMessages>(messagesKey) ?? english;
}
