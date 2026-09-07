import { View } from 'react-native';
import { XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  STATUS_COLOR,
  VEHICLE_ALERT_SEVERITY_COLOR,
  type VehicleAlertSeverity,
} from '@xeprime/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import type { VehicleAlertItem } from '../api';

/**
 * "Việc cần làm" của một xe, dạng chip — bản native của `VehicleAlertChips` bên web.
 *
 * Nội dung do SERVER tính (`VehicleAlertsService`) và đã sắp theo bảng ưu tiên duy nhất ở
 * `@xeprime/types`; component này không tự suy ra cảnh báo nào và không sắp xếp lại.
 *
 * Màu không bao giờ là kênh thông tin duy nhất: mỗi chip có NHÃN CHỮ, và mức nghiêm trọng còn
 * được nói ra trong tên khả truy cập. `title` là câu do backend dựng — đi qua nguyên văn; chỉ
 * nhãn ngắn và mức nghiêm trọng mới dịch, vì đó là từ vựng đóng nằm ở `Domain`.
 */
export function VehicleAlertChips({
  alerts,
  max,
}: {
  alerts: readonly VehicleAlertItem[];
  /**
   * Trần số chip hiển thị; phần dư gộp thành một viên `+N`.
   *
   * Chỉ thẻ trong DANH SÁCH cần trần này: ba cảnh báo ở bề rộng 390px đã chiếm ba dòng, đẩy
   * thẻ cao gấp đôi và khiến màn hình chỉ còn chứa nổi hai chiếc xe. Server đã sắp theo ưu
   * tiên, nên hai viên đầu LUÔN là hai việc gấp nhất — cắt đuôi không giấu mất việc quan trọng.
   *
   * Bỏ trống = hiện hết (Hồ sơ 360 dùng `VehicleAlertList`, không dùng component này).
   */
  max?: number;
}) {
  const t = useTranslations('Vehicles.alerts');
  const domainLabel = useDomainLabel();

  if (alerts.length === 0) return null;

  const visible = max == null ? alerts : alerts.slice(0, max);
  const hidden = alerts.length - visible.length;

  return (
    <XStack flexWrap="wrap" gap={space.xs} accessibilityLabel={t('chipsLabel')}>
      {visible.map((alert) => {
        const severity = alert.severity as VehicleAlertSeverity;
        const count = alert.count && alert.count > 1 ? ` (${alert.count})` : '';
        return (
          /*
            Bọc `View` mang tên khả truy cập: `StatusBadge` cố ý không nhận `accessibilityLabel`
            (nó là nhãn hiển thị dùng chung ở hàng chục chỗ). Nhãn ngắn cho mắt, nhãn đầy đủ kèm
            mức nghiêm trọng cho trình đọc màn hình — y như web.
          */
          <View
            key={alert.kind}
            accessible
            accessibilityLabel={t('severityWithTitle', {
              severity: domainLabel('vehicleAlertSeverity', severity),
              title: alert.title,
            })}
          >
            <StatusBadge
              label={`${domainLabel('vehicleAlertShort', alert.kind, alert.title)}${count}`}
              color={VEHICLE_ALERT_SEVERITY_COLOR[severity]}
              size="sm"
            />
          </View>
        );
      })}

      {hidden > 0 ? (
        /* Tên khả truy cập nói TỔNG số việc — `+2` một mình không cho biết đang bỏ sót gì. */
        <View accessible accessibilityLabel={t('viewAll', { count: alerts.length })}>
          <StatusBadge label={`+${hidden}`} color={STATUS_COLOR.NEUTRAL} size="sm" />
        </View>
      ) : null}
    </XStack>
  );
}
