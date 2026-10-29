import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_GALLERY_MAX_IMAGES,
  isSingleVehicleImageSlot,
  requiredVehicleImageTypes,
  type VehicleImageType,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi, type UploadMeta, type UploadPresign } from '@/api/uploads/api';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, radius, space } from '@/theme/tokens';

/** Một tấm ảnh đã gán vị trí — cùng hình dạng `media[{url,type}]` của payload. */
interface MediaItem {
  url: string;
  type: VehicleImageType;
}

const TILE_RATIO = 4 / 3;

/** Màu rãnh công tắc — cùng bảng với `MarketplaceVisibilityRow`. */

/**
 * Bước ẢNH của hai WIZARD THÊM XE (nhanh + nâng cao) — bản native của `TypedMediaFields` bên web.
 *
 * Các ô theo GÓC CHỤP BẮT BUỘC (`requiredVehicleImageTypes`: ô tô 5, xe máy 2), cùng cách xếp
 * với mục "Hình ảnh" của màn quản lý xe. Khác biệt duy nhất: ở đây ảnh là trường RHF (`media`) và
 * đi cùng một lần `POST /vehicles` — lúc thêm xe chưa có `vehicleId` nào để `PATCH`.
 *
 * Không có ô "ảnh đại diện" (07/10/2026): ảnh bìa là ảnh MẶT TRƯỚC, server suy ra khi lưu.
 *
 * Giữ mảng `images` song song với `media`, đúng như web: payload cũ và thao tác "xoá hết" vẫn
 * chạy như trước.
 */
export function TypedMediaFields<T extends FieldValues>({
  control,
  vehicleType,
  vehicleName = '',
  presign = uploadsApi.vehicleImage,
  onUploadingChange,
}: {
  control: Control<T>;
  vehicleType: string;
  vehicleName?: string;
  /** Wizard đăng nhanh truyền bản MỞ GIAN HÀNG trước tấm ảnh đầu tiên. */
  presign?: (meta: UploadMeta) => Promise<UploadPresign>;
  /** Có ảnh đang tải — nơi gọi có thể chặn "Tiếp tục"/"Lưu". */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage.images');
  const domainLabel = useDomainLabel();
  const { field: mediaField, fieldState: mediaState } = useController({
    control,
    name: 'media' as Path<T>,
  });
  const { field: legacyImages } = useController({ control, name: 'images' as Path<T> });

  const items = useMemo(
    () => (mediaField.value as MediaItem[] | null | undefined) ?? [],
    [mediaField.value],
  );
  /*
   * Upload chạy bất đồng bộ: khi một tấm tải xong, danh sách của lần render đã sinh lời gọi có
   * thể đã cũ. Bản kế tiếp luôn dựng từ ref, không từ closure.
   */
  const itemsRef = useRef<MediaItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const { onChange: setMedia } = mediaField;
  const { onChange: setImages } = legacyImages;
  const update = useCallback(
    (fn: (prev: MediaItem[]) => MediaItem[]) => {
      const next = fn(itemsRef.current);
      itemsRef.current = next;
      setMedia(next);
      setImages(next.map((item) => item.url));
    },
    [setMedia, setImages],
  );

  const [uploading, setUploading] = useState(0);
  const track = useCallback((busy: boolean) => {
    setUploading((n) => Math.max(0, n + (busy ? 1 : -1)));
  }, []);
  useEffect(() => {
    onUploadingChange?.(uploading > 0);
  }, [uploading, onUploadingChange]);

  /*
   * Cùng luật với `VehicleImageBoard` (web dùng CHUNG bảng đó cho form thêm xe): mọi ô hiện ra
   * đều BẮT BUỘC, không có ô "Ảnh khác"; trần thư viện đếm MỌI ảnh + ảnh đang tải.
   */
  const slots = useMemo(() => requiredVehicleImageTypes(vehicleType ?? ''), [vehicleType]);
  const remaining = Math.max(0, VEHICLE_GALLERY_MAX_IMAGES - items.length - uploading);

  return (
    <YStack gap={space.md}>
      <Text col={colors.placeholder} fos={fontSize.label}>
        {t('minimumHint', { max: VEHICLE_GALLERY_MAX_IMAGES })}
      </Text>

      {slots.map((slot) => (
        <SlotTile
          key={slot}
          slot={slot}
          label={domainLabel('vehicleImageType', slot)}
          helper={t(`helper.${slot}` as never)}
          vehicleName={vehicleName}
          items={items.filter((i) => i.type === slot)}
          full={!isSingleVehicleImageSlot(slot) && remaining === 0}
          remaining={remaining}
          presign={presign}
          onUploaded={(url) =>
            update((prev) => [
              ...prev.filter(
                (i) => i.url !== url && !(isSingleVehicleImageSlot(slot) && i.type === slot),
              ),
              { url, type: slot },
            ])
          }
          onRemove={(url) => update((prev) => prev.filter((i) => i.url !== url))}
          onBusyChange={track}
        />
      ))}

      {/* Còn trống một góc ảnh bắt buộc — lỗi của form, hiện ngay dưới bảng ảnh. */}
      {mediaState.error?.message ? (
        <Text col={colors.danger} fos={fontSize.bodySm} accessibilityRole="alert">
          {mediaState.error.message}
        </Text>
      ) : null}
    </YStack>
  );
}

function useBusyReport(busy: boolean, onBusyChange: (busy: boolean) => void) {
  useEffect(() => {
    if (!busy) return;
    onBusyChange(true);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
}

function EmptyTile() {
  const colors = useColors();
  return (
    <YStack
      aspectRatio={TILE_RATIO}
      br={radius.md}
      bg={colors.surfaceMuted}
      ai="center"
      jc="center"
    >
      <Ionicons name="image-outline" size={iconSize.lg} color={colors.placeholder} />
    </YStack>
  );
}

function SlotTile({
  slot,
  label,
  helper,
  vehicleName,
  items,
  full,
  remaining,
  presign,
  onUploaded,
  onRemove,
  onBusyChange,
}: {
  remaining: number;
  slot: VehicleImageType;
  label: string;
  helper: string;
  vehicleName: string;
  items: MediaItem[];
  full: boolean;
  presign: (meta: UploadMeta) => Promise<UploadPresign>;
  onUploaded: (url: string) => void;
  onRemove: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage.images');
  const tActions = useTranslations('Common.actions');
  const single = isSingleVehicleImageSlot(slot);
  const upload = useImageUpload({
    title: label,
    hint: helper,
    presign,
    remaining: single ? 1 : remaining,
    onUploaded: (urls) => urls.forEach(onUploaded),
  });
  useBusyReport(upload.busy, onBusyChange);

  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.sm}>
        {/* Mọi ô hiện ra đều BẮT BUỘC (07/10/2026) — dấu ● "cần cho duyệt công khai", như web. */}
        <YStack f={1}>
          <FieldLabel label={label} publishRequired />
        </YStack>
        {/* Web: thẻ "Đã tải lên" CHỈ khi ô có ảnh; ô trống chỉ có dòng hướng dẫn. */}
        {items.length > 0 ? (
          <Text col={colors.success} fos={fontSize.label}>
            {t('uploaded')}
          </Text>
        ) : null}
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {helper}
      </Text>
      {items.length > 0 ? (
        <XStack flexWrap="wrap" gap={space.xs}>
          {items.map((item) => (
            <YStack key={item.url} w={single ? '100%' : '48%'} gap={space.xs}>
              <YStack aspectRatio={TILE_RATIO} br={radius.md} ov="hidden">
                <RemoteImage
                  uri={item.url}
                  fallback={null}
                  contentFit="cover"
                  accessibilityLabel={t('alt', { slot: label, vehicle: vehicleName })}
                />
              </YStack>
              <Button
                label={tActions('delete')}
                accessibilityLabel={t('remove', { slot: label })}
                variant="ghost"
                size="sm"
                icon="trash-outline"
                onPress={() => onRemove(item.url)}
              />
            </YStack>
          ))}
        </XStack>
      ) : (
        <EmptyTile />
      )}
      {!full && (!single || items.length === 0) ? (
        <Button
          label={t('choose')}
          variant="secondary"
          size="sm"
          icon="camera-outline"
          loading={upload.busy}
          onPress={upload.open}
        />
      ) : null}
      {full ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('maxReached', { max: VEHICLE_GALLERY_MAX_IMAGES })}
        </Text>
      ) : null}
      {upload.sheet}
    </YStack>
  );
}
