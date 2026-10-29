import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Callout } from '@/components/ui/Callout';
import { OwnerPayoutTable } from '@/features/bookings/components/OwnerPayoutTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingRequestItem } from '../api';

export type ApprovalPreview = NonNullable<BookingRequestItem['approvalPreview']>;
export type ApprovalWindows = NonNullable<ApprovalPreview['windows']>;

/**
 * XEM TRƯỚC lượt duyệt cho gian hàng — bản native của `ApprovalPreviewSummary` web (ADR 0064).
 *
 * Tiền của chủ xe (bảng cộng ví dùng chung với chi tiết đơn) và hai cửa sổ của khách NẾU duyệt
 * ngay. Mọi con số do server tính; `windows` của dài hạn do nơi gọi dựng bằng `holdWindowsPreview`
 * trên giờ nhận vừa chọn. Luôn gắn nhãn ƯỚC TÍNH — số chốt đóng băng lúc duyệt (ADR 0024).
 */
export function ApprovalPreviewSummary({
  preview,
  windows,
  windowsPendingHint,
  showMoney = true,
}: {
  preview: ApprovalPreview;
  /** Hai cửa sổ nếu duyệt ngay — `undefined` = dùng `preview.windows` của server. */
  windows?: ApprovalWindows | null;
  /** Câu thay cho khối cửa sổ khi chưa có giờ nhận (dài hạn chưa chọn giờ). */
  windowsPendingHint?: string;
  /** `false` = chỉ hiện hai cửa sổ — số tiền server ước không phải tiền của chuyến này (dài hạn legacy). */
  showMoney?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.approvalPreview');
  const fmt = useAppFormat();
  const w = windows === undefined ? preview.windows : windows;

  const note = (text: string) => (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {text}
    </Text>
  );

  return (
    <YStack
      gap={space.xs}
      py={space.sm}
      px={space.md}
      bw={1}
      bc={colors.border}
      br={radius.sm}
      accessibilityLabel={t('title')}
    >
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <YStack px={space.xs} br={radius.sm} bg={colors.surfaceMuted}>
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('estimate')}
          </Text>
        </YStack>
      </XStack>

      {showMoney ? <OwnerPayoutTable payout={preview.ownerPayout} label={t('title')} /> : null}

      {!preview.collectsHold ? (
        note(t('noHold'))
      ) : w ? (
        <>
          <YStack gap={2} paddingLeft={space.xs}>
            {note(
              `• ${t('paymentWindow', {
                duration: fmt.minutesDuration(w.paymentWindowMinutes),
                time: fmt.dateTime(w.expiresAt),
              })}`,
            )}
            {note(
              `• ${
                w.freeCancelMinutes > 0
                  ? t('freeCancel', {
                      duration: fmt.minutesDuration(w.freeCancelMinutes),
                      time: fmt.dateTime(w.freeCancelUntil),
                    })
                  : t('noFreeCancel')
              }`,
            )}
            {note(`• ${t('lateCancel')}`)}
          </YStack>
          {w.tooShort ? <Callout tone="warning" title={t('tooShort')} /> : null}
        </>
      ) : windowsPendingHint ? (
        note(windowsPendingHint)
      ) : null}
    </YStack>
  );
}
