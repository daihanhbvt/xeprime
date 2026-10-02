import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_ALERT_PRIMARY_LIMIT,
  VEHICLE_ALERT_SEVERITY,
  type VehicleAlertSeverity,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import type { VehicleAlertItem } from '../api';

const DOT_SIZE = 8;

function dotColor(severity: VehicleAlertSeverity): string {
  if (severity === VEHICLE_ALERT_SEVERITY.CRITICAL) return colors.danger;
  if (severity === VEHICLE_ALERT_SEVERITY.WARNING) return colors.warning;
  return colors.info;
}

/**
 * Danh sách việc cần làm ở Hồ sơ 360: tối đa 3 việc quan trọng nhất, phần còn lại nằm sau
 * "Xem tất cả". Ba việc đó luôn là ba việc ưu tiên cao nhất vì SERVER đã sắp sẵn — component
 * này không sắp xếp lại và không tự suy ra cảnh báo nào.
 *
 * `href` của server KHÔNG dùng ở đây: nó là đường dẫn web (`/manage/...`). Đích của app là
 * `target`, do `vehicleAlertView` dựng theo khu + năng lực — có thì dòng bấm được, `null` thì
 * vẫn hiện câu cảnh báo nhưng không có lối đi (đúng web).
 */
export function VehicleAlertList({
  alerts,
  showEmpty = true,
  leadAction,
}: {
  alerts: readonly (VehicleAlertItem & { target?: Href | null })[];
  /**
   * `false` = im lặng khi danh sách rỗng, vì nơi gọi đã dựng một việc khác trong CÙNG thẻ.
   *
   * Hồ sơ 360 thêm việc "đưa xe lên chợ" dựng từ bản ghi xe (ADR 0048), và nó không đi qua danh
   * sách này. Không có công tắc thì một chiếc xe còn là nháp sẽ hiện "Không có việc cần làm"
   * ngay dưới việc "Hoàn tất hồ sơ để đưa xe lên chợ" — đúng câu tự mâu thuẫn mà đợt này sửa.
   * Mặc định `true` để thẻ xe ngoài danh sách không đổi hành vi.
   */
  showEmpty?: boolean;
  /**
   * Nút hành động của việc ĐẦU BẢNG, dựng ngay TRONG mục đó — không ở cuối danh sách. Nút đứng
   * cuối thẻ thì đọc như thuộc về mục nằm sát trên nó, mà mục đó có khi là một lời nhắc khác.
   */
  leadAction?: ReactNode;
}) {
  const t = useTranslations('Vehicles.alerts');
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(false);
  const navigateOnce = useNavigateOnce();

  if (alerts.length === 0) {
    return showEmpty ? (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('empty')}
      </Text>
    ) : null;
  }

  const visible = expanded ? alerts : alerts.slice(0, VEHICLE_ALERT_PRIMARY_LIMIT);
  const hidden = alerts.length - visible.length;

  return (
    <YStack gap={space.sm}>
      {visible.map((alert, index) => {
        const severity = alert.severity as VehicleAlertSeverity;
        return (
          <Pressable
            key={alert.kind}
            disabled={!alert.target}
            onPress={() => alert.target && navigateOnce(alert.target)}
            accessibilityRole={alert.target ? 'button' : 'text'}
            hitSlop={4}
          >
            <XStack gap={space.xs}>
              <YStack
                w={DOT_SIZE}
                h={DOT_SIZE}
                br={radius.pill}
                bg={dotColor(severity)}
                mt={space.xs}
              />
              <YStack f={1} gap={1}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {alert.title}
                  {alert.count && alert.count > 1 ? ` (${alert.count})` : ''}
                </Text>
                {/* Mức nghiêm trọng nói bằng CHỮ, không chỉ bằng màu chấm. */}
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {domainLabel('vehicleAlertSeverity', severity)}
                </Text>
                {alert.detail ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {alert.detail}
                  </Text>
                ) : null}
                {index === 0 && leadAction ? <XStack pt={space.xs}>{leadAction}</XStack> : null}
              </YStack>
              {alert.target ? (
                <YStack alignSelf="center">
                  <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
                </YStack>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}

      {hidden > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          accessibilityLabel={t('viewAll', { count: alerts.length })}
        >
          <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('viewAll', { count: alerts.length })}
          </Text>
        </Pressable>
      ) : null}
    </YStack>
  );
}
