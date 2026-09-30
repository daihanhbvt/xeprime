import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DataRow } from '@/components/ui/DataRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, space } from '@/theme/tokens';
import type { ExcessMileageSuggestion } from '@/api/settlement/api';

/**
 * Dữ kiện PHÍ VƯỢT KM của một chuyến — bản native của `ExcessMileageFacts` bên web.
 *
 * Đây là khối ĐỌC, không có nút nào: nó chỉ bày ra đủ số để chủ xe tự kiểm trước khi ghi một
 * khoản trừ vào tiền khách. Mọi con số do server tính (`ExcessMileageSuggestionDto`) — client
 * KHÔNG làm một phép trừ nào, vì hai bên tính riêng là hai con số sẽ lệch đúng lúc có tiền.
 *
 * Hai chỉ số đồng hồ THÔ đi kèm chứ không chỉ hiệu của chúng: chủ xe đối chiếu số trên biên bản
 * bàn giao với số ở đây trước khi trừ tiền.
 */
export function ExcessMileageFacts({ suggestion }: { suggestion: ExcessMileageSuggestion }) {
  const t = useTranslations('Bookings.settlement.excessMileage');
  const fmt = useAppFormat();

  if (!suggestion.available) {
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t(unavailableReason(suggestion))}
      </Text>
    );
  }

  const excess = suggestion.excessKm > 0;

  return (
    <YStack gap={space.xs}>
      <DataRow label={t('pickupOdometer')} value={fmt.km(suggestion.pickupOdometerKm)} />
      <DataRow label={t('returnOdometer')} value={fmt.km(suggestion.returnOdometerKm)} />
      <DataRow label={t('actual')} value={fmt.km(suggestion.actualKm)} />
      {/* Hạn mức nói rõ nó từ đâu ra: số ngày TÍNH PHÍ × km mỗi ngày, cả hai của server. */}
      <DataRow
        label={t('allowed')}
        value={t('allowedValue', {
          total: fmt.km(suggestion.allowedKm),
          days: suggestion.chargedDays,
          perDay: fmt.km(suggestion.includedKmPerDay),
        })}
      />
      <DataRow label={t('feePerKm')} value={fmt.money(suggestion.feePerKm ?? '0')} />
      <DataRow
        label={t('excess')}
        value={fmt.km(suggestion.excessKm)}
        {...(excess ? { tone: 'danger' as const, strong: true } : {})}
      />

      {/*
        Dòng tiền chỉ xuất hiện khi CÓ km vượt. Một dòng "Phụ phí đề xuất: 0đ" đọc như một khoản
        đang chờ ghi, trong khi thứ cần nói là chuyến này không phát sinh gì.
      */}
      {excess ? (
        <DataRow
          label={t('suggestedAmount')}
          value={fmt.money(suggestion.amount ?? '0')}
          tone="price"
          strong
        />
      ) : (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('withinLimit')}
        </Text>
      )}
    </YStack>
  );
}

/**
 * VÌ SAO chưa đề xuất được — bốn lý do khác nhau, bốn việc phải làm khác nhau.
 *
 * Một câu "chưa đủ dữ liệu" chung chung để chủ xe tự đoán phải sửa ở đâu: đặt hạn mức cho xe, ghi
 * chỉ số đồng hồ vào biên bản, hay sửa một chỉ số gõ nhầm. Thứ tự kiểm đi từ nguyên nhân GỐC ra
 * ngoài — thiếu chính sách thì hai chỉ số đồng hồ có đủ cũng không dùng được.
 *
 * Cùng thứ tự với `unavailableReason` bên web (ADR 0031 — hai bản KHÔNG tự đồng bộ, sửa một bên
 * thì sửa cả bên kia).
 */
function unavailableReason(
  s: ExcessMileageSuggestion,
): 'noPolicy' | 'noChargedDays' | 'odometerReversed' | 'missingOdometer' {
  if (s.includedKmPerDay == null) return 'noPolicy';
  if (s.chargedDays <= 0) return 'noChargedDays';
  if (
    s.pickupOdometerKm != null &&
    s.returnOdometerKm != null &&
    s.returnOdometerKm < s.pickupOdometerKm
  ) {
    return 'odometerReversed';
  }
  return 'missingOdometer';
}
