import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { VehicleDetail } from '../api';

const THUMB = 64;

const styles = StyleSheet.create({
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/**
 * Màn xác nhận sau khi tạo xe — nói rõ xe đang ở trạng thái nào (nháp hay đã gửi duyệt) rồi chỉ
 * ra việc còn lại để hồ sơ đủ điều kiện lên chợ.
 *
 * Checklist chỉ liệt kê phần LUỒNG TẠO không thu thập: thông tin chi tiết, ảnh, giá & chính
 * sách, nguồn xe. Nó là lối đi tiếp, không phải một danh sách lỗi.
 */
export function VehicleCreateSuccess({
  vehicle,
  submittedForReview,
  onCreateAnother,
  onClose,
}: {
  vehicle: VehicleDetail;
  submittedForReview: boolean;
  onCreateAnother: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles.form.success');
  const router = useRouter();
  const domainLabel = useDomainLabel();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const identity = [vehicle.plateNumber, vehicle.code, domainLabel('vehicleSourceType', vehicle.sourceType)]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <>
      <AppHeader title={t('title')} onBack={onClose} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          <YStack gap={space.sm}>
            <Button
              label={t('viewDetail')}
              onPress={() => router.replace(ROUTES.manage.vehicleDetail(vehicle.id))}
            />
            <Button label={t('createAnother')} variant="secondary" onPress={onCreateAnother} />
          </YStack>
        }
      >
        <YStack gap={layout.section}>
          <YStack ai="center" gap={space.sm}>
            <YStack
              w={iconSize.lg * 2}
              h={iconSize.lg * 2}
              br={radius.pill}
              bg={colors.successSurface}
              ai="center"
              jc="center"
            >
              <Ionicons name="checkmark" size={iconSize.lg} color={colors.success} />
            </YStack>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
              {t('title')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {submittedForReview ? t('submitted') : t('draft')}
            </Text>
          </YStack>

          <Card>
            <XStack ai="center" gap={space.sm}>
              {vehicle.mainImageUrl ? (
                <Image
                  source={{ uri: vehicle.mainImageUrl }}
                  style={styles.thumb}
                  cachePolicy="memory-disk"
                  accessible={false}
                />
              ) : (
                <YStack style={styles.thumb} ai="center" jc="center">
                  <Ionicons name="car-outline" size={iconSize.md} color={colors.textMuted} />
                </YStack>
              )}
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {vehicle.name}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
                  {identity}
                </Text>
              </YStack>
              <StatusBadge
                label={domainLabel(
                  'vehicleOperationStatus',
                  operationStatus,
                  VEHICLE_OPERATION_STATUS_META[operationStatus].label,
                )}
                color={VEHICLE_OPERATION_STATUS_META[operationStatus].color}
                size="sm"
              />
            </XStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {t('checklistTitle')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('checklistBody')}
              </Text>
              {[t('checkInfo'), t('checkMedia'), t('checkPricing'), t('checkSource')].map(
                (line) => (
                  <XStack key={line} ai="flex-start" gap={space.xs}>
                    <Ionicons
                      name="ellipse-outline"
                      size={iconSize.xs}
                      color={colors.textMuted}
                      style={{ marginTop: 4 }}
                    />
                    <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                      {line}
                    </Text>
                  </XStack>
                ),
              )}
            </YStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}
