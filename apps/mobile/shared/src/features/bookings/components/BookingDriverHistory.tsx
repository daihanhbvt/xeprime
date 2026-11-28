import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useTranslations } from 'use-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  DRIVER_WAGE_STAGE,
  STATUS_COLOR,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { useBookingDriverHistory } from '../hooks/use-bookings';
import type { BookingDriverHistoryItem } from '../api';

/** Chấm đầu mỗi lượt (web `.dot`: 8px, lệch xuống 7 cho thẳng dòng tên). */
const DOT = 8;

/**
 * Tấm "Lịch sử gán tài xế" của đơn (ADR 0063) - bản native của web `BookingDriverHistoryDialog`
 * (Figma `24145:62811`), mở từ link ở đầu thẻ Tài xế; chỉ tải khi mở. Mỗi lượt: chấm (đang mở thì
 * vàng), tên · SĐT + tiền công bên phải; "Gán bởi …, lúc …" + viên kết cục; lúc nhận, lý do + vùng
 * của lượt RÚT (ADR 0074), ai kết thúc lượt, lịch sử sửa tiền công + nút sửa (ADR 0075).
 */
export function BookingDriverHistorySheet({
  bookingId,
  subtitle,
  open,
  onClose,
  canEditWage = false,
  onEditWage,
  overlay,
}: {
  /** Tấm mở từ trong tấm này (Sửa tiền công) - vẽ BÊN TRONG để chồng lên, không đóng lịch sử. */
  overlay?: ReactNode;
  bookingId: string;
  /** "Đơn hàng #…, khung giờ". */
  subtitle: string;
  open: boolean;
  onClose: () => void;
  canEditWage?: boolean;
  onEditWage?: (item: BookingDriverHistoryItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.history');
  const tDialog = useTranslations('Drivers.booking.historyDialog');
  const tWage = useTranslations('Drivers.wage');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const history = useBookingDriverHistory(bookingId, open);

  const meta = (text: string) => (
    <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
      {text}
    </Text>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={tDialog('title')}
      subtitle={subtitle}
      chrome="v2"
      headerDivider
      footer={
        <Button label={tDialog('close')} variant="outline" onPress={onClose} />
      }
    >
      {history.isLoading ? (
        <SkeletonText lines={4} />
      ) : history.isError ? (
        meta(t('loadError'))
      ) : !history.data?.length ? (
        meta(t('empty'))
      ) : (
        <YStack>
          {history.data.map((h, index) => {
            const outcome = h.outcome as DriverAssignmentOutcome;
            const isOpen = outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN;
            return (
              /*
                Bản gọn cho mobile (người dùng 28/11/2026), mỗi lượt 2 dòng: tên + tiền công + bút
                sửa; viên kết cục + giờ gán (+ lý do nếu tài xế RÚT - ADR 0074).
              */
              <XStack
                key={h.id}
                gap={space.sm}
                ai="center"
                py={space.sm}
                {...(index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : {})}
              >
                <YStack w={DOT} h={DOT} br={radius.pill} bg={isOpen ? colors.primary : colors.border} />
                <YStack f={1} minWidth={0} gap={2}>
                  <XStack ai="center" gap={space.sm}>
                    <Text
                      f={1}
                      numberOfLines={1}
                      col={colors.text}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.semibold}
                    >
                      {h.driverName}
                    </Text>
                    {h.wage.amount !== null ? (
                      <Text
                        col={colors.text}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                        fow={fontWeight.semibold}
                      >
                        {fmt.money(h.wage.amount)}
                      </Text>
                    ) : null}
                    {canEditWage && onEditWage && h.wage.editable ? (
                      <Pressable
                        onPress={() => onEditWage(h)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          h.wage.stage === DRIVER_WAGE_STAGE.NOT_RUN
                            ? tWage('edit.actionAgreed')
                            : tWage('edit.action')
                        }
                        hitSlop={space.sm}
                      >
                        <LineIcon name="edit" size={iconSize.md} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </XStack>
                  <XStack ai="center" gap={space.sm}>
                    <StatusBadge
                      borderless
                      size="sm"
                      label={domainLabel('driverAssignmentOutcome', h.outcome)}
                      color={DRIVER_ASSIGNMENT_OUTCOME_META[outcome]?.color ?? STATUS_COLOR.NEUTRAL}
                    />
                    <Text f={1} numberOfLines={1} col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                      {h.dropReasonCategory
                        ? domainLabel('driverDropReason', h.dropReasonCategory)
                        : fmt.dateTime(h.assignedAt)}
                    </Text>
                  </XStack>
                </YStack>
              </XStack>
            );
          })}
        </YStack>
      )}
      {overlay}
    </BottomSheet>
  );
}
