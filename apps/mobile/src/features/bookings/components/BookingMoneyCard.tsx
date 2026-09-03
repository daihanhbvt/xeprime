import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { InlineAction } from '@/components/ui/InlineAction';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/**
 * Khối tiền của một đơn — **đọc, không tính**.
 *
 * Mọi con số đến từ `BookingDetailDto`, tức từ `apps/api/src/common/booking-money.ts`:
 *
 * ```
 * phảiThu = total_amount + tổng phụ phí còn hiệu lực
 * cọcGánh = min(tổng phụ phí, cọc ĐÃ THU)
 * đãThu   = paid_amount + phiếu thu TAY đã duyệt gắn đơn + cọcGánh
 * cònNợ   = max(0, phảiThu − đãThu)
 * ```
 *
 * `cọcGánh` là mấu chốt chống đếm hai lần: quyết toán cọc đã trừ phụ phí vào tiền hoàn rồi, nên
 * cộng thẳng phụ phí vào công nợ nữa là bắt khách trả hai lần. Tái hiện công thức này ở client
 * — dù chỉ một dòng — là mở đường cho hai con số lệch nhau.
 */
export function BookingMoneyCard({
  booking,
  onEditFee,
}: {
  booking: BookingDetail;
  /**
   * Mở form sửa phí giao nhận. Vắng = người xem không có quyền sửa, hoặc đơn đã khép — nút biến
   * mất hẳn thay vì mờ đi, vì đây là một nút CHỮ nhỏ nằm trong dòng chứ không phải một ô trong
   * hàng nút, và một chữ xám lẫn vào con số bên cạnh thì không đọc ra là nút.
   */
  onEditFee?: () => void;
}) {
  const t = useTranslations('Bookings.money');
  const tActions = useTranslations('Common.actions');
  const tDetail = useTranslations('Bookings.detail');
  const fmt = useAppFormat();

  const hasDebt = !isZeroMoney(booking.debtAmount);
  /* Cùng phép so của web: đã thu trừ phải thu, chỉ nói khi dương. */
  const overCollected = Number(booking.collectedAmount) - Number(booking.amountDue);

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {tDetail('moneyBlock')}
        </Text>

        <DataRow label={t('baseAmount')} value={fmt.money(booking.baseAmount)} />
        {isZeroMoney(booking.discountAmount) ? null : (
          <DataRow
            label={t('discount')}
            value={`−${fmt.money(booking.discountAmount)}`}
            tone="discount"
          />
        )}
        <DataRow
          label={t('deliveryFee')}
          value={isZeroMoney(booking.deliveryFee) ? t('free') : fmt.money(booking.deliveryFee)}
          tone={isZeroMoney(booking.deliveryFee) ? 'muted' : 'default'}
          {...(onEditFee
            ? { action: <InlineAction label={tActions('edit')} onPress={onEditFee} /> }
            : {})}
        />
        <DataRow label={t('totalAmount')} value={fmt.money(booking.totalAmount)} strong />

        {isZeroMoney(booking.surchargeTotal) ? null : (
          <DataRow label={t('surchargeTotal')} value={fmt.money(booking.surchargeTotal)} />
        )}

        <Divider />

        {/*
          "Phải thu" là con số người ở quầy đọc to cho khách — tô `price` (gold) như web, không
          để chung tông với chín dòng còn lại. Đây là dòng duy nhất trong khối được nhấn màu.
        */}
        <YStack p={space.sm} br={radius.md} bg={colors.primaryLight}>
          <DataRow
            label={t('amountDue')}
            value={fmt.money(booking.amountDue)}
            tone="price"
            strong
          />
        </YStack>
        {/*
          Web KHÔNG có dòng `paidAmount` riêng — `collectedAmount` đã gộp cả tiền thuê đã thu,
          phiếu tay và phần cọc gánh phụ phí. Bày thêm một dòng "đã thu tiền thuê" bên cạnh "tổng
          đã thu" là mời người đọc tự trừ hai số để tìm phần chênh.
        */}
        <DataRow label={t('collectedAmount')} value={fmt.money(booking.collectedAmount)} />
        {isZeroMoney(booking.otherCollected) ? null : (
          <DataRow
            label={t('otherCollected')}
            value={fmt.money(booking.otherCollected)}
            tone="muted"
          />
        )}

        <Divider />

        <XStack
          ai="center"
          jc="space-between"
          gap={space.sm}
          p={space.sm}
          br={radius.md}
          bg={hasDebt ? colors.dangerSurface : colors.successSurface}
        >
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('debtAmount')}
          </Text>
          <Text
            col={hasDebt ? colors.danger : colors.success}
            fos={fontSize.h4}
            fow={fontWeight.bold}
          >
            {fmt.money(booking.debtAmount)}
          </Text>
        </XStack>

        {/*
          Thu VƯỢT phải thu: gần như luôn là một khoản phát sinh đã thu tiền nhưng chưa ghi nhận
          trên đơn. Nói thẳng thay vì để hai con số lệch nhau không lời — đúng như web.
        */}
        {overCollected > 0 ? (
          <DataRow label={t('overCollected')} value={fmt.money(String(overCollected))} />
        ) : null}

        {/* Cọc là tài sản GIỮ HỘ, không phải tiền thuê đã thu — nên nó đứng riêng dưới vạch. */}
        {isZeroMoney(booking.depositAmount) ? null : (
          <DataRow label={t('depositAmount')} value={fmt.money(booking.depositAmount)} />
        )}

        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('note')}
        </Text>
      </YStack>
    </Card>
  );
}
