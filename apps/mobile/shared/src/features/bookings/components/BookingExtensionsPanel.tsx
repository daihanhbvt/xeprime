import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_EXTENSION_STATUS,
  BOOKING_EXTENSION_STATUS_META,
  BOOKING_STATUS,
  PERMISSION,
  SERVICE_TYPE,
} from '@xeprime/types';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useBookingExtensions } from '../hooks/use-booking-extensions';
import type { BookingDetail } from '../api';
import { ExtendBookingSheet } from './ExtendBookingSheet';

/**
 * PHỤ LỤC GIA HẠN của một đơn dài hạn (ADR 0077) — bản native của `BookingExtensionsPanel` (web):
 * lịch sử các lần gia hạn + lối "Gia hạn" / "Xem mã thanh toán". Đơn không phải dài hạn ⇒ không có
 * khối này. App không có phiên hỗ trợ của nền tảng nên không có nhánh `useSupportHides` như web.
 */
export function BookingExtensionsPanel({ booking }: { booking: BookingDetail }) {
  const t = useTranslations('Bookings.extension');
  const colors = useColors();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const longTerm = booking.serviceType === SERVICE_TYPE.LONG_TERM;
  const extensions = useBookingExtensions(booking.id, longTerm);
  const [open, setOpen] = useState(false);

  if (!longTerm) return null;
  const rows = extensions.data ?? [];
  // Chỉ đơn đặt qua chợ: đơn tự lập không có tài khoản khách nhận QR / tiền hoàn (ADR 0077).
  const canExtend =
    permissions.has(PERMISSION.BOOKING_UPDATE) &&
    booking.status === BOOKING_STATUS.ACTIVE &&
    booking.bookingRequestId != null;
  const pending = rows.some((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
  if (!canExtend && rows.length === 0 && !extensions.isError) return null;

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          <BlockTitle
            action={
              canExtend ? (
                <BlockLink
                  label={pending ? t('viewPayment') : t('action')}
                  onPress={() => setOpen(true)}
                />
              ) : undefined
            }
          >
            {t('panelTitle')}
          </BlockTitle>
          {extensions.isError ? (
            <Callout tone="danger">{errorMessage(extensions.error)}</Callout>
          ) : rows.length === 0 ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('freeNote')}
            </Text>
          ) : (
            rows.map((e) => (
              <XStack key={e.id} ai="center" gap={space.sm}>
                <YStack f={1} gap={2}>
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {t('rowSummary', {
                      months: e.months,
                      from: fmt.shortDateTime(e.fromAt),
                      to: fmt.shortDateTime(e.toAt),
                    })}
                  </Text>
                  <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {fmt.money(e.rentalAmount)}
                  </Text>
                </YStack>
                <StatusBadge
                  label={t(`status.${e.status}`)}
                  color={BOOKING_EXTENSION_STATUS_META[e.status].color}
                  size="sm"
                />
              </XStack>
            ))
          )}
        </YStack>
      </Card>
      {open ? <ExtendBookingSheet booking={booking} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
