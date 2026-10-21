import { useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  HOLD_REFUND_STATUS,
  isFreeCancelWindowShort,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { DataRow } from '@/components/ui/DataRow';
import { InfoHint } from '@/components/ui/InfoHint';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { RefundAccountSheet } from './RefundAccountSheet';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * TIỀN GIỮ CHỖ của một chuyến đã được nhận, nhìn từ phía KHÁCH — bản native của `TripHoldPanel`.
 *
 * Từ 13/10/2026 (web PR #183) việc TRẢ nằm ở màn thanh toán riêng (`TripPaymentScreen`): chuyển
 * khoản VietQR và ví điện tử ở cùng một chỗ. Khối này ở màn chuyến chỉ còn trả lời ba câu:
 *   1. Phải trả bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Trước khi nào, và hết giờ thì sao;
 *   3. Trả ở đâu — một nút, dẫn sang màn thanh toán.
 *
 * ⚠️ **"Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe"** — hai chủ, hai thời điểm, hai đường về.
 * Dấu "i" cạnh tiêu đề nói rõ khác biệt đó (ADR 0044).
 *
 * Khoản đã khép (đã trả, hết hạn, huỷ, có hoàn) thì khối nói kết cục — `HoldOutcome`.
 *
 * Mọi mốc đọc từ SERVER (`expiresAt`, `freeCancelUntil`) — không tính lại ở client.
 */
export function TripHoldPanel({
  hold,
  tripId,
  tripTotalAmount,
  payAtHandoverAmount,
}: {
  hold: Hold;
  tripId: string;
  /** Tổng khách phải chuẩn bị cả chuyến (đã gồm phụ phí) — null khi chưa có báo giá kèm theo. */
  tripTotalAmount?: string | null;
  /** B − D — phần trả TRỰC TIẾP chủ xe lúc nhận xe, không đi qua khoản giữ chỗ này. */
  payAtHandoverAmount?: string | null;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.hold');
  const tPrice = useTranslations('Common.components.price');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  // Chuyến sát giờ: cửa sổ huỷ miễn phí bị kẹp bởi giờ nhận xe (ADR 0032 điều 5).
  const freeCancelIsShort = isFreeCancelWindowShort(hold);

  /*
   * Bức tranh đầy đủ, CÙNG chữ dùng ở bảng "Chi tiết giá" (phản hồi 18/09/2026). Chỉ vẽ khi CẢ
   * HAI số đều có — thiếu một nửa còn tệ hơn không có gì.
   */
  const summary =
    tripTotalAmount != null && payAtHandoverAmount != null ? (
      <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
        <DataRow label={tPrice('customerTotal')} value={fmt.money(tripTotalAmount)} />
        <DataRow
          label={tPrice('payAtHandover')}
          value={fmt.money(payAtHandoverAmount)}
          tone="price"
          strong
        />
      </YStack>
    ) : null;

  if (!awaiting) return <HoldOutcome hold={hold} tripId={tripId} summary={summary} />;

  return (
    <Card>
      <YStack gap={space.md}>
        {/* HERO: số tiền và đồng hồ — hai thứ khách phải nắm trước khi làm việc gì khác. */}
        <YStack gap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('title')}
            </Text>
            <InfoHint content={t('vsDepositHint')} label={t('vsDepositHintLabel')} />
          </XStack>
          <Text col={colors.price} fos={fontSize.h2} fow={fontWeight.bold}>
            {fmt.money(hold.remainingAmount)}
          </Text>
          <Countdown
            deadline={hold.expiresAt}
            urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
            segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
            labels={{
              remaining: t('countdownRemaining'),
              expired: t('countdownExpired'),
              segment: (index, total) => t('countdownSegment', { index, total }),
            }}
          />
        </YStack>

        {underpaid ? (
          <Callout tone="warning">
            {t('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          </Callout>
        ) : null}

        {summary}

        {/*
          MỘT nút, không phải một mã QR thứ hai: màn thanh toán là nơi duy nhất có đủ kênh trả. Hai
          chỗ trả là hai chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau.
        */}
        <Button variant="gradient"
          size="lg"
          icon="card-outline"
          label={t('payNow')}
          onPress={() => navigateOnce(ROUTES.booking.payment(tripId))}
        />

        <YStack gap={space.xs}>
          <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('expires')}
          </Text>
          {/* ADR 0032 điều 5: cảnh báo cửa sổ huỷ miễn phí ngắn TRƯỚC khi khách trả tiền. */}
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t(freeCancelIsShort ? 'freeCancelSoon' : 'freeCancel', {
              time: fmt.dateTime(hold.freeCancelUntil),
            })}
          </Text>
          {summary ? null : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('restAtHandover')}
            </Text>
          )}
        </YStack>
      </YStack>
    </Card>
  );
}

/**
 * Hold đã chốt hoặc đã chết — nói KẾT CỤC bằng tiếng người, kèm tình trạng hoàn nếu có.
 *
 * Không im lặng ở bất kỳ trạng thái nào: một khoản tiền đã chuyển mà màn hình không nhắc tới là
 * lý do đầu tiên khách gọi hỗ trợ.
 */
export function HoldOutcome({
  hold,
  tripId,
  summary,
}: {
  hold: Hold;
  tripId: string;
  summary: ReactNode;
}) {
  const t = useTranslations('Trips.hold');
  const tRefund = useTranslations('BankAccounts.refund');
  const [refundOpen, setRefundOpen] = useState(false);
  const fmt = useAppFormat();
  const refund = hold.refund;

  if (refund) {
    const paid = refund.status === HOLD_REFUND_STATUS.PAID;
    // Chưa khai tài khoản thì phải có ĐƯỜNG khai ngay đây: một câu "cần tài khoản ngân hàng"
    // không kèm nút là đẩy người dùng đi tìm một màn mà họ không biết tên (ADR 0033).
    const needsAccount = !paid && !refund.hasAccount;

    return (
      <>
        <Callout tone={paid ? 'success' : needsAccount ? 'warning' : 'info'}>
          <CalloutBody>
            {paid
              ? t('refundPaid', { amount: fmt.money(refund.amount) })
              : refund.hasAccount
                ? t('refundPending', { amount: fmt.money(refund.amount) })
                : t('refundNeedsAccount', { amount: fmt.money(refund.amount) })}
          </CalloutBody>
          {needsAccount ? (
            <Button
              label={tRefund('submit')}
              icon="cash-outline"
              variant="secondary"
              size="sm"
              onPress={() => setRefundOpen(true)}
            />
          ) : null}
        </Callout>

        {needsAccount ? (
          <RefundAccountSheet
            tripId={tripId}
            amount={refund.amount}
            open={refundOpen}
            onClose={() => setRefundOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (hold.status === BOOKING_HOLD_STATUS.EXPIRED) {
    return <Callout tone="warning">{t('expired')}</Callout>;
  }
  // `cancelled`: chuyến đã huỷ và khối huỷ đã nói xong — thêm một dải nữa chỉ là lặp.
  if (hold.status === BOOKING_HOLD_STATUS.CANCELLED) return null;

  // `paid` / `released`: tiền đã về và chuyến đã có đơn — nói ngắn, chi tiết ở khối tiền.
  return (
    <YStack gap={space.sm}>
      <Callout tone="success">{t('paid', { amount: fmt.money(hold.paidAmount) })}</Callout>
      {summary}
    </YStack>
  );
}
