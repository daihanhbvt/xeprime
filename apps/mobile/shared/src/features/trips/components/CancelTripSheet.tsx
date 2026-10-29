import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useEffect, useState } from 'react';
import {
  CUSTOMER_CANCEL_PREVIEW_KIND,
  CUSTOMER_CANCELLATION_REASON_VALUES,
  CUSTOMER_TRIP_STAGE,
  type CustomerCancellationReason,
  type CustomerTripStage,
} from '@xeprime/types';
import { isZeroMoney, LEGAL_DOC } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTripCancelPreview, CustomerTripDetail } from '../api';
import { useTripCancelPreview } from '../hooks/use-trips';

/** Vòng biểu tượng cảnh báo đầu tấm — 56px như `.featuredIcon` của web (Figma 21621:31264). */
const FEATURED_ICON = 56;
const FEATURED_ICON_RING = 6;
const FEATURED_ICON_GLYPH = 28;
/** `--xp-space-12` — khoảng giữa các khối của phiếu huỷ muộn (thang Figma không có bậc 12 riêng). */
const SPACE_12 = space.sm + space.xs;

/**
 * Xác nhận huỷ chuyến — bản native của `CancelTripDialog` web.
 *
 * Huỷ là việc KHÔNG HOÀN TÁC, nên có bước xác nhận; chữ đổi theo chặng vì hệ quả khác nhau thật
 * (rút yêu cầu chưa ai duyệt · nhả xe đang được giữ · huỷ đơn đã chốt).
 *
 * TIỀN QUA XEPRIME (khoản giữ chỗ) đọc từ `GET /trips/:id/cancel-preview` — server tính bằng đúng
 * luật lượt bấm sẽ áp (ADR 0064). Khách thấy số được hoàn và số mất TRƯỚC khi bấm; client không
 * cộng trừ gì. Tiền đã đưa thẳng cho chủ xe KHÔNG đi qua XePrime — nói thẳng, không có nút hoàn.
 *
 * Khác web ở TƯƠNG TÁC: lý do huỷ là hàng chip thay cho ô Select (tấm trượt native).
 */
export function CancelTripSheet({
  open,
  onClose,
  trip,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  trip: CustomerTripDetail;
  onConfirm: (reasonCategory: CustomerCancellationReason) => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.cancel');
  const fmt = useAppFormat();
  const openDoc = useOpenLegalDoc();
  const preview = useTripCancelPreview(trip.id, open);

  const stage = trip.stage as CustomerTripStage;
  const pending = stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL;
  const awaitingHold = stage === CUSTOMER_TRIP_STAGE.AWAITING_HOLD;
  const finance = trip.finance;
  const rentalPaid = finance && !isZeroMoney(finance.rentalPaid);
  const depositPaid = finance && !isZeroMoney(finance.depositReceived);
  /**
   * Server nói chặng này KHÔNG huỷ được nữa (đơn đang chạy — ADR 0045 điều 1). Khoá nút ngay ở đây
   * thay vì để khách bấm rồi nhận một lỗi.
   */
  const notAllowed = preview.data?.allowed === false;
  /** Có tiền giữ chỗ qua XePrime ⇒ câu "đã thanh toán" + "Dự kiến hoàn lại" (số do server tính). */
  const refundable =
    preview.data &&
    (preview.data.kind === CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND ||
      preview.data.kind === CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL)
      ? preview.data
      : null;
  /** Nhóm lý do bắt buộc (Figma 21621:31264) — chỉ mô tả VÌ SAO; ai chịu do server suy (ADR 0045). */
  const [reason, setReason] = useState<CustomerCancellationReason | null>(null);
  const [touched, setTouched] = useState(false);
  // Tấm đóng từ NGOÀI (huỷ xong, màn chuyển chặng) cũng phải rơi lựa chọn cũ — như `close()` bên dưới.
  useEffect(() => {
    if (open) return;
    setReason(null);
    setTouched(false);
  }, [open]);
  const close = () => {
    setReason(null);
    setTouched(false);
    onClose();
  };
  const confirm = () => {
    if (loading || notAllowed) return;
    if (!reason) {
      setTouched(true);
      return;
    }
    onConfirm(reason);
  };

  const policyLink = (chunks: ReactNode) => (
    <Text
      col={colors.textMuted}
      textDecorationLine="underline"
      onPress={() => openDoc(LEGAL_DOC.CANCELLATION)}
      accessibilityRole="link"
    >
      {chunks}
    </Text>
  );

  return (
    <BottomSheet
      open={open}
      onClose={close}
      footer={
        <XStack gap={space.sm}>
          {/*
            Hai hành động NGẮN nằm một hàng: lối thoát bên trái, hành động chính bên phải. Ở đây
            "Quay lại" co vừa chữ, "Xác nhận hủy" lấy phần còn lại.
          */}
          <YStack flexShrink={0}>
            <Button label={t('keep')} variant="ghost" onPress={close} />
          </YStack>
          <YStack f={1}>
            <Button
              label={t('confirm')}
              icon="close-circle-outline"
              variant="danger"
              loading={loading}
              disabled={notAllowed}
              onPress={confirm}
            />
          </YStack>
        </XStack>
      }
    >
      <YStack gap={space.md}>
        {/* Đầu tấm theo Figma 21621:31264: vòng cảnh báo đỏ, tiêu đề và lời dẫn căn giữa. */}
        <YStack ai="center" gap={space.xs}>
          <YStack
            w={FEATURED_ICON}
            h={FEATURED_ICON}
            mb={space.sm}
            br={radius.pill}
            bw={FEATURED_ICON_RING}
            bc={colors.dangerRing}
            bg={colors.dangerSurface}
            ai="center"
            jc="center"
          >
            <Ionicons
              name="alert-circle-outline"
              size={FEATURED_ICON_GLYPH}
              color={colors.danger}
            />
          </YStack>
          <Text
            col={colors.text}
            fos={fontSize.h4}
            fow={fontWeight.semibold}
            ta="center"
            accessibilityRole="header"
          >
            {t('title')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body} ta="center">
            {refundable
              ? t.rich('leadPaid', { policy: policyLink })
              : pending
                ? t('leadPending')
                : awaitingHold
                  ? t('leadAwaitingHold')
                  : t('leadReady')}
          </Text>
          {refundable ? (
            <Text col={colors.placeholder} fos={fontSize.body} ta="center">
              {t.rich('expectedRefund', {
                amount: fmt.money(refundable.refundAmount),
                gold: (chunks) => (
                  <Text col={colors.primary} fow={fontWeight.medium}>
                    {chunks}
                  </Text>
                ),
              })}
            </Text>
          ) : null}
        </YStack>

        {preview.isLoading ? (
          <SkeletonText lines={2} />
        ) : preview.isError ? (
          <Callout tone="warning" title={t('preview.error')} />
        ) : notAllowed ? (
          <Callout tone="warning" title={t('preview.notAllowedTitle')}>
            {t('preview.notAllowedBody')}
          </Callout>
        ) : preview.data ? (
          <CancelMoneyPreview preview={preview.data} />
        ) : null}

        {rentalPaid || depositPaid ? (
          <Callout tone="warning" title={t('paidTitle')}>
            <YStack gap={space.xs}>
              {rentalPaid ? (
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {t('rentalPaid', { amount: fmt.money(finance.rentalPaid) })}
                </Text>
              ) : null}
              {depositPaid ? (
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {t('depositPaid', { amount: fmt.money(finance.depositReceived) })}
                </Text>
              ) : null}
              {/* Nói đúng năng lực của hệ thống: XePrime ghi nhận, chủ xe mới là người chuyển tiền. */}
              <Text col={colors.text} fos={fontSize.bodySm} mt={space.xs}>
                {t('refundNote')}
              </Text>
            </YStack>
          </Callout>
        ) : null}

        {notAllowed ? null : (
          <YStack gap={space.sm}>
            <FieldLabel label={t('reasonLabel')} required />
            <XStack gap={space.xs} flexWrap="wrap">
              {CUSTOMER_CANCELLATION_REASON_VALUES.map((value) => (
                <Chip
                  key={value}
                  label={t(`reasons.${value}`)}
                  size="sm"
                  selected={reason === value}
                  onPress={() => setReason(value)}
                />
              ))}
            </XStack>
            {touched && !reason ? (
              <Text col={colors.danger} fos={fontSize.label} accessibilityRole="alert">
                {t('reasonRequired')}
              </Text>
            ) : null}
          </YStack>
        )}
      </YStack>
    </BottomSheet>
  );
}

/**
 * Khoản giữ chỗ đi đâu nếu huỷ ngay — câu theo `kind` của server, không câu nào tự tính.
 * `no_charge` / `not_allowed` không vẽ gì: không có đồng nào qua XePrime để nói.
 */
function CancelMoneyPreview({ preview }: { preview: CustomerTripCancelPreview }) {
  const colors = useColors();
  const t = useTranslations('Trips.cancel.preview');
  const fmt = useAppFormat();

  const deferred = preview.deferred ? (
    <Text col={colors.text} fos={fontSize.bodySm}>
      {t('deferred')}
    </Text>
  ) : null;

  // Hoàn đủ: đầu tấm đã nói số đã trả + dự kiến hoàn — như web (#233), chỉ còn lời nhắc hoàn CHẬM.
  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.FULL_REFUND) return deferred;

  if (preview.kind === CUSTOMER_CANCEL_PREVIEW_KIND.LATE_CANCEL) {
    const title = preview.freeCancelAvailable ? t('lateTitle') : t('noFreeCancelTitle');
    /*
     * Quá mốc huỷ miễn phí — khung phiếu sạch theo Figma `21621:31264` (nền xám nhạt, bo 12, hàng
     * nhãn/số), không khung cảnh báo cam đặc. Lời nhắc hệ quả nằm ở dải vàng nhạt bên dưới.
     */
    return (
      <YStack
        gap={SPACE_12}
        p={space.md}
        bw={1}
        bc={colors.border}
        br={radius.control}
        bg={colors.background}
        accessibilityLabel={title}
      >
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {title}
        </Text>
        <YStack gap={space.sm}>
          <FactRow label={t('paid')} value={fmt.money(preview.paidAmount)} />
          <FactRow
            label={t('forfeit')}
            value={fmt.money(preview.forfeitAmount)}
            valueColor={colors.danger}
          />
          <YStack h={1} bg={colors.border} />
          <FactRow label={t('refund')} value={fmt.money(preview.refundAmount)} total />
        </YStack>
        <YStack px={SPACE_12} py={space.sm} br={radius.control} bg={colors.primarySubtle}>
          <Text col={colors.warning} fos={fontSize.bodySm}>
            {isZeroMoney(preview.insuranceRefundAmount)
              ? t('lateBodyNoInsurance')
              : t('lateBody', { insurance: fmt.money(preview.insuranceRefundAmount) })}
          </Text>
        </YStack>
        {deferred}
      </YStack>
    );
  }

  return null;
}

/** Một hàng nhãn/số của phiếu huỷ muộn — dòng `total` là "Hoàn vào Ví điểm", nổi lên cuối phiếu. */
function FactRow({
  label,
  value,
  valueColor,
  total = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  total?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack jc="space-between" gap={space.sm}>
      <Text
        f={1}
        col={total ? colors.text : colors.textMuted}
        fos={fontSize.body}
        fow={total ? fontWeight.semibold : fontWeight.regular}
      >
        {label}
      </Text>
      <Text
        col={total ? colors.primaryHover : (valueColor ?? colors.text)}
        fos={total ? fontSize.bodyLg : fontSize.body}
        fow={total ? fontWeight.semibold : fontWeight.medium}
      >
        {value}
      </Text>
    </XStack>
  );
}
