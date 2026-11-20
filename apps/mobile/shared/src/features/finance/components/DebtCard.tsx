import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { LIST_SEPARATOR, overdueDays } from '@xeprime/domain';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { CardAction } from '@/components/ui/CardActionBar';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { DebtItem } from '../api';

/** Chiều cao thanh thu hồi — mảnh hơn `ProgressBar` (8pt) vì nó là nét phụ, không phải số liệu chính. */
const TRACK_HEIGHT = 6;

const FULL_PERCENT = 100;

/**
 * Tỉ lệ ĐÃ THU trên PHẢI THU, chỉ để vẽ thanh.
 *
 * `Number()` trên chuỗi tiền chỉ được phép ở đây: đầu ra là một bề rộng phần trăm, không phải một
 * con số hiện cho người dùng — mọi số tiền trong thẻ vẫn đi thẳng từ chuỗi qua `fmt.money` (ADR 0007).
 */
function paidPercent(paid: string, total: string): number {
  // Web `DebtTable.paidPercent`: tổng ≤ 0 ⇒ 0%, làm tròn XUỐNG.
  const totalValue = Number(total);
  const paidValue = Number(paid);
  if (!Number.isFinite(totalValue) || !Number.isFinite(paidValue) || totalValue <= 0) return 0;
  return Math.min(FULL_PERCENT, Math.max(0, Math.floor((paidValue / totalValue) * FULL_PERCENT)));
}

/**
 * Một đơn còn nợ — bản native của một dòng `DebtTable`.
 *
 * **Trạng thái đơn nằm ở góc PHẢI trên**, đối diện tên khách + mã đơn: hai thứ đó là hai câu hỏi
 * khác nhau ("ai nợ" ↔ "đơn đang ở giai đoạn nào") nên đặt hai đầu một hàng thay vì xếp chồng —
 * tiết kiệm một dòng trên mỗi thẻ, mà danh sách công nợ là danh sách người ta cuộn rất dài.
 * Trạng thái vẫn đọc được TRƯỚC các con số vì nó ở tầng trên cùng: một đơn `reserved`/`confirmed`
 * (xe chưa ra khỏi bãi) còn nợ là chuyện bình thường, không phải việc phải đi đòi.
 *
 * Màu trạng thái lấy từ `BOOKING_STATUS_META` dùng chung (ADR 0005) — cùng một trạng thái ở lịch,
 * ở chi tiết đơn và ở đây luôn ra cùng màu, và nó cũng là màu VẠCH ở mép trái thẻ.
 *
 * Thao tác đi qua `CardActionBar` như mọi thẻ danh sách khác, thay cho hai nút tô nền: trong một
 * thẻ vốn đã có nhãn trạng thái, một số tiền đỏ cỡ tiêu đề và một thanh tiến độ xanh, hai viên
 * nút tô nền là mảng màu thứ tư — mắt hết chỗ bám. "Thu tiền" mang tông `success` vì nó ĐÓNG một
 * khoản nợ lại, không phải một lối đi tiếp.
 */
function DebtCardImpl({
  debt,
  canView,
  canCollect,
  onView,
  onCollect,
}: {
  debt: DebtItem;
  canView: boolean;
  canCollect: boolean;
  onView: (debt: DebtItem) => void;
  onCollect: (debt: DebtItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.debts.table');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = debt.status as BookingStatus;
  const percent = paidPercent(debt.paidAmount, debt.totalAmount);
  // Số ngày trễ so với hạn trả — web cột Hạn trả (PR #276).
  const late = overdueDays(debt.returnAt);

  const actions: CardAction[] = [
    ...(canView
      ? [
          {
            key: 'view',
            label: t('actions.view'),
            icon: 'eye-outline' as IconName,
            onPress: () => onView(debt),
          },
        ]
      : []),
    ...(canCollect
      ? [
          {
            key: 'collect',
            label: t('actions.collect'),
            icon: 'cash-outline' as IconName,
            tone: 'success' as const,
            onPress: () => onCollect(debt),
          },
        ]
      : []),
  ];

  return (
    // Khuôn thẻ danh sách chuẩn: mã đơn + viên trạng thái, khách, dòng FactRow, thanh thu hồi, 2 nút vàng.
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
            {`#${debt.code}`}
          </Text>
          <Pill
            label={domainLabel('bookingStatus', status, metaLabel(BOOKING_STATUS_META, status))}
            tone={pillToneOfStatusColor(metaColor(BOOKING_STATUS_META, status))}
          />
        </XStack>
        <FactRow label={t('columns.customer')} sub={debt.customerPhone ?? null}>
          {debt.customerName}
        </FactRow>
        <FactRow label={t('columns.vehicleFull')}>
          {[debt.vehicleName, debt.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
        </FactRow>
        <FactRow
          label={t('columns.dueAt')}
          {...(late > 0 ? { tone: colors.danger } : {})}
          sub={late > 0 ? t('overdueDays', { count: late }) : null}
        >
          {fmt.date(debt.returnAt)}
        </FactRow>
        <FactRow label={t('columns.total')}>{fmt.money(debt.totalAmount)}</FactRow>
        <FactRow label={t('columns.paid')}>{fmt.money(debt.paidAmount)}</FactRow>
        <FactRow label={t('columns.debt')} tone={colors.danger}>
          {fmt.money(debt.debtAmount)}
        </FactRow>
        {/* Thanh thu hồi: phần đã thu trên tổng phải thu. */}
        <YStack
          h={TRACK_HEIGHT}
          br={radius.pill}
          bg={colors.surfaceMuted}
          ov="hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: FULL_PERCENT, now: Math.round(percent) }}
        >
          <YStack h={TRACK_HEIGHT} br={radius.pill} bg={colors.success} width={`${percent}%`} />
        </YStack>
        {actions.length > 0 ? (
          <XStack gap={space.sm} pt={space.xs}>
            {actions.map((action) => (
              <YStack key={action.key} flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
                <Button
                  label={action.label}
                  icon={action.icon}
                  variant="gradient"
                  size="compact"
                  onPress={action.onPress}
                />
              </YStack>
            ))}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

export const DebtCard = memo(DebtCardImpl);
