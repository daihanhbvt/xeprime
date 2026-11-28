import { memo, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectControl, type SelectControlOption } from '@/components/ui/SelectControl';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Ô "Trạng thái" của Figma `24512:121280`: rộng cố định 124 bên phải ô tìm. */
const STATUS_SELECT_W = 124;

/**
 * Hàng lọc bảng chuyến của chi tiết tài xế — Figma "Tab List" `24512:121256`: ô tìm co giãn + ô
 * "Trạng thái" 124 bên phải, khe 12. Dùng chung cho tài xế liên kết (kết cục lượt gán) và nội bộ
 * (trạng thái đơn) — chỉ khác danh sách lựa chọn.
 */
export function DriverTripsToolbar({
  search,
  onSearch,
  status,
  allValue,
  options,
  onStatus,
}: {
  search: string;
  onSearch: (next: string) => void;
  status: string;
  /** Giá trị "tất cả" — khi đang chọn nó, ô hiện chữ "Trạng thái" như Figma. */
  allValue: string;
  options: readonly SelectControlOption[];
  onStatus: (next: string) => void;
}) {
  const t = useTranslations('Drivers.detailPage.trips');
  return (
    <XStack gap={12} ai="flex-start">
      <YStack f={1} minWidth={0}>
        <SearchInput
          value={search}
          onChange={onSearch}
          label={t('searchLabel')}
          placeholder={t('searchPlaceholderApp')}
          variant="field"
        />
      </YStack>
      <YStack w={STATUS_SELECT_W}>
        <SelectControl
          hideLabel
          compact
          label={t('status')}
          placeholder={t('status')}
          value={status === allValue ? null : status}
          options={options}
          onChange={onStatus}
        />
      </YStack>
    </XStack>
  );
}

/**
 * Thẻ một chuyến của bảng chuyến — Figma "Current Order Card" `24512:120576`: mã đơn (14 medium) +
 * viên trạng thái; xe · biển số (14 semibold); "Khách: <tên>" (12, tên medium); hàng xám thời gian
 * (12 xám nhạt) + số tiền bên phải (chỉ tài xế liên kết có tiền công).
 */
export const DriverTripCard = memo(function DriverTripCard({
  bookingCode,
  statusLabel,
  statusTone,
  vehicleName,
  vehiclePlate,
  customerName,
  customerPhone,
  timeText,
  amount,
  onPress,
}: {
  bookingCode: string;
  statusLabel: string;
  statusTone: PillTone;
  vehicleName: string;
  vehiclePlate?: string | null | undefined;
  customerName: string;
  customerPhone?: string | null | undefined;
  timeText: string;
  /** Cột tiền bên phải hàng xám — vắng = không vẽ (tài xế nội bộ không ghi tiền công). */
  amount?: ReactNode;
  onPress: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.app.trips');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={bookingCode}>
      <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.card} p={space.md} gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text
            flexShrink={1}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={1}
          >
            {`#${bookingCode}`}
          </Text>
          <Pill label={statusLabel} tone={statusTone} />
        </XStack>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {[vehicleName, vehiclePlate].filter(Boolean).join(LIST_SEPARATOR)}
        </Text>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
          {t.rich('customer', {
            name: [customerName, customerPhone].filter(Boolean).join(LIST_SEPARATOR),
            b: (chunks) => (
              <Text col={colors.textMuted} fos={typeScale.label.fontSize} fow={fontWeight.medium}>
                {chunks}
              </Text>
            ),
          })}
        </Text>
        <XStack ai="center" jc="space-between" gap={space.sm} p={space.sm} br={radius.control} bg={colors.background}>
          <Text
            f={1}
            col={colors.placeholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            numberOfLines={1}
          >
            {timeText}
          </Text>
          {amount ?? null}
        </XStack>
      </YStack>
    </Pressable>
  );
});
