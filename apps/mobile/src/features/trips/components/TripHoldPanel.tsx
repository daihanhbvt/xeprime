import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_HOLD_STATUS, HOLD_REFUND_STATUS } from '@xeprime/types';
import { buildVietQrUrl } from '@xeprime/domain';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/** Ảnh QR do VietQR sinh — tỉ lệ cố định của bản `compact2`. */
const QR_WIDTH = 220;
const QR_HEIGHT = 260;

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
export function TripHoldPanel({ hold }: { hold: Hold }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const tActions = useTranslations('Common.actions');

  const copy = useCallback(
    async (value: string) => {
      await Clipboard.setStringAsync(value);
      toast.showSuccess(tActions('copied'));
    },
    [tActions, toast],
  );

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  if (!awaiting) return <HoldOutcome hold={hold} />;

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
          <YStack ai="center">
            <Image
              source={{ uri: qrUrl }}
              style={styles.qr}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessibilityLabel={t('qrAlt')}
            />
          </YStack>
        ) : null}

        <YStack>
          {info.configured ? (
            <>
              <DataRow label={t('bank')} value={info.bankCode ?? ''} />
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
              <DataRow label={t('accountName')} value={info.accountName ?? ''} />
            </>
          ) : null}

          <DataRow
            label={t('amount')}
            value={fmt.money(hold.remainingAmount)}
            strong
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

        <YStack gap={space.xs}>
          <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('expires', { time: fmt.dateTime(hold.expiresAt) })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('freeCancel', { time: fmt.dateTime(hold.freeCancelUntil) })}
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
function HoldOutcome({ hold }: { hold: Hold }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const refund = hold.refund;

  if (refund) {
    const paid = refund.status === HOLD_REFUND_STATUS.PAID;
    return (
      <Callout tone={paid ? 'success' : 'info'}>
        {paid
          ? t('refundPaid', { amount: fmt.money(refund.amount) })
          : refund.hasAccount
            ? t('refundPending', { amount: fmt.money(refund.amount) })
            : t('refundNeedsAccount', { amount: fmt.money(refund.amount) })}
      </Callout>
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
