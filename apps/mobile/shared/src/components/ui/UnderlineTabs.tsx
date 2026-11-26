import { memo, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Pill } from '@/components/ui/Pill';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';

export interface UnderlineTabItem<K extends string> {
  key: K;
  label: string;
  /** Viên đếm cạnh nhãn - bỏ trống thì không vẽ. */
  count?: number;
  /** Viên đếm tô ĐỎ khi tab chưa chọn (vd "Quá giờ"); tab đang chọn luôn vàng. */
  urgent?: boolean;
  /**
   * Nhãn CHỮ thay cho số (web `EditMenuBadge`: "1 thiếu" · "2/3") + câu đọc màn hình đầy đủ.
   * Có `badge` thì không vẽ `count`.
   */
  badge?: { text: string; label: string; warn?: boolean };
}

/**
 * Hàng tab GẠCH CHÂN của design v2 (Figma "Horizontal tabs" `24228:93328`): kẻ đáy 1
 * `stroke/gray-low200`; tab đang chọn chữ `text/brand/primary-2` + gạch 2 `stroke/primary`, tab
 * khác chữ `text/gray/low`; chữ 14/20 đậm vừa, viên đếm "_Badge" (vàng khi chọn · đỏ khi gấp ·
 * trung tính). Tràn bề ngang thì CUỘN NGANG thay vì ép chữ - đúng như khung Figma bị cắt "7 ngà…".
 */
export function UnderlineTabs<K extends string>({
  items,
  value,
  onChange,
  stretch = false,
  size = 'md',
}: {
  items: ReadonlyArray<UnderlineTabItem<K>>;
  value: K;
  onChange: (next: K) => void;
  /** Các tab chia ĐỀU bề ngang, chữ giữa ô (Figma "Horizontal tabs" của Chi tiết khách: 4 tab flex 1). Không cuộn. */
  stretch?: boolean;
  /**
   * `lg` - chữ 16/24, ô cao 36, đệm ngang 16, đáy 12, các tab cách 12 (Figma "Horizontal tabs" của
   * trang Quản lý ví `24612:145585`). Dùng cho tab KHÔNG có viên đếm.
   */
  size?: 'md' | 'lg';
}) {
  const colors = useColors();
  if (stretch) {
    return (
      <XStack
        borderBottomWidth={1}
        borderBottomColor={colors.border}
        gap={size === 'lg' ? LG.gap : 8}
        accessibilityRole="tablist"
      >
        {items.map((item) => (
          <UnderlineTab
            key={item.key}
            item={item}
            active={item.key === value}
            onChange={onChange as (next: string) => void}
            stretch
            size={size}
          />
        ))}
      </XStack>
    );
  }
  return (
    <YStack borderBottomWidth={1} borderBottomColor={colors.border}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
      >
        {items.map((item) => (
          <UnderlineTab
            key={item.key}
            item={item}
            active={item.key === value}
            onChange={onChange as (next: string) => void}
            size={size}
          />
        ))}
      </ScrollView>
    </YStack>
  );
}

const UnderlineTab = memo(function UnderlineTab({
  item,
  active,
  onChange,
  stretch = false,
  size = 'md',
}: {
  item: UnderlineTabItem<string>;
  active: boolean;
  onChange: (next: string) => void;
  stretch?: boolean;
  size?: 'md' | 'lg';
}) {
  const lg = size === 'lg';
  const type = lg ? typeScale.title : typeScale.body;
  const colors = useColors();
  const onPress = useCallback(() => onChange(item.key), [onChange, item.key]);
  return (
    <Pressable
      onPress={onPress}
      style={stretch ? STRETCH : undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        item.badge
          ? `${item.label} (${item.badge.label})`
          : item.count != null
            ? `${item.label} (${item.count})`
            : item.label
      }
    >
      <XStack
        ai="center"
        {...(stretch ? { jc: "center" as const } : {})}
        gap={TAB_GAP}
        minHeight={lg ? LG.height : TAB_HEIGHT}
        px={lg ? LG.padX : TAB_PAD_X}
        pb={lg ? LG.padBottom : TAB_PAD_BOTTOM}
        borderBottomWidth={UNDERLINE}
        borderBottomColor={active ? colors.brandShape : 'transparent'}
        // Gạch 2 đè lên kẻ đáy 1 của hàng, như CSS `margin-bottom: -1px`.
        mb={-1}
      >
        <Text
          col={active ? colors.brandLink : colors.placeholder}
          fos={type.fontSize}
          lh={type.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {item.label}
        </Text>
        {item.badge ? (
          <Pill label={item.badge.text} tone={item.badge.warn ? 'warning' : 'neutral'} />
        ) : item.count != null ? (
          <Pill
            label={String(item.count)}
            tone={active ? 'brand' : item.urgent ? 'danger' : 'neutral'}
          />
        ) : null}
      </XStack>
    </Pressable>
  );
});

/**
 * Figma `_Tab button base`: `h 32 · px 4 · gap 8`, gạch 2; các tab cách 8. Figma ghi `pb 12` nhưng
 * viên đếm cao 24 thì 32 - 12 = 20 cắt chân số (máy ảo 13/11) - đáy chừa 8 để viên nằm trọn mà
 * tab vẫn cao 32.
 */
const TAB_HEIGHT = 32;
const TAB_PAD_X = 4;
const TAB_PAD_BOTTOM = 8;
const TAB_GAP = 8;
const UNDERLINE = 2;
const STRETCH = { flex: 1, minWidth: 0 } as const;
/** Cỡ `lg` - Figma `24612:145585`: h 36 · px 16 · pb 12 · gap 12. */
const LG = { height: 36, padX: 16, padBottom: 12, gap: 12 } as const;

const styles = StyleSheet.create({
  row: { gap: 8 },
});
