import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
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
import { InfoHint } from '@/components/ui/InfoHint';
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
 * TIỀN GIỮ CHỖ của một chuyến đã được nhận, nhìn từ phía KHÁCH — bản native của `TripHoldPanel`.
 *
 * Panel trả lời đúng bốn câu, theo thứ tự khách cần:
 *   1. Phải chuyển bao nhiêu (và còn thiếu bao nhiêu nếu đã chuyển một phần);
 *   2. Trước khi nào, và hết giờ thì sao;
 *   3. Chuyển thế nào — MÃ là thứ quyết định tiền khớp vào chuyến nào;
 *   4. Phần còn lại trả cho ai (chủ xe, lúc nhận xe — ADR 0028 điều 7A).
 *
 * ⚠️ **"Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe"** — hai chủ, hai thời điểm, hai đường về.
 * Dấu "i" cạnh tiêu đề nói rõ khác biệt đó (ADR 0044).
 *
 * **Không màn hình nào xác nhận "đã thanh toán" vì khách chạm một nút.** Nút "Tôi đã chuyển
 * khoản" chỉ đổi cách trình bày sự chờ đợi; chuyến chỉ thành đơn khi backend đối soát xác nhận
 * đã nhận đủ tiền.
 *
 * VietQR mang SẴN số tiền và nội dung (ADR 0016 điều 5): không bao giờ để khách tự gõ mã, vì một
 * ký tự sai là một khoản tiền không khớp được và phải chờ admin xử lý tay. Trên native còn có
 * nút CHÉP cho từng ô — quét QR bằng chính máy đang mở app thì không quét được, và lúc đó chép
 * tay là đường duy nhất.
 *
 * Mọi mốc đọc từ SERVER (`expiresAt`, `freeCancelUntil`) — không tính lại ở client, vì lệch đồng
 * hồ máy khách sẽ rơi đúng vào lúc tiền phụ thuộc vào nó.
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
  const t = useTranslations('Trips.hold');
  const tPrice = useTranslations('Common.components.price');
  const fmt = useAppFormat();
  const copy = useCopy();

  /**
   * Khách đã chạm "Tôi đã chuyển khoản" — CHỈ là một trạng thái hiển thị.
   *
   * Không ghi gì lên server, không rút ngắn hạn nào. Lý do tồn tại: trên điện thoại khách rời
   * hẳn sang app ngân hàng rồi quay lại, và thứ họ cần thấy lúc quay lại là "hệ thống đang xử
   * lý khoản vừa chuyển" — không có nó, màn hình vẫn giục chuyển tiền và người ta chuyển lần hai.
   */
  const [declared, setDeclared] = useState(false);
  /** Ảnh QR không tải được — có gì hiện nấy, không để một khung trống im lặng. */
  const [qrFailed, setQrFailed] = useState(false);

  const awaiting =
    hold.status === BOOKING_HOLD_STATUS.PENDING || hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;

  /*
   * Cửa sổ huỷ miễn phí hẹp hơn cửa sổ trả tiền nghĩa là nó đã bị kẹp bởi giờ nhận xe — chuyến
   * sát giờ. So hai MỐC ĐÃ LƯU của server, không tính lại từ giờ máy khách.
   */
  const freeCancelIsShort =
    new Date(hold.freeCancelUntil).getTime() <= new Date(hold.expiresAt).getTime();

  /*
   * Bức tranh đầy đủ, CÙNG chữ dùng ở bảng "Chi tiết giá" — khách hỏi hoài "chuyển 176k xong
   * thì tổng chuyến/còn lại bao nhiêu" (phản hồi 18/09/2026) vì trước đây khối này chỉ có một
   * câu văn mơ hồ "phần còn lại trả tay chủ xe", không kèm con số. Chỉ vẽ khi CẢ HAI số đều
   * có — thiếu một nửa còn tệ hơn không có gì.
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

  const info = hold.paymentInfo;
  const qrUrl = buildVietQrUrl(info, hold.remainingAmount, hold.code);

  return (
    <Card>
      <YStack gap={space.md}>
        {/*
          HERO: số tiền và đồng hồ đứng cùng một khối, to nhất màn. Đây là hai thứ duy nhất khách
          phải nắm trước khi làm việc gì khác — đẩy chúng xuống dưới một đoạn văn là cách chắc
          chắn để người ta bỏ lỡ hạn, và trên điện thoại thì "dưới" nghĩa là ngoài màn hình.
        */}
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
          {/*
            Đồng hồ CHẠY, không phải một dòng "hạn lúc 14:35": một mốc tuyệt đối bắt khách tự trừ
            nhẩm đúng lúc cần hành động. Trên native điều đó nặng hơn — người dùng rời sang app
            ngân hàng rồi quay lại, và thứ cần thấy ngay khi quay lại là "còn bao lâu".

            Hai chặng 60 phút: ranh giới giữa chúng chính là mốc hệ thống gửi lời nhắc, nên đồng
            hồ và thông báo nói cùng một điều.
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
        </YStack>

        {/*
          MỘT callout duy nhất, và chỉ khi có chuyện bất thường. Trạng thái bình thường ("hãy
          chuyển khoản") đã được nói bằng chính số tiền và mã QR — thêm một dòng nữa là nói lại.
        */}
        {underpaid ? (
          <Callout tone="warning">
            {t('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          </Callout>
        ) : declared ? (
          <Callout tone="info" title={t('checking')}>
            {t('checkingBody')}
          </Callout>
        ) : null}

        {summary}

        {qrUrl && !qrFailed ? (
          <YStack ai="center" gap={space.xs}>
            <Image
              source={{ uri: qrUrl }}
              style={styles.qr}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessibilityLabel={t('qrAlt')}
              onError={() => setQrFailed(true)}
            />
            {/* Khách chưa quen chuyển khoản bằng QR sẽ đứng lại đúng ở bước này. */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('qrCaption')}
            </Text>
          </YStack>
        ) : (
          /*
            Mất QR thì nói THẲNG và chỉ xuống bảng thông tin ngay bên dưới, nơi có đủ mọi thứ để
            chuyển tay. Một khung trắng im lặng là chỗ khách bỏ cuộc.
          */
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {qrUrl ? t('qrFailed') : t('qrUnavailable')}
          </Text>
        )}

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
            hint={<InfoHint content={t('codeHint')} label={t('codeHintLabel')} />}
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
          {/* Đã có con số thật ở `summary` thì câu văn mơ hồ này thừa — chỉ giữ khi thiếu báo giá. */}
          {summary ? null : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('restAtHandover')}
            </Text>
          )}
        </YStack>

        {/*
          "Tôi đã chuyển khoản" KHÔNG xác nhận gì — nó chỉ chuyển màn sang trạng thái chờ đối
          soát. Nút biến mất sau khi chạm: chạm lần hai không làm gì thêm, và một nút vô tác dụng
          là lời mời hiểu nhầm rằng chạm nữa sẽ nhanh hơn.
        */}
        {declared ? null : (
          <Button variant="secondary" label={t('declarePaid')} onPress={() => setDeclared(true)} />
        )}
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
function HoldOutcome({
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
