import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_REFUND_STATUS,
} from '@xeprime/types';
import { buildVietQrUrl } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { RefundAccountSheet } from './RefundAccountSheet';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/** Ảnh QR do VietQR sinh — tỉ lệ cố định của bản `compact2`. */
const QR_WIDTH = 260;
const QR_HEIGHT = 308;

const styles = StyleSheet.create({
  qr: {
    width: QR_WIDTH,
    height: QR_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/**
 * Khoản GIỮ CHỖ của một chuyến, nhìn từ phía KHÁCH (BKG-15) — bản native của `TripHoldPanel`.
 *
 * Panel trả lời đúng bốn câu, theo thứ tự khách cần:
 *   1. Phải chuyển bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Nội dung chuyển khoản là gì — MÃ, thứ quyết định tiền khớp vào chuyến nào;
 *   3. Trước khi nào, nếu không thì chỗ được nhả;
 *   4. Phần còn lại trả cho ai (chủ xe, lúc nhận xe — ADR 0028 điều 7A).
 *
 * VietQR mang SẴN số tiền và nội dung (ADR 0016 điều 5): không bao giờ để khách tự gõ mã, vì một
 * ký tự sai là một khoản tiền không khớp được và phải chờ admin xử lý tay. Trên native còn có
 * nút CHÉP cho từng ô — quét QR bằng chính máy đang mở app thì không quét được, và lúc đó chép
 * tay là đường duy nhất.
 *
 * Mọi mốc đọc từ SERVER (`expiresAt`, `freeCancelUntil`) — không tính lại ở client, vì lệch đồng
 * hồ máy khách sẽ rơi đúng vào lúc tiền phụ thuộc vào nó.
 */
export function TripHoldPanel({ hold, tripId }: { hold: Hold; tripId: string }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const copy = useCopy();

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  /*
   * Cửa sổ huỷ miễn phí hẹp hơn cửa sổ trả tiền nghĩa là nó đã bị kẹp bởi giờ nhận xe — chuyến
   * sát giờ. So hai MỐC ĐÃ LƯU của server, không tính lại từ giờ máy khách.
   */
  const freeCancelIsShort =
    new Date(hold.freeCancelUntil).getTime() <= new Date(hold.expiresAt).getTime();

  if (!awaiting) return <HoldOutcome hold={hold} tripId={tripId} />;

  const info = hold.paymentInfo;
  const qrUrl = buildVietQrUrl(info, hold.remainingAmount, hold.code);

  return (
    <Card>
      <YStack gap={space.md}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {t('title')}
        </Text>

        <Callout tone={hold.status === BOOKING_HOLD_STATUS.UNDERPAID ? 'warning' : 'info'}>
          {hold.status === BOOKING_HOLD_STATUS.UNDERPAID
            ? t('partialIntro', { paid: fmt.money(hold.paidAmount) })
            : t('intro')}
        </Callout>

        {qrUrl ? (
          <YStack ai="center" gap={space.xs}>
            <Image
              source={{ uri: qrUrl }}
              style={styles.qr}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessibilityLabel={t('qrAlt')}
            />
            {/* Khách chưa quen chuyển khoản bằng QR sẽ đứng lại đúng ở bước này. */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('qrCaption')}
            </Text>
          </YStack>
        ) : null}

        <YStack>
          {info.configured ? (
            <>
              {info.bankCode ? (
                <DataRow
                  label={t('bank')}
                  value={info.bankCode}
                  action={
                    <IconButton
                      icon="copy-outline"
                      label={t('copyBank')}
                      onPress={() => void copy(info.bankCode as string)}
                    />
                  }
                />
              ) : null}
              <DataRow
                label={t('accountNumber')}
                value={info.accountNumber ?? ''}
                strong
                {...(info.accountNumber
                  ? {
                      action: (
                        <IconButton
                          icon="copy-outline"
                          label={t('copyAccount')}
                          onPress={() => void copy(info.accountNumber as string)}
                        />
                      ),
                    }
                  : {})}
              />
              {info.accountName ? (
                <DataRow
                  label={t('accountName')}
                  value={info.accountName}
                  action={
                    <IconButton
                      icon="copy-outline"
                      label={t('copyAccountName')}
                      onPress={() => void copy(info.accountName as string)}
                    />
                  }
                />
              ) : null}
            </>
          ) : null}

          <DataRow
            label={t('amount')}
            value={fmt.money(hold.remainingAmount)}
            strong
            tone="price"
            action={
              <IconButton
                icon="copy-outline"
                label={t('copyAmount')}
                onPress={() => void copy(hold.remainingAmount)}
              />
            }
          />
          {/*
            MÃ là thứ quyết định tiền khớp vào chuyến nào — nên nó đứng riêng một hàng, in đậm,
            và có nút chép. Gõ tay sai một ký tự là một khoản tiền treo chờ admin gỡ.
          */}
          <DataRow
            label={t('code')}
            value={hold.code}
            strong
            action={
              <IconButton
                icon="copy-outline"
                label={t('copyCode')}
                onPress={() => void copy(hold.code)}
              />
            }
          />
        </YStack>

        {/*
          Đồng hồ CHẠY, không phải một dòng "hạn lúc 14:35": cửa sổ chỉ còn 10 phút (ADR 0039
          điều 2), và một mốc giờ tuyệt đối bắt khách tự trừ nhẩm đúng lúc họ cần hành động
          nhanh. Trên native điều đó còn nặng hơn — người dùng rời app sang app ngân hàng rồi
          quay lại, và thứ họ cần thấy ngay khi quay lại là "còn bao lâu".

          `segmentMs` bằng đúng cửa sổ nên chỉ có MỘT chặng và nhãn chặng không hiện — giữ tham
          số lại để cửa sổ dài ra là chia chặng chạy lại ngay, không phải nối lại dây.
        */}
        <Countdown
          deadline={hold.expiresAt}
          urgentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
          segmentMs={HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000}
          labels={{
            remaining: t('countdownRemaining'),
            expired: t('countdownExpired'),
            segment: (index, total) => t('countdownSegment', { index, total }),
          }}
        />

        <YStack gap={space.xs}>
          <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('expires')}
          </Text>
          {/*
            Huỷ miễn phí đếm XUÔI từ mốc đặt và bị kẹp bởi giờ nhận xe, nên chuyến sát giờ có cửa
            sổ ngắn hơn 4 tiếng — ADR 0032 điều 5 bắt cảnh báo điều đó TRƯỚC khi khách trả tiền.
          */}
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t(freeCancelIsShort ? 'freeCancelSoon' : 'freeCancel', {
              time: fmt.dateTime(hold.freeCancelUntil),
            })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('restAtHandover')}
          </Text>
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
function HoldOutcome({ hold, tripId }: { hold: Hold; tripId: string }) {
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
  return <Callout tone="success">{t('paid', { amount: fmt.money(hold.paidAmount) })}</Callout>;
}
