import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_ALERT_PRIMARY_LIMIT,
  VEHICLE_ALERT_SEVERITY,
  type VehicleAlertSeverity,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
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
 * `href` của web KHÔNG dùng ở đây: nó là đường dẫn của web (`/manage/...`), và app có bản đồ
 * route riêng — bấm vào một chuỗi web sinh ra sẽ dẫn tới màn không tồn tại.
 */
export function VehicleAlertList({ alerts }: { alerts: readonly VehicleAlertItem[] }) {
  const t = useTranslations('Vehicles.alerts');
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('empty')}
      </Text>
    );
  }

  const visible = expanded ? alerts : alerts.slice(0, VEHICLE_ALERT_PRIMARY_LIMIT);
  const hidden = alerts.length - visible.length;

  return (
    <YStack gap={space.sm}>
      {visible.map((alert) => {
        const severity = alert.severity as VehicleAlertSeverity;
        return (
          <XStack key={alert.kind} gap={space.xs}>
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
            </YStack>
          </XStack>
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
