import { type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  PERMISSION,
  type DepositStatus,
  type RefundMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SectionCard } from '@/components/ui/SectionCard';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useSettlement } from '@/features/settlement/hooks/use-settlement';
import { useAppFormat } from '@/i18n/use-app-format';
import { getErrorMessage } from '@/lib/get-error-message';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ExcessMileageFacts } from './ExcessMileageFacts';
import { showsExcessMileageFacts } from '@/features/settlement/excess-mileage-visibility';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * "Phát sinh & tiền cọc" — bản native của `SettlementCard`.
 *
 * Ranh giới quan trọng nhất: **cọc CẤU HÌNH không phải cọc ĐÃ THU**. Chưa có bằng chứng thu tiền
 * thì thẻ nói thẳng "Chưa ghi nhận đã thu cọc" và KHÔNG mời hoàn tiền — tạo một việc "hoàn 5
 * triệu" cho khoản chưa ai thu là cách nhanh nhất để chủ xe mất tiền thật.
 *
 * Hoàn cọc là việc THEO DÕI, không chặn hoàn tất chuyến: đơn đã hoàn tất từ lúc nhận lại xe.
 *
 * Khác web đúng một chỗ: web mở ba hộp thoại ngay tại thẻ, native đẩy sang màn Quyết toán nơi đã
 * có sẵn cả ba form. Mọi con số và câu trạng thái thì giữ nguyên.
 */
export function BookingSettlementCard({
  bookingId,
  moneyClosed = false,
}: {
  bookingId: string;
  /**
   * Đơn huỷ / khách không đến (`isBookingClosedWithoutTrip`): không ghi phát sinh hay thu cọc MỚI
   * (server `BOOKING_MONEY_CLOSED`). Hoàn cọc đã thu vẫn mở — như web `SettlementCard`.
   */
  moneyClosed?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.settlement');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const tMileage = useTranslations('Bookings.settlement.excessMileage');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const canView = permissions.has(PERMISSION.BOOKING_VIEW);
  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);
  // Ghi tiền MỚI (phát sinh) — hoàn cọc dùng `canRecord` trần, vẫn mở trên đơn huỷ.
  const canRecordNew = canRecord && !moneyClosed;
  /*
   * Ghi nhận hoàn cần `payments.record`; ĐIỀU CHỈNH một bản ghi đã có cần `payments.void` —
   * sửa một con số tiền đã ghi sổ là quyền khác hẳn với ghi mới. Cùng phân tách với web.
   */
  const canCorrect = permissions.has(PERMISSION.PAYMENT_VOID);
  const query = useSettlement(bookingId, canView);

  if (!canView) return null;

  if (query.isPending) {
    return (
      <SectionCard title={t('cardTitle')}>
        <SkeletonText lines={3} />
      </SectionCard>
    );
  }

  // Web `SettlementCard`: lỗi tải giữ nguyên thẻ, nói lý do (câu của server) và cho thử lại —
  // thẻ biến mất thì người trực tưởng đơn chưa có tiền nào cần quyết toán.
  if (query.isError) {
    return (
      <SectionCard title={t('cardTitle')}>
        <YStack gap={space.sm}>
          <Callout tone="danger" title={t('errorTitle')}>
            <YStack gap={space.xs}>
              <Text col={colors.danger} fos={fontSize.body}>
                {getErrorMessage(query.error)}
              </Text>
              <XStack>
                <Button
                  label={tActions('retry')}
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={() => void query.refetch()}
                />
              </XStack>
            </YStack>
          </Callout>
        </YStack>
      </SectionCard>
    );
  }

  const data = query.data;
  if (!data) return null;

  const status = data.depositStatus as DepositStatus;
  const meta = DEPOSIT_STATUS_META[status];
  const hasSurcharges = data.surcharges.length > 0;

  /* Mở màn Quyết toán — nơi có cả ba form web mở bằng modal. */
  const openSettlement = () => navigateOnce(ROUTES.manage.settlement(bookingId));

  /*
   * Chỉ nói chuyện hoàn tiền khi thật sự CÓ tiền trong tay. `received` (đang thuê, cọc còn giữ)
   * chưa tới lúc đó; `settled` thì phát sinh đã ăn hết — mời "hoàn 0đ" là một việc không có thật.
   */
  const showRefundLine =
    status === DEPOSIT_STATUS.AWAITING_REFUND ||
    status === DEPOSIT_STATUS.REFUNDED ||
    status === DEPOSIT_STATUS.PARTIALLY_REFUNDED;
  /*
   * Gom cọc về MỘT nhà (26/11/2026, web `SettlementCard`): trước lúc quyết toán, cọc theo đơn / đã
   * nhận / nút thu cọc sống ở thẻ "Cọc & thế chấp". Thẻ này chỉ đưa cọc trở lại ở chặng QUYẾT TOÁN.
   */
  const settling = showRefundLine || status === DEPOSIT_STATUS.SETTLED;

  /* So sánh trên CHUỖI tiền, không `Number` — ADR 0007 (web còn dùng `Number` ở chỗ này). */
  const needsMore = !isZeroMoney(data.additionalDue) && !isNegativeMoney(data.additionalDue);


  return (
    /*
      Web `SettlementCard` (Figma 23845:49956): `SectionCard` "Phát sinh", chặng cọc ở góc phải khi
      đã có tiền trong tay; thân là các bảng gọn - mỗi dòng một con số, hành động là LINK gạch chân
      ngay cạnh số đó. Thân và các bảng cách nhau `space-md`.
    */
    <SectionCard
      title={t('cardTitle')}
      // Chặng cọc chỉ nêu ở lúc quyết toán - trước đó thẻ "Cọc & thế chấp" đã nói.
      extra={
        settling ? (
          <StatusBadge
            label={domainLabel('depositStatus', status, meta.label)}
            color={meta.color}
            size="sm"
          />
        ) : undefined
      }
    >
      <YStack gap={space.md} minWidth={0}>
        <SettleRow label={t('surchargeHeading')}>
          {hasSurcharges ? (
            <Money>{fmt.money(data.surchargeTotal)}</Money>
          ) : (
            <Text col={colors.text} fos={fontSize.body}>
              {t('surchargeNone')}
            </Text>
          )}
          {canRecordNew ? <InlineLink label={t('surchargeRecord')} onPress={openSettlement} /> : null}
        </SettleRow>

        {hasSurcharges ? (
          <YStack gap={space.sm}>
            {data.surcharges.map((row) => (
              <XStack
                key={row.id}
                ai="baseline"
                jc="space-between"
                gap={space.md}
                px={space.md}
                py={space.sm}
                br={radius.sm}
                bg={colors.surfaceMuted}
              >
                <YStack f={1} minWidth={0} gap={2}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {domainLabel('surchargeCategory', row.category as SurchargeCategory)}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.body}>
                    {row.reason}
                  </Text>
                </YStack>
                <Money>{fmt.money(row.amount)}</Money>
              </XStack>
            ))}
          </YStack>
        ) : null}

        {/*
          Vượt hạn mức km - chỉ khi chuyến CÓ hạn mức (`includedKmPerDay != null`). Thông tin ĐỌC:
          phí vượt chỉ thành phụ phí khi chủ xe tự ghi.
        */}
        {showsExcessMileageFacts(data.excessMileage) ? (
          <YStack gap={space.md}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {tMileage('title')}
            </Text>
            <ExcessMileageFacts suggestion={data.excessMileage} />
          </YStack>
        ) : null}

        {settling ? (
        <YStack gap={space.md}>
          <SettleRow label={t('depositReceivedShort')}>
            <Money>{fmt.money(data.depositReceived)}</Money>
          </SettleRow>
          {hasSurcharges ? (
            <SettleRow label={t('surchargeTotalShort')}>
              <Money negative>{`−${fmt.money(data.surchargeTotal)}`}</Money>
            </SettleRow>
          ) : null}
          {showRefundLine ? (
            <SettleRow
              label={data.refund ? t('refunded') : t('proposedRefundShort')}
              total
            >
              <Text col={colors.success} fos={fontSize.h4} fow={fontWeight.semibold} numberOfLines={1}>
                {fmt.money(data.refund ? data.refund.refundAmount : data.proposedRefund)}
              </Text>
            </SettleRow>
          ) : null}
        </YStack>
        ) : null}

        {needsMore ? (
          <Notice
            tone="warning"
            title={t('needsMoreTitle', { amount: fmt.money(data.additionalDue) })}
          >
            {t('needsMoreBody')}
          </Notice>
        ) : null}

        {status === DEPOSIT_STATUS.SETTLED ? <Notice title={t('noticeSettled')} /> : null}

        {/* Web `.refundBox`: viền, bo 6, đệm `space-md`, các dòng 12 màu phụ, giá trị đậm canh phải. */}
        {data.refund ? (
          <YStack gap={space.xs} p={space.md} bw={1} bc={colors.border} br={radius.sm}>
            <RefundRow
              label={t('refundMethod')}
              value={domainLabel('refundMethod', data.refund.refundMethod as RefundMethod)}
            />
            <RefundRow label={t('refundedAt')} value={fmt.dateTime(data.refund.refundedAt)} />
            {data.refund.reference ? (
              <RefundRow label={t('refundReference')} value={data.refund.reference} />
            ) : null}
            {data.refund.recordedByName ? (
              <RefundRow label={t('refundRecordedBy')} value={data.refund.recordedByName} />
            ) : null}
          </YStack>
        ) : null}

        {status === DEPOSIT_STATUS.AWAITING_REFUND && canRecord ? (
          <YStack gap={space.xs}>
            <Button label={t('markRefunded')} onPress={openSettlement} />
            {/* Câu miễn trừ đi KÈM nút: XePrime chỉ GHI NHẬN, tiền do chủ xe tự chuyển. */}
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('refund.disclaimer')}
            </Text>
          </YStack>
        ) : null}

        {data.refund && canCorrect ? (
          <XStack>
            <Button
              label={t('correctRefund')}
              variant="secondary"
              size="sm"
              block={false}
              onPress={openSettlement}
            />
          </XStack>
        ) : null}
      </YStack>

    </SectionCard>
  );
}

/** Web `.row`/`.rowTotal`: nhãn trái (màu phụ, không co) · giá trị phải, canh đường chữ. */
function SettleRow({
  label,
  total = false,
  children,
}: {
  label: string;
  total?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack
      ai="baseline"
      jc="space-between"
      gap={space.md}
      minWidth={0}
      {...(total ? { pt: space.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle } : {})}
    >
      <Text
        col={colors.textMuted}
        fos={fontSize.body}
        fow={total ? fontWeight.semibold : fontWeight.regular}
        flexShrink={0}
      >
        {label}
      </Text>
      {/* `.rowValue`: giá trị + link tự xuống dòng, canh phải, khe `space-sm`. */}
      <XStack f={1} flexWrap="wrap" ai="baseline" jc="flex-end" gap={space.sm} minWidth={0}>
        {children}
      </XStack>
    </XStack>
  );
}

/** Web `.money` / `.moneyNegative`: số đậm, không bao giờ ngắt giữa con số. */
function Money({ children, negative = false }: { children: string; negative?: boolean }) {
  const colors = useColors();
  return (
    <Text col={negative ? colors.danger : colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
      {children}
    </Text>
  );
}

/** Web `.inlineLink`: chữ vàng đậm 500, gạch chân. */
function InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Text
      col={colors.primaryStrong}
      fos={fontSize.body}
      fow={fontWeight.medium}
      textDecorationLine="underline"
      accessibilityRole="button"
      onPress={onPress}
      suppressHighlighting
    >
      {label}
    </Text>
  );
}

/** Web `.refundRow`: 12 màu phụ, giá trị đậm màu chữ canh phải. */
function RefundRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <XStack ai="baseline" jc="space-between" gap={space.md} minWidth={0}>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {label}
      </Text>
      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold} ta="right">
        {value}
      </Text>
    </XStack>
  );
}

/** Web AntD `Alert showIcon` (cảnh báo / thông tin): viền + nền nhạt cùng sắc, icon, tiêu đề, mô tả. */
function Notice({
  children,
  title,
  tone = 'info',
}: {
  children?: string;
  title?: string;
  tone?: 'info' | 'warning';
}) {
  const colors = useColors();
  const warning = tone === 'warning';

  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.md}
      bw={1}
      bc={warning ? colors.warningBorder : colors.infoBorder}
      bg={warning ? colors.warningSurface : colors.infoSurface}
    >
      <Ionicons
        name={warning ? 'alert-circle-outline' : 'information-circle-outline'}
        size={iconSize.sm}
        color={warning ? colors.warning : colors.info}
      />
      <YStack f={1} gap={2}>
        {title ? (
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {title}
          </Text>
        ) : null}
        {children ? (
          <Text col={colors.text} fos={fontSize.body}>
            {children}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
