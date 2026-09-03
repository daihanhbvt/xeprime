import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PRICE_ROW } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/** Một dòng breakdown — cùng shape với `PriceBreakdownRowDto` của API/snapshot. */
export interface PriceBreakdownRowInput {
  key: string;
  label: string;
  sublabel?: string | null;
  /** VND chuỗi; dòng giảm giá mang dấu âm ('-120000'). */
  amount: string;
}

/**
 * # BẢNG CHI TIẾT GIÁ DÙNG CHUNG — bản native của `components/data-display/PriceBreakdown` (web)
 *
 * Cùng Figma `237:1988`, cùng thứ tự khối, cùng nhãn: các dòng breakdown → gạch ngang → TỔNG →
 * tiền cọc → ghi chú cọc. Mọi con số đến từ `PricingService`; ở đây KHÔNG cộng trừ gì.
 *
 * Ba quy tắc nhấn mạnh lấy nguyên từ `PriceBreakdown.module.css`, vì chúng mang NGHĨA chứ không
 * phải trang trí:
 *   - dòng `discount` tô ĐỎ cả nhãn lẫn số — đỏ là màu ngữ nghĩa của khoản giảm trừ;
 *   - số `'0'` tô mờ và bỏ đậm — có dòng nhưng không phát sinh tiền;
 *   - TỔNG dùng `color-price` cỡ h3 đậm, nhãn viết hoa — đây là con số khách thật sự trả.
 *
 * **Tiền cọc KHÔNG nằm trong tổng.** Nó là khối riêng dưới gạch ngang, kèm câu giải thích hoàn
 * cọc. Bản trước của app dán số cọc vào một dòng mang nhãn "Gói thuê" — sai cả nghĩa lẫn nhãn.
 */
export function PriceBreakdown({
  rows,
  totalAmount,
  totalLabel,
  depositAmount,
  title,
  footer,
}: {
  rows: readonly PriceBreakdownRowInput[];
  /** Tổng khách trả TRƯỚC cọc. */
  totalAmount: string;
  totalLabel?: string;
  /** Cọc thế chấp — không nằm trong tổng; bỏ trống thì ẩn cả khối cọc. */
  depositAmount?: string | null;
  title?: string;
  footer?: React.ReactNode;
}) {
  const tCommon = useTranslations('Common.components.price');
  const fmt = useAppFormat();

  return (
    <YStack gap={space.sm}>
      <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
        {title ?? tCommon('title')}
      </Text>

      <YStack gap={space.sm} pt={space.sm} borderTopWidth={1} borderColor={colors.borderSubtle}>
        {rows.map((row, index) => {
          const isDiscount = row.key === PRICE_ROW.DISCOUNT;
          const isZero = row.amount === '0';

          return (
            <XStack key={`${row.key}-${index}`} ai="flex-start" jc="space-between" gap={space.sm}>
              <YStack f={1} gap={2}>
                <Text
                  col={isDiscount ? colors.danger : colors.text}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                >
                  {row.label}
                </Text>
                {row.sublabel ? (
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {row.sublabel}
                  </Text>
                ) : null}
              </YStack>
              <Text
                col={isDiscount ? colors.danger : isZero ? colors.placeholder : colors.text}
                fos={fontSize.bodySm}
                fow={isZero && !isDiscount ? fontWeight.regular : fontWeight.semibold}
              >
                {fmt.money(row.amount)}
              </Text>
            </XStack>
          );
        })}
      </YStack>

      <YStack gap={6} pt={space.sm} borderTopWidth={1} borderColor={colors.borderSubtle}>
        <XStack ai="baseline" jc="space-between" gap={space.sm}>
          {/*
            Viết hoa theo đúng web (`.totalLabel`). Đây là MỘT nhãn cố định, ngắn — không phải
            luật "viết hoa mọi nhãn", thứ làm dấu thanh tiếng Việt chồng nhau ở cỡ nhỏ.
          */}
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold} letterSpacing={0.4}>
            {(totalLabel ?? tCommon('subtotal')).toLocaleUpperCase('vi')}
          </Text>
          <Text col={colors.price} fos={fontSize.h3} fow={fontWeight.bold}>
            {fmt.money(totalAmount)}
          </Text>
        </XStack>

        {depositAmount != null ? (
          <>
            <XStack ai="baseline" jc="space-between" gap={space.sm}>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {tCommon('deposit')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {fmt.money(depositAmount)}
              </Text>
            </XStack>
            {/*
              Web treo `depositHint` trong một tooltip cạnh nhãn. Native không có hover, và một
              biểu tượng "i" phải chạm mới nói được điều kiện hoàn cọc thì phần lớn khách sẽ
              không chạm — nên câu đó nằm thẳng dưới dòng cọc, cùng chỗ với `depositNote`.
            */}
            <Text col={colors.placeholder} fos={fontSize.label} fontStyle="italic">
              {tCommon('depositNote')}
            </Text>
            <Text col={colors.placeholder} fos={fontSize.label}>
              {tCommon('depositHint')}
            </Text>
          </>
        ) : null}
      </YStack>

      {footer}
    </YStack>
  );
}
