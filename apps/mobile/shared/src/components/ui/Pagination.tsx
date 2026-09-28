import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/**
 * Ô trống "…" giữa hai cụm số. Là hằng chứ không phải chuỗi trần vì nó vừa là NHÃN vừa là KHOÁ
 * phân biệt với một số trang thật khi dựng danh sách.
 */
const GAP = '…' as const;

type Slot = number | typeof GAP;

/**
 * Số ô SỐ tối đa hiện cùng lúc, chưa kể hai nút mũi tên.
 *
 * Bảy là mức vừa khít máy hẹp nhất còn hỗ trợ (360dp): 7 ô × 44pt vùng chạm + 2 mũi tên vẫn
 * nằm trong bề ngang, mà vẫn đủ chỗ cho cụm `1 … 5 6 7 … 20`. Tám ô là bắt đầu tràn.
 */
const MAX_SLOTS = 7;

/** Hình dạng chung của MỘT ô — số hay mũi tên đều cùng vùng chạm, cùng bo góc. */
const SLOT = {
  minWidth: sizing.touchTarget,
  height: sizing.touchTarget,
  br: radius.md,
  ai: 'center',
  jc: 'center',
} as const;

/**
 * Dựng dãy ô số quanh trang hiện tại, luôn giữ trang ĐẦU và trang CUỐI.
 *
 * Hai đầu luôn có mặt vì đó là hai đích hay tới nhất của một bảng dữ liệu ("về đầu", "xem mới
 * nhất"); phần giữa trượt theo trang đang mở. Ít hơn `MAX_SLOTS` trang thì hiện hết, không chèn
 * dấu "…" cho một dãy vốn đã đủ ngắn.
 */
export function buildSlots(current: number, totalPages: number): readonly Slot[] {
  if (totalPages <= MAX_SLOTS) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  /* Trừ 2 ô cho trang đầu/cuối và 2 ô cho hai dấu "…" → còn 3 ô cho cụm giữa. */
  const around = Math.floor((MAX_SLOTS - 4) / 2);
  let start = Math.max(2, current - around);
  let end = Math.min(totalPages - 1, current + around);

  /* Sát mép thì dồn cụm giữa về phía còn lại, để dãy luôn dài đúng `MAX_SLOTS`. */
  if (current - around <= 2) end = Math.min(totalPages - 1, MAX_SLOTS - 2);
  if (current + around >= totalPages - 1) start = Math.max(2, totalPages - MAX_SLOTS + 3);

  /*
   * Dấu "…" chỉ được thay cho HAI trang trở lên.
   *
   * Nó chiếm đúng một ô như một con số, nên khi nó đứng thay cho MỘT trang duy nhất thì người
   * dùng mất một đích bấm được mà chẳng tiết kiệm được chỗ nào — `1 … 3 4 5 … 50` tốn y hệt
   * `1 2 3 4 5 … 50` nhưng không bấm thẳng sang trang 2 được. Xảy ra ở đúng trang thứ 4 kể từ
   * mỗi đầu, nên nó hiếm vừa đủ để lọt qua mắt thường.
   */
  const slots: Slot[] = [1];
  if (start > 3) slots.push(GAP);
  else if (start === 3) slots.push(2);

  for (let page = start; page <= end; page += 1) slots.push(page);

  if (end < totalPages - 2) slots.push(GAP);
  else if (end === totalPages - 2) slots.push(totalPages - 1);

  slots.push(totalPages);

  return slots;
}

/**
 * Thanh phân trang cho bảng dữ liệu lớn của khu quản lý — bản native của `Pagination` bên web:
 * bấm số để nhảy thẳng tới trang đó, và danh sách THAY nội dung chứ không nối thêm.
 *
 * Vùng chạm `sizing.touchTarget` quyết định hình dạng: bề ngang chỉ đủ 7 ô số + 2 mũi tên, nên
 * dãy số TRƯỢT quanh trang đang mở và luôn giữ hai đầu (`1 … 5 6 7 … 20`).
 *
 * **Nơi gọi phải đặt nó NGOÀI vùng cuộn** (dưới `FlatList`, không phải `ListFooterComponent`):
 * nhét vào footer thì muốn sang trang 2 phải cuộn hết trang 1 để với tới nút.
 */
export const Pagination = memo(function Pagination({
  page,
  limit,
  total,
  onChange,
}: {
  page: number;
  limit: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const t = useTranslations('Common.pagination');

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const slots = useMemo(() => buildSlots(page, totalPages), [page, totalPages]);

  // Một trang thì thanh này không quyết định được gì — ẩn hẳn thay vì hiện một hàng nút chết.
  if (totalPages <= 1) return null;

  return (
    <XStack
      ai="center"
      jc="center"
      gap={space.xs}
      px={space.sm}
      py={space.xs}
      bg={colors.surface}
      borderTopWidth={1}
      bc={colors.borderSubtle}
    >
      <Arrow
        icon="chevron-back"
        label={t('previous')}
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />

      {slots.map((slot, index) =>
        slot === GAP ? (
          // `index` làm khoá là đúng ở đây: dấu "…" không có danh tính, và dãy dựng lại trọn vẹn
          // mỗi lần đổi trang nên không có chuyện phần tử bị ghép nhầm trạng thái.
          <YStack key={`gap-${index}`} {...SLOT} minWidth={space.lg}>
            <Text col={colors.placeholder} fos={fontSize.body}>
              {GAP}
            </Text>
          </YStack>
        ) : (
          <PageSlot key={slot} page={slot} active={slot === page} onPress={onChange} />
        ),
      )}

      <Arrow
        icon="chevron-forward"
        label={t('next')}
        disabled={page >= totalPages}
        onPress={() => onChange(page + 1)}
      />
    </XStack>
  );
});

const PageSlot = memo(function PageSlot({
  page,
  active,
  onPress,
}: {
  page: number;
  active: boolean;
  onPress: (page: number) => void;
}) {
  const t = useTranslations('Common.pagination');

  return (
    <Pressable
      onPress={() => onPress(page)}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t('goToPage', { page })}
      style={({ pressed }) => ({
        backgroundColor: active ? colors.primary : pressed ? colors.surfaceMuted : 'transparent',
        borderRadius: SLOT.br,
      })}
    >
      <XStack {...SLOT}>
        <Text
          col={active ? colors.onPrimary : colors.text}
          fos={fontSize.body}
          fow={active ? fontWeight.bold : fontWeight.medium}
        >
          {page}
        </Text>
      </XStack>
    </Pressable>
  );
});

function Arrow({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        backgroundColor: pressed && !disabled ? colors.surfaceMuted : 'transparent',
        borderRadius: SLOT.br,
      })}
    >
      <XStack {...SLOT}>
        <Ionicons
          name={icon}
          size={iconSize.lg}
          color={disabled ? colors.textDisabled : colors.text}
        />
      </XStack>
    </Pressable>
  );
}
