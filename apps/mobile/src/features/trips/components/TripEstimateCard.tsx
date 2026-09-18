import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { CustomerTripEstimate } from '../api';

/**
 * Bảng kê giá của một chuyến CHƯA được duyệt — bản native của `TripEstimateCard` (web).
 *
 * Dùng lại `PriceBreakdown` — chính component vẽ báo giá lúc đặt xe — nên khách thấy đúng những
 * dòng họ đã đọc trước khi bấm gửi, không phải một bảng thứ hai trông gần giống. Mọi con số đến
 * từ server; ở đây không cộng trừ gì.
 *
 * **Hai mức chi tiết, theo vai:**
 *  - *Khách* dừng ở "Tổng bạn trả" — thứ họ cần biết là phải chuẩn bị bao nhiêu tiền.
 *  - *Chủ xe* thấy thêm **số thực nhận**, vì tổng khách trả KHÔNG phải doanh thu của họ: phụ phí
 *    chuyến nằm ở phía khách và thuộc về XePrime, ngân sách hoặc hãng bảo hiểm (ADR 0029 điều 1).
 *
 * Nhãn "tạm tính" không phải chú thích cho đẹp: bảng này tính theo chính sách ĐANG hiệu lực, còn
 * số chốt chỉ sinh ra lúc duyệt (ADR 0024).
 */
export function TripEstimateCard({
  estimate,
  isHost,
  settled = false,
}: {
  estimate: CustomerTripEstimate;
  isHost: boolean;
  /**
   * Khách ĐÃ TRẢ khoản giữ chỗ ⇒ bảng này không còn là "tạm tính".
   *
   * Từ ADR 0039, chuyến đã cọc đọc SNAPSHOT đã đóng băng trên hold thay vì một lượt báo giá mới,
   * nên mọi con số ở đây đúng bằng thứ đã thu. Vẫn dán nhãn "tạm tính" lên nó là nói với người vừa
   * chuyển tiền rằng số họ trả có thể đổi.
   */
  settled?: boolean;
}) {
  const t = useTranslations('Trips.estimate');
  const fmt = useAppFormat();

  return (
    <Card>
      <PriceBreakdown
        title={t('title')}
        badge={settled ? t('badgeSettled') : t('badge')}
        rows={estimate.rows}
        totalAmount={estimate.rentalTotal}
        totalLabel={t('rentalTotal')}
        depositAmount={estimate.depositAmount}
        fees={estimate.fees}
        // Dòng do CHỦ XE chịu (thuế khấu trừ) chỉ vẽ cho chủ xe — ADR 0032 điều 3.
        audience={isHost ? 'owner' : 'customer'}
        // Màn này là XEM LẠI một chuyến đã đặt: con số đã chốt và bảng dài chỉ còn để tra cứu,
        // nên nó gấp lại sau "Xem chi tiết giá". Luồng ĐẶT xe thì không — ở đó khách phải thấy
        // đủ từng dòng trước khi bấm gửi.
        collapsible
        footer={
          <YStack gap={space.xs}>
            {/*
              Chỉ chủ xe: tổng khách trả không phải doanh thu của họ. `ownerNetAmount` do server
              tính theo đúng công thức của ADR 0029 — client KHÔNG tự trừ ra.
            */}
            {isHost && estimate.fees ? (
              <XStack ai="baseline" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('ownerNet')}
                </Text>
                <Text col={colors.primaryActive} fos={fontSize.body} fow={fontWeight.bold}>
                  {fmt.money(estimate.fees.ownerNetAmount)}
                </Text>
              </XStack>
            ) : null}
            <Text col={colors.placeholder} fos={fontSize.label}>
              {settled ? t('noteSettled') : isHost ? t('noteHost') : t('noteRenter')}
            </Text>
          </YStack>
        }
      />
    </Card>
  );
}
