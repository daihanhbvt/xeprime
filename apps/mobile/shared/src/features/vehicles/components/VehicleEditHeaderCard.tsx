import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  STATUS_COLOR,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { vehicleDisplayMedia } from '../display-media';
import { Card } from '@/components/ui/Card';
import { ImageEditBadge } from '@/components/ui/ImageEditBadge';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useUpdateVehicle, useVehicleSummary } from '../hooks/use-vehicle';
import type { VehicleDetail } from '../api';
import { MarketplaceVisibilityRow } from './MarketplaceVisibilityRow';

const MEDIA_HEIGHT = 168;
const THUMB = 64;

const styles = StyleSheet.create({
  media: { width: '100%', height: MEDIA_HEIGHT, backgroundColor: colors.surfaceMuted },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.sm },
});

function Strong({ children }: { children: ReactNode }) {
  return (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

/**
 * Thẻ đầu màn sửa thông tin xe — bản native của `VehicleEditHeader` bên web.
 *
 * Ảnh chính (chạm → mục Hình ảnh khi có `onEditImages`) · dải ảnh phụ · tên + mã · biển số ·
 * loại xe / dịch vụ · số KM · hai trục trạng thái · công tắc "Trên chợ".
 *
 * Trạng thái vận hành sửa TẠI CHỖ (lưu ngay, `PATCH {operationStatus}`) khi `statusEditable` —
 * đúng web 30/09/2026: ô đó đã rời form thông tin, nên đây là đường ghi DUY NHẤT của nó. Web dùng
 * menu xổ; app dùng tấm trượt chọn một.
 */
export function VehicleEditHeaderCard({
  vehicle,
  onEditImages,
  statusEditable = false,
}: {
  vehicle: VehicleDetail;
  onEditImages?: (() => void) | undefined;
  statusEditable?: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const tEdit = useTranslations('Vehicles.edit.aside');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const update = useUpdateVehicle(vehicle.id);
  const summary = useVehicleSummary(vehicle.id).data;
  const [picking, setPicking] = useState(false);

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;
  const operationLabel = (status: VehicleOperationStatus) =>
    domainLabel(
      'vehicleOperationStatus',
      status,
      // Trạng thái lạ (lệch phiên bản client/server) lui về chính mã — không làm sập màn.
      VEHICLE_OPERATION_STATUS_META[status]?.label ?? status,
    );

  // Bỏ ảnh đại diện (đã có ô lớn) và ảnh loại "Ảnh khác" — xem `vehicleDisplayMedia`.
  const thumbs = vehicleDisplayMedia(vehicle);

  async function changeStatus(next: VehicleOperationStatus) {
    setPicking(false);
    if (next === vehicle.operationStatus) return;
    try {
      await update.mutateAsync({ operationStatus: next });
      toast.showSuccess(tEdit('statusSaved'));
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  }

  const media = vehicle.mainImageUrl ? (
    <Image
      source={{ uri: vehicle.mainImageUrl }}
      style={styles.media}
      contentFit="cover"
      cachePolicy="memory-disk"
      accessible={false}
    />
  ) : (
    <YStack style={styles.media} ai="center" jc="center">
      <Ionicons name="car-outline" size={iconSize.lg} color={colors.textMuted} />
    </YStack>
  );

  const operationBadge = (
    <StatusBadge
      label={operationLabel(operationStatus)}
      color={VEHICLE_OPERATION_STATUS_META[operationStatus]?.color ?? STATUS_COLOR.NEUTRAL}
      size="sm"
    />
  );

  return (
    <Card padded={false} accessibilityLabel={t('profileLabel')}>
      {onEditImages ? (
        <Pressable
          onPress={onEditImages}
          accessibilityRole="button"
          accessibilityLabel={tEdit('changeImage')}
        >
          {media}
          <ImageEditBadge />
        </Pressable>
      ) : (
        media
      )}

      <YStack p={space.md} gap={space.sm}>
        {thumbs.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap={space.xs}>
              {thumbs.map((item) => (
                <YStack key={item.url} gap={2} w={THUMB}>
                  <Image
                    source={{ uri: item.url }}
                    style={styles.thumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    accessibilityLabel={domainLabel('vehicleImageType', item.type)}
                  />
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                    {domainLabel('vehicleImageType', item.type)}
                  </Text>
                </YStack>
              ))}
            </XStack>
          </ScrollView>
        ) : null}

        <XStack ai="center" gap={space.xs}>
          <Text f={1} col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {vehicle.name}
          </Text>
          {vehicle.code ? (
            <Text
              col={colors.textMuted}
              fos={fontSize.bodySm}
              numberOfLines={1}
              flexShrink={0}
              maxWidth="40%"
            >
              {vehicle.code}
            </Text>
          ) : null}
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('plate', {
            value: vehicle.plateNumber || tLabels('notAvailable'),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {` • ${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`}
        </Text>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('odometer', {
            value: fmt.km(summary?.currentOdometerKm ?? null),
            b: (chunks) => <Strong>{chunks}</Strong>,
          })}
          {summary?.currentOdometerSource
            ? ` · ${domainLabel('odometerSource', summary.currentOdometerSource)}`
            : ''}
        </Text>

        <XStack flexWrap="wrap" gap={space.md} rowGap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('axisOperation')}
            </Text>
            {statusEditable ? (
              <Pressable
                onPress={() => setPicking(true)}
                disabled={update.isPending}
                accessibilityRole="button"
                accessibilityLabel={tEdit('changeStatus', {
                  status: operationLabel(operationStatus),
                })}
                // Huy hiệu `sm` chỉ cao ~22dp — slop 12 đưa vùng chạm lên ≥ 44dp.
                hitSlop={12}
              >
                <XStack ai="center" gap={4}>
                  {operationBadge}
                  <Ionicons
                    name={update.isPending ? 'hourglass-outline' : 'chevron-down'}
                    size={iconSize.sm}
                    color={colors.textMuted}
                  />
                </XStack>
              </Pressable>
            ) : (
              operationBadge
            )}
          </XStack>
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('axisPublic')}
            </Text>
            <StatusBadge
              label={domainLabel(
                'vehiclePublicStatus',
                publicStatus,
                VEHICLE_PUBLIC_STATUS_META[publicStatus]?.label ?? publicStatus,
              )}
              color={VEHICLE_PUBLIC_STATUS_META[publicStatus]?.color ?? STATUS_COLOR.NEUTRAL}
              size="sm"
            />
          </XStack>
        </XStack>

        <YStack pt={space.xs} borderTopWidth={1} borderColor={colors.borderSubtle}>
          <MarketplaceVisibilityRow vehicle={vehicle} />
        </YStack>
      </YStack>

      <BottomSheet open={picking} onClose={() => setPicking(false)} title={t('axisOperation')}>
        <MenuOptionList>
          {VEHICLE_OPERATION_STATUS_VALUES.map((status) => (
            <MenuOption
              key={status}
              label={operationLabel(status)}
              selected={status === operationStatus}
              onPress={() => void changeStatus(status)}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </Card>
  );
}
