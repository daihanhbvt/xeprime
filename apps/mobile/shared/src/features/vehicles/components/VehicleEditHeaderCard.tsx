import { useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  SERVICE_TYPE,
  STATUS_COLOR,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { publishCompleteness } from '../publication';
import { vehicleGalleryItems } from '../display-media';
import { useImageSlotLabel } from '../hooks/use-vehicle-spec-items';
import { VehicleGallery } from '@/components/vehicle/VehicleGallery';
import { Card } from '@/components/ui/Card';
import { ImageEditBadge } from '@/components/ui/ImageEditBadge';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { useUpdateVehicle, useVehicleSummary } from '../hooks/use-vehicle';
import type { VehicleDetail } from '../api';
import { MarketplaceVisibilityRow } from './MarketplaceVisibilityRow';

/** Vùng chạm của nút máy ảnh "Đổi ảnh" giữa ảnh lớn — ≥ 44dp. */
const EDIT_TARGET = 48;

function Strong({ children }: { children: ReactNode }) {
  const colors = useColors();
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
  showOwnerStats = false,
  showSource = false,
  footer,
}: {
  /** Đánh giá + số chuyến — chỉ khu chủ xe (web `showOwnerStats={!isManage}`). */
  showOwnerStats?: boolean;
  /**
   * Nhãn nguồn xe (Sở hữu/Trả góp…) cạnh tên — chỉ tuyến gói có khái niệm nguồn xe (web
   * `showSource={isManage && can.source}`).
   */
  showSource?: boolean;
  vehicle: VehicleDetail;
  onEditImages?: (() => void) | undefined;
  statusEditable?: boolean;
  /**
   * Phần RIÊNG của nơi gọi, dưới công tắc "Trên chợ" — màn Quản lý xe gắn điểm đánh giá + số
   * chuyến và hai lối Hồ sơ xe · Trang xe, đúng web `VehicleManageHeader` bọc `VehicleEditHeader`.
   */
  footer?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.overview');
  const tEdit = useTranslations('Vehicles.edit.aside');
  const tLabels = useTranslations('Common.labels');
  // Nhãn NGẮN của góc chụp ("Mặt sau", "Nội thất") dưới ô ảnh nhỏ.
  const slotLabel = useImageSlotLabel();
  // Bề ngang THẬT của thẻ (đo lúc layout) — thư viện ảnh dựng theo nó, không theo màn hình.
  const [cardWidth, setCardWidth] = useState(0);
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const update = useUpdateVehicle(vehicle.id);
  const summary = useVehicleSummary(vehicle.id).data;
  const [picking, setPicking] = useState(false);
  const tSummary = useTranslations('Vehicles.editor.summary');

  /*
   * Bản native của web `VehicleEditSummary`: giá đại diện kèm đơn vị (giá ngày của dịch vụ đầu tiên
   * xe có, dài hạn thì giá tháng), loại xe · số ghế / hạng xe máy, đánh giá + số chuyến, mức hoàn
   * thiện hồ sơ đăng chợ, và lối "Xem trang xe" khi xe đã công khai.
   */
  const services = vehicle.serviceTypes ?? [];
  const price =
    services.includes(SERVICE_TYPE.SELF_DRIVE) && vehicle.weekdayPrice
      ? { value: fmt.money(vehicle.weekdayPrice), unit: tSummary('perDay') }
      : services.includes(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice
        ? { value: fmt.money(vehicle.withDriverDailyPrice), unit: tSummary('perDay') }
        : services.includes(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice
          ? { value: fmt.money(vehicle.monthlyPrice), unit: tSummary('perMonth') }
          : null;
  const seatOrCategory =
    vehicle.vehicleType === VEHICLE_TYPE.CAR
      ? vehicle.seatCount
        ? tSummary('seats', { count: vehicle.seatCount })
        : null
      : vehicle.motorbikeCategory
        ? domainLabel('motorbikeCategory', vehicle.motorbikeCategory)
        : null;
  const completeness = publishCompleteness(vehicle);
  const percent =
    completeness.total > 0 ? Math.round((completeness.done / completeness.total) * 100) : 100;
  const stats = summary?.stats;
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;
  const operationLabel = (status: VehicleOperationStatus) =>
    domainLabel(
      'vehicleOperationStatus',
      status,
      // Trạng thái lạ (lệch phiên bản client/server) lui về chính mã — không làm sập màn.
      VEHICLE_OPERATION_STATUS_META[status]?.label ?? status,
    );

  // Ảnh bìa đầu tiên rồi ảnh theo góc chụp, bỏ "Ảnh khác" — CÙNG nguồn với thư viện màn chi tiết xe.
  const photos = vehicleGalleryItems(vehicle, slotLabel);

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

  const operationBadge = (
    <StatusBadge
      label={operationLabel(operationStatus)}
      color={VEHICLE_OPERATION_STATUS_META[operationStatus]?.color ?? STATUS_COLOR.NEUTRAL}
      size="sm"
    />
  );

  return (
    <Card padded={false} accessibilityLabel={t('profileLabel')}>
      {/*
        Thư viện ảnh = bố cục trang xe app KHÁCH (`VehicleGallery`, người dùng chốt 10/11/2026):
        băng chuyền thụt lề + bộ đếm + dải ảnh nhỏ, ở đây kèm nhãn góc chụp. Chạm ảnh xem toàn
        màn; nút máy ảnh giữa ảnh mở mục Hình ảnh.
      */}
      <YStack pt={layout.cardPad} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
        {cardWidth > 0 ? (
          <VehicleGallery
            name={vehicle.name}
            photos={photos}
            width={cardWidth}
            inset={layout.cardPad}
            padded={false}
            showLabels
            {...(onEditImages
              ? {
                  overlay: (
                    <YStack f={1} ai="center" jc="center" pointerEvents="box-none">
                      <Pressable
                        onPress={onEditImages}
                        accessibilityRole="button"
                        accessibilityLabel={tEdit('changeImage')}
                        style={styles.editTarget}
                      >
                        <ImageEditBadge />
                      </Pressable>
                    </YStack>
                  ),
                }
              : {})}
          />
        ) : null}
      </YStack>

      <YStack p={layout.cardPad} gap={space.sm}>
        <XStack ai="center" gap={space.xs}>
          <Text f={1} col={colors.text} fos={fontSize.lead} fow={fontWeight.semibold}>
            {vehicle.name}
          </Text>
          {showSource ? (
            <StatusBadge
              label={domainLabel(
                'vehicleSourceType',
                vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED,
              )}
              color={STATUS_COLOR.ACCENT}
              size="sm"
            />
          ) : null}
        </XStack>

        {/* Mã xe xuống dòng riêng: cạnh tên + viên nguồn thì vỡ layout trên màn hẹp. */}
        {vehicle.code ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {vehicle.code}
          </Text>
        ) : null}

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

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {[domainLabel('vehicleType', vehicle.vehicleType), seatOrCategory].filter(Boolean).join(' · ')}
          {' • '}
          {price ? tSummary('priceWithUnit', { unit: price.unit }) : tSummary('price')}
          {': '}
          <Strong>{price ? price.value : tLabels('notAvailable')}</Strong>
        </Text>

        {showOwnerStats && stats ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {tSummary('rating')}
            {': '}
            <Strong>{stats.ratingAvg ? fmt.rating(Number(stats.ratingAvg)) : tSummary('noRating')}</Strong>
            {' · '}
            {tSummary('trips', { count: stats.completedBookings })}
          </Text>
        ) : null}

        <YStack gap={4} accessibilityLabel={tSummary('completenessValue', completeness)}>
          <XStack jc="space-between">
            <Text col={colors.textMuted} fos={fontSize.label}>
              {tSummary('completeness')}
            </Text>
            <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
              {`${percent}%`}
            </Text>
          </XStack>
          <ProgressBar percent={percent} />
        </YStack>

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
        {/* Trang xe trên chợ là trang WEB của site khách — app Partner mở ra trình duyệt. */}
        {isPublic ? (
          <Button
            label={tSummary('viewListing')}
            icon="open-outline"
            variant="outline"
            size="sm"
            onPress={() => void Linking.openURL(`${resolveWebBaseUrl()}/listings/${vehicle.id}`)}
          />
        ) : null}

        {footer}
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

const styles = StyleSheet.create({
  editTarget: { width: EDIT_TARGET, height: EDIT_TARGET },
});
