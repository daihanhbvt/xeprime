import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@xeprime/domain';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  PAYMENT_KIND,
  PERMISSION,
  type DepositStatus,
  type RefundMethod,
  type SurchargeCategory,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { RecordPaymentSheet } from '@/features/settlement/components/RecordPaymentSheet';
import { useSettlement } from '@/features/settlement/hooks/use-settlement';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

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
export function BookingSettlementCard({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings.settlement');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const [takingDeposit, setTakingDeposit] = useState(false);

  const canView = permissions.has(PERMISSION.BOOKING_VIEW);
  const canRecord = permissions.has(PERMISSION.PAYMENT_RECORD);
  /*
   * Ghi nhận hoàn cần `payments.record`; ĐIỀU CHỈNH một bản ghi đã có cần `payments.void` —
   * sửa một con số tiền đã ghi sổ là quyền khác hẳn với ghi mới. Cùng phân tách với web.
   */
  const canCorrect = permissions.has(PERMISSION.PAYMENT_VOID);
  const query = useSettlement(bookingId, canView);

  if (!canView) return null;

  if (query.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <CardTitle>{t('cardTitle')}</CardTitle>
          <SkeletonText lines={3} />
        </YStack>
      </Card>
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

  const needsMore = Number(data.additionalDue) > 0;

  /*
   * Cọc còn THIẾU so với cấu hình trên đơn — phép trừ trên CHUỖI tiền, không `Number` (ADR 0007).
   * Đây cũng là số điền sẵn vào ô nhập khi mở tấm trượt thu tiền.
   */
  const depositOutstanding = subtractMoney(data.depositRequired, data.depositReceived);

  /*
   * Chỉ mời thu cọc khi còn thiếu VÀ chưa bước sang giai đoạn hoàn: sau khi đã hoàn thì "thu
   * thêm" là một nghiệp vụ khác hẳn, không phải thu nốt cọc. Điều kiện gương y web.
   */
  const canTakeDeposit =
    canRecord &&
    !isNegativeMoney(depositOutstanding) &&
    !isZeroMoney(depositOutstanding) &&
    (status === DEPOSIT_STATUS.NOT_RECEIVED || status === DEPOSIT_STATUS.RECEIVED);

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <CardTitle>{t('cardTitle')}</CardTitle>
          <StatusBadge
            label={domainLabel('depositStatus', status, meta.label)}
            color={meta.color}
            size="sm"
          />
        </XStack>

        {/* Phát sinh */}
        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('surchargeHeading')}
            </Text>
            {canRecord ? (
              <Button
                label={t('surchargeRecord')}
                variant="secondary"
                size="sm"
                block={false}
                onPress={openSettlement}
              />
            ) : null}
          </XStack>

          {hasSurcharges ? (
            data.surcharges.map((row) => (
              <XStack key={row.id} ai="flex-start" jc="space-between" gap={space.sm}>
                <YStack f={1} gap={1}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {domainLabel('surchargeCategory', row.category as SurchargeCategory)}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {row.reason}
                  </Text>
                </YStack>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
                  {fmt.money(row.amount)}
                </Text>
              </XStack>
            ))
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('surchargeEmpty')}
            </Text>
          )}
        </YStack>

        {/* Cọc */}
        <YStack gap={space.xs}>
          <DataRow label={t('depositRequiredShort')} value={fmt.money(data.depositRequired)} />
          {/*
            Dòng này chở một CÂU khi chưa thu, chứ không phải một con số — nên nó xuống dạng
            KHỐI (nhãn trên, nội dung dưới) thay vì cột nhãn 30% / cột giá trị 70%.

            Ở dạng hàng ngang, "Chưa ghi nhận đã thu cọc" cộng thêm nút "Thu cọc" phải chen vào
            70% bề ngang còn lại của màn 360dp: câu vỡ thành ba dòng cụt và nút bị đẩy lệch khỏi
            hàng. Con số thì ngược lại — ngắn, và đặt cạnh nhãn mới so sánh được với hai dòng
            tiền ở trên.
          */}
          <DataRow
            label={t('depositReceivedShort')}
            /* Chưa có bằng chứng thu tiền thì nói THẲNG, không hiện một số 0 mập mờ. */
            value={
              status === DEPOSIT_STATUS.NOT_RECEIVED
                ? t('depositNotReceived')
                : fmt.money(data.depositReceived)
            }
            tone={status === DEPOSIT_STATUS.NOT_RECEIVED ? 'muted' : 'default'}
            block={status === DEPOSIT_STATUS.NOT_RECEIVED}
            {...(canTakeDeposit
              ? {
                  action: (
                    <InlineAction label={t('takeDeposit')} onPress={() => setTakingDeposit(true)} />
                  ),
                }
              : {})}
          />
          {hasSurcharges ? (
            <DataRow
              label={t('surchargeTotalShort')}
              value={`−${fmt.money(data.surchargeTotal)}`}
              tone="discount"
            />
          ) : null}
          {showRefundLine ? (
            <DataRow
              label={data.refund ? t('refunded') : t('proposedRefundShort')}
              value={fmt.money(data.refund ? data.refund.refundAmount : data.proposedRefund)}
              tone="price"
              strong
            />
          ) : null}
        </YStack>

        {needsMore ? (
          <Notice
            tone="warning"
            title={t('needsMoreTitle', { amount: fmt.money(data.additionalDue) })}
          >
            {t('needsMoreBody')}
          </Notice>
        ) : null}

        {status === DEPOSIT_STATUS.NOT_RECEIVED ? <Notice>{t('noticeNotReceived')}</Notice> : null}
        {status === DEPOSIT_STATUS.RECEIVED ? <Notice>{t('noticeReceived')}</Notice> : null}
        {status === DEPOSIT_STATUS.SETTLED ? <Notice>{t('noticeSettled')}</Notice> : null}

        {/* Bản ghi hoàn cọc đã có */}
        {data.refund ? (
          <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <DataRow
              label={t('refundMethod')}
              value={domainLabel('refundMethod', data.refund.refundMethod as RefundMethod)}
            />
            <DataRow label={t('refundedAt')} value={fmt.dateTime(data.refund.refundedAt)} />
            {data.refund.reference ? (
              <DataRow label={t('refundReference')} value={data.refund.reference} />
            ) : null}
            {data.refund.recordedByName ? (
              <DataRow label={t('refundRecordedBy')} value={data.refund.recordedByName} />
            ) : null}
          </YStack>
        ) : null}

        {/*
          Lối ĐIỀU CHỈNH một bản ghi hoàn cọc đã có — web bày nó ngay trên thẻ. Không có nó thì
          một con số hoàn ghi nhầm nằm lại vĩnh viễn trên màn đơn.
        */}
        {data.refund && canCorrect ? (
          <Button
            label={t('correctRefund')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={openSettlement}
          />
        ) : null}

        {status === DEPOSIT_STATUS.AWAITING_REFUND && canRecord ? (
          <YStack gap={space.xs}>
            <Button label={t('markRefunded')} size="sm" onPress={openSettlement} />
            {/*
              Câu miễn trừ đi KÈM nút, không nằm ở một góc khác: XePrime chỉ GHI NHẬN trạng thái,
              tiền do chủ xe tự chuyển bên ngoài ứng dụng. Người bấm phải đọc được điều đó ngay
              tại chỗ bấm.
            */}
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('refund.disclaimer')}
            </Text>
          </YStack>
        ) : null}
      </YStack>

      {/*
        Dùng LẠI đúng tấm trượt thu tiền của đơn, chỉ đổi `kind` — hai loại tiền cùng đi qua một
        đường ghi (`PaymentsService`), nên dựng một form thứ hai cho cọc là mở đường cho hai
        luồng ghi tiền lệch nhau. Web làm y hệt.

        Gắn/tháo theo cờ mở chứ không giữ mãi trong cây: giá trị điền sẵn chỉ đọc lúc dựng.
      */}
      {takingDeposit ? (
        <RecordPaymentSheet
          open
          onClose={() => setTakingDeposit(false)}
          bookingId={bookingId}
          kind={PAYMENT_KIND.DEPOSIT}
          debtAmount={depositOutstanding}
        />
      ) : null}
    </Card>
  );
}

function CardTitle({ children }: { children: string }) {
  return (
    <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={1}>
      {children}
    </Text>
  );
}

function Notice({
  children,
  title,
  tone = 'info',
}: {
  children: string;
  title?: string;
  tone?: 'info' | 'warning';
}) {
  const warning = tone === 'warning';

  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      p={space.sm}
      br={radius.md}
      bg={warning ? colors.warningSurface : colors.infoSurface}
    >
      <Ionicons
        name={warning ? 'alert-circle-outline' : 'information-circle-outline'}
        size={iconSize.sm}
        color={warning ? colors.warning : colors.info}
      />
      <YStack f={1} gap={2}>
        {title ? (
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {title}
          </Text>
        ) : null}
        <Text col={colors.text} fos={fontSize.bodySm}>
          {children}
        </Text>
      </YStack>
    </XStack>
  );
}
