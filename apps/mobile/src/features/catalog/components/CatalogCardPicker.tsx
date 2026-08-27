import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { CatalogItem } from '@xeprime/api-client';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { BODY_TYPE_ART } from '../body-type-art';

/**
 * Bộ chọn danh mục dạng THẺ CÓ ẢNH — bản native của `CatalogCardPicker` bên web.
 *
 * Kiểu dáng xe là thứ người ta nhận ra bằng hình chứ không bằng chữ: "CUV" và "MPV" đọc lên
 * gần như nhau, nhìn hình thì khác hẳn. Vì vậy đây là thẻ có ảnh, không phải một hàng chip
 * như các chiều lọc còn lại.
 *
 * Lưới BA cột như web. Chỗ cho chữ hẹp nên nhãn và dòng mô tả được phép xuống dòng thay vì cắt
 * cụt — kiểu dáng là thứ chọn bằng hình, chữ chỉ để xác nhận.
 */
/**
 * Chiều cao CỐ ĐỊNH của mọi thẻ.
 *
 * Để thẻ tự co theo nội dung thì mục có mô tả cao hơn mục không có, và cả lưới thành răng cưa.
 * Chiều cao này chừa đủ cho ảnh, một dòng nhãn và mô tả HAI dòng — cột hẹp nên
 * "7 chỗ · gầm cao · 2 xe" không thể vừa một dòng, mà cắt "…" thì mất luôn số xe ở cuối.
 */
const CARD_HEIGHT = 134;

export function CatalogCardPicker({
  items,
  value,
  onChange,
  countOf,
  countSuffix,
  ariaLabel,
}: {
  items: readonly CatalogItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Số xe khớp cho từng mục. `undefined` = facet chưa tải xong, ẩn số. */
  countOf?: (key: string) => number | undefined;
  countSuffix?: string;
  ariaLabel: string;
}) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);

  return (
    <XStack flexWrap="wrap" gap={space.sm} rowGap={space.sm} accessibilityLabel={ariaLabel}>
      {items.map((item) => {
        const active = value.includes(item.key);
        const count = countOf?.(item.key);
        const art = BODY_TYPE_ART[item.key];
        const meta = [item.description, count !== undefined && countSuffix ? `${count} ${countSuffix}` : null]
          .filter(Boolean)
          .join(' · ');

        return (
          <Pressable
            key={item.key}
            onPress={() => toggle(item.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={item.label}
            // Ba cột: chừa chỗ cho hai khe rồi giãn ra lấp nốt phần lẻ.
            style={{ flexBasis: '30%', flexGrow: 1 }}
          >
            <YStack
              ai="center"
              jc="center"
              gap={2}
              h={CARD_HEIGHT}
              px={space.xs}
              br={radius.md}
              bw={1}
              bc={active ? colors.primary : colors.border}
              bg={active ? colors.primaryLight : colors.surface}
            >
              {art ? (
                <Image source={art} style={{ width: 60, height: 30 }} resizeMode="contain" />
              ) : (
                // Mục chưa có ảnh — glyph trung tính, KHÔNG mượn hình của mục khác.
                <YStack h={30} jc="center">
                  <Ionicons name="car-outline" size={22} color={colors.textMuted} />
                </YStack>
              )}

              {/*
                Một dòng, dài thì "…": nhãn dài ("MPV (7 chỗ)") xuống dòng sẽ đẩy thẻ đó cao hơn
                hàng xóm, và một lưới ba cột lệch chiều cao trông như hỏng chứ không như đầy đặn.
              */}
              <Text
                col={colors.text}
                fos={fontSize.label}
                fow={fontWeight.semibold}
                ta="center"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.label}
              </Text>
              {meta ? (
                <Text
                  col={colors.textMuted}
                  fos={fontSize.label}
                  ta="center"
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {meta}
                </Text>
              ) : null}
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
