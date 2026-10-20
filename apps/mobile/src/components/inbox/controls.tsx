import { ScrollView, View } from "react-native";
import { Button, BodyText } from "../ui";
import { useNativeTheme } from "@/theme";
import type { MobileAccount } from "@/lib/queries";
import { platformLabel } from "@/lib/format";

export function InboxSegments<T extends string>({
  values,
  selected,
  onSelect,
}: {
  values: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8 }}>
      {values.map(({ value, label }) => (
        <Button
          key={value}
          title={label}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === value }}
          intent={selected === value ? "primary" : "ordinary"}
          onPress={() => onSelect(value)}
          style={{ flex: 1, minHeight: 48 }}
        />
      ))}
    </View>
  );
}
export function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly MobileAccount[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      <Button
        title="All accounts"
        intent={value ? "ordinary" : "primary"}
        onPress={() => onChange("")}
        accessibilityState={{ selected: !value }}
      />
      {accounts.map((account) => (
        <Button
          key={account.id}
          title={`${account.alias || account.account_username} · ${platformLabel(account.platform)}`}
          intent={value === account.id ? "primary" : "ordinary"}
          onPress={() => onChange(account.id)}
          accessibilityState={{ selected: value === account.id }}
        />
      ))}
    </ScrollView>
  );
}
export function InboxDivider() {
  const { colors } = useNativeTheme().manifest;
  return <View style={{ height: 1, backgroundColor: colors.outlineVariant }} />;
}
export function InboxError({ message }: { message: string }) {
  return <BodyText accessibilityRole="alert">{message}</BodyText>;
}
