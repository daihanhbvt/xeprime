import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { LIST_SEPARATOR, overdueDays } from '@xeprime/domain';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { LineIcon } from '@/components/icons/LineIcon';
import { Card } from '@/components/ui/Card';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { iconSize, typeScale } from '@/theme/tokens';
import type { DebtItem } from '../api';

/** Figma thẻ công nợ `24512:127662`: đệm 16, hai khối cách 12; đầu thẻ cách 8, tên ↔ dòng phụ 2. */
const CARD_PAD = 16;
const BLOCK_GAP = 12;
const HEAD_GAP = 8;
const NAME_GAP = 2;
/** Ô xám `bg/gray-50`: đệm 8, bo 10, hai dòng cách 6. */
const PANEL_PAD = 8;
const PANEL_RADIUS = 10;
const PANEL_GAP = 6;
/** Nút ⋮ 20 - vùng chạm nới ra cho đủ ngón tay. */
const KEBAB_SLOP = 12;

/**
 * Một đơn còn nợ - Figma "Wallet Management / Debt" `24512:126964` (người dùng chốt 26/11/2026):
 *
 *   Tên khách                       [trạng thái] ⋮
 *   SĐT · #mã
 *   ┌ xe · biển số ············· Hạn: ngày ┐   (quá hạn ⇒ "Quá hạn: ngày" đỏ)
 *   └ Đã thu: x ················ Còn nợ: y ┘
 *
 * Chạm vào thẻ = "Xem đơn" (cần `bookings.view`); ⋮ mở tấm thao tác "Xem đơn · Thu tiền" ở màn
 * danh sách - mỗi nút gác bằng quyền riêng như trước. Dòng Tổng và thanh thu hồi đã rời thẻ (tấm
 * chi tiết vẫn có) theo quyết định của người dùng.
 *
 * Màu trạng thái lấy từ `BOOKING_STATUS_META` dùng chung (ADR 0005).
 */
function DebtCardImpl({
  debt,
  canView,
  onView,
  onMenu,
}: {
  debt: DebtItem;
  canView: boolean;
  onView: (debt: DebtItem) => void;
  /** Vắng khi người xem không có thao tác nào (không quyền xem lẫn thu) - không vẽ nút ⋮. */
  onMenu?: ((debt: DebtItem) => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.partnerApp.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = debt.status as BookingStatus;
  // Trễ so với hạn trả (web cột Hạn trả, PR #276) - đổi nhãn sang "Quá hạn:" màu đỏ.
  const late = overdueDays(debt.returnAt) > 0;
  const statusLabel = domainLabel('bookingStatus', status, metaLabel(BOOKING_STATUS_META, status));

  return (
    <Card
      padded={false}
      {...(canView
        ? { onPress: () => onView(debt), accessibilityLabel: `${debt.customerName} #${debt.code}` }
        : {})}
    >
      <YStack p={CARD_PAD} gap={BLOCK_GAP}>
        <XStack ai="flex-start" gap={HEAD_GAP}>
          <YStack f={1} minWidth={0} gap={NAME_GAP}>
            <Text
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
              numberOfLines={1}
            >
              {debt.customerName}
            </Text>
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.body}
              numberOfLines={1}
            >
              {[debt.customerPhone, `#${debt.code}`].filter(Boolean).join(LIST_SEPARATOR)}
            </Text>
          </YStack>
          <Pill label={statusLabel} tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, status))} />
          {onMenu ? (
            <Pressable
              onPress={() => onMenu(debt)}
              accessibilityRole="button"
              accessibilityLabel={t('more', { code: debt.code })}
              hitSlop={KEBAB_SLOP}
            >
              <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </XStack>

        <YStack p={PANEL_PAD} gap={PANEL_GAP} br={PANEL_RADIUS} bg={colors.background}>
          <XStack ai="flex-start" jc="space-between" gap={HEAD_GAP}>
            <Text
              f={1}
              minWidth={0}
              col={colors.textMuted}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.medium}
              numberOfLines={1}
            >
              {[debt.vehicleName, debt.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
            </Text>
            <Text
              flexShrink={0}
              col={late ? colors.danger : colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.body}
            >
              {t(late ? 'overdueAt' : 'dueAt', { date: fmt.date(debt.returnAt) })}
            </Text>
          </XStack>
          <XStack ai="center" jc="space-between" gap={HEAD_GAP}>
            <Text
              flexShrink={1}
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.body}
              numberOfLines={1}
            >
              {t('paid', { amount: fmt.money(debt.paidAmount) })}
            </Text>
            <Text
              flexShrink={0}
              col={colors.danger}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
            >
              {t('debt', { amount: fmt.money(debt.debtAmount) })}
            </Text>
          </XStack>
        </YStack>
      </YStack>
    </Card>
  );
}

export const DebtCard = memo(DebtCardImpl);
