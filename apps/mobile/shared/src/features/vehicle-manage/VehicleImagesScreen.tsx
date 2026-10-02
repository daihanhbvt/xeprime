import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_GALLERY_MAX_IMAGES,
  VEHICLE_IMAGE_TYPE,
  isSingleVehicleImageSlot,
  vehicleImageSlotsFor,
  type VehicleImageType,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FieldLabel } from '@/components/ui/Field';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi } from '@/api/uploads/api';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { VehicleDetail } from '@/features/vehicles/api';
import { VehicleManageShell, type VehicleSectionWorkspace } from './components/VehicleManageShell';

/** Một tấm ảnh đã gán vị trí. */
export interface SlotItem {
  url: string;
  type: VehicleImageType;
}

/** Màu rãnh công tắc — cùng bảng với `MarketplaceVisibilityRow`. */
const SWITCH_TRACK = { false: colors.borderInput, true: colors.primary };

/**
 * Chuyển một ảnh sang ô khác — đúng `handleDragEnd` của `VehicleImageBoard` bên web khi thả vào
 * một Ô: ô đích là ô ĐƠN đang có ảnh thì hai ảnh đổi chỗ; cùng ô thì không đổi gì.
 */
export function moveImageToSlot(
  current: readonly SlotItem[],
  url: string,
  targetSlot: VehicleImageType,
): SlotItem[] {
  const dragged = current.find((i) => i.url === url);
  if (!dragged || dragged.type === targetSlot) return [...current];
  const displaced = isSingleVehicleImageSlot(targetSlot)
    ? current.find((i) => i.type === targetSlot)
    : undefined;
  return current.map((i) => {
    if (i.url === dragged.url) return { ...i, type: targetSlot };
    if (displaced && i.url === displaced.url) return { ...i, type: dragged.type };
    return i;
  });
}

/** Tỉ lệ ô ảnh — 4:3, đủ để nhận ra góc chụp mà không ăn hết chiều cao màn. */
const TILE_RATIO = 4 / 3;

/**
 * Mục "Hình ảnh" của không gian Quản lý xe — bản native của `ImagesSection`.
 *
 * Khác hẳn ô tải ảnh phẳng của form sửa xe, và đó là cả điểm của màn: ảnh xe được gán theo GÓC
 * CHỤP (trước · sau · trái · phải · nội thất/mặt đồng hồ · khác), lưu vào `media[{url,type}]`.
 * Một danh sách `images: string[]` không nói được tấm nào là mặt trước, nên trang xe không dựng
 * được thứ tự tử tế và chủ xe không biết còn thiếu góc nào.
 *
 * Ô thứ năm KHÁC nhau theo loại xe: ô tô hỏi nội thất, xe máy hỏi mặt đồng hồ — hỏi "ảnh nội
 * thất" của một chiếc Wave là hỏi một tấm ảnh không tồn tại (`vehicleImageSlotsFor`).
 *
 * Bốn góc + ô thứ năm mỗi ô giữ ĐÚNG MỘT ảnh; riêng "Ảnh khác" nhận nhiều.
 *
 * Ảnh đại diện (`mainImageUrl`) là một trường ĐỘC LẬP với thư viện — đúng như web: tải ảnh mặt
 * trước KHÔNG kéo theo ảnh đại diện, và xoá một tấm trong thư viện cũng không đụng tới nó. Muốn
 * đổi hay gỡ ảnh đại diện thì thao tác ngay trên ô của nó.
 */
export function VehicleImagesScreen({
  vehicleId,
  workspace,
}: {
  vehicleId: string;
  /** `manage` = mục của màn sửa xe ở app Partner (Lui về hub sửa xe) — xem `VehicleManageShell`. */
  workspace?: VehicleSectionWorkspace;
}) {
  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      {...(workspace ? { workspace } : {})}
      section={VEHICLE_MANAGE_SECTION.IMAGES}
    >
      {({ vehicle, canEdit }) => (
        <ImagesForm vehicle={vehicle} canEdit={canEdit} vehicleId={vehicleId} />
      )}
    </VehicleManageShell>
  );
}

function ImagesForm({
  vehicle,
  canEdit,
  vehicleId,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  vehicleId: string;
}) {
  const t = useTranslations('VehicleManage.images');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateVehicle(vehicleId);

  const initial = useMemo(
    () => ({
      main: vehicle.mainImageUrl ?? null,
      items: (vehicle.media ?? []).map((m) => ({ url: m.url, type: m.type as VehicleImageType })),
    }),
    [vehicle.mainImageUrl, vehicle.media],
  );
  const [items, setItems] = useState<SlotItem[]>(initial.items);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(initial.main);
  /*
   * Chế độ sắp xếp — bản native của công tắc "kéo thả" bên web. Trên màn cảm ứng kéo qua cả trang
   * cuộn rất dễ trượt, nên cử chỉ là CHẠM ảnh để nhấc lên rồi CHẠM ô đích; kết quả y hệt thả.
   */
  const [reorder, setReorder] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  /*
   * "Đã đổi gì chưa" tính bằng SO SÁNH với giá trị gốc, không phải một cờ bật-một-chiều: tải lên
   * rồi xoá đúng tấm vừa tải là quay về hiện trạng, và nút Lưu phải tắt lại — như web.
   */
  const dirty =
    mainImageUrl !== initial.main || JSON.stringify(items) !== JSON.stringify(initial.items);

  /*
   * Ô HIỆN — đúng `visibleSlots` của web (30/09/2026): KHÔNG có ô "Ảnh khác", mỗi tấm ảnh phải có
   * vị trí. Ảnh CŨ loại "khác" vẫn nằm nguyên trong `items` và được gửi lại y như cũ khi lưu.
   */
  const slots = useMemo(
    () =>
      vehicleImageSlotsFor(vehicle.vehicleType ?? '').filter(
        (slot) => slot !== VEHICLE_IMAGE_TYPE.OTHER,
      ),
    [vehicle.vehicleType],
  );

  /*
   * KHÔNG có dòng "ảnh cũ chưa gán vị trí" — web không có, và bản ở đây sai theo hai cách.
   *
   * Nó đếm `galleryCount`, tức MỌI tấm trong ô "Ảnh khác", kể cả những tấm chủ xe cố ý đặt vào
   * đó; ai có ảnh thư viện cũng bị báo là dữ liệu cũ chưa phân loại. Và câu chữ bảo người dùng
   * "kéo sang ô phù hợp" trong khi màn này không có kéo thả — hướng dẫn một cử chỉ không tồn tại.
   */
  /*
   * Trần ảnh tính trên TOÀN BỘ danh sách (web `items.length + pending.length`), không riêng một ô —
   * ô đơn vẫn thay được ảnh của nó khi đã chạm trần.
   */
  const remaining = Math.max(0, VEHICLE_GALLERY_MAX_IMAGES - items.length);

  /** Đặt một ảnh vào ô — ô đơn thì THAY, ô "khác" thì thêm. */
  function place(slot: VehicleImageType, url: string) {
    setItems((prev) => [
      ...prev.filter((i) => i.url !== url && !(isSingleVehicleImageSlot(slot) && i.type === slot)),
      { url, type: slot },
    ]);
  }

  function removeUrl(url: string) {
    setItems((prev) => prev.filter((i) => i.url !== url));
  }

  /*
   * Còn ảnh ĐANG TẢI thì chưa lưu được.
   *
   * Một tấm chưa tải xong chưa nằm trong `items`, nên bấm Lưu lúc đó ghi lên server một danh sách
   * THIẾU đúng tấm đó. Upload xong sau thì nó chỉ vào state cục bộ — màn hình có ảnh, server thì
   * không, và người dùng không có cách nào biết cho tới lần mở lại. Web gác bằng
   * `pending.length > 0`; ở đây trạng thái tải nằm trong từng ô, nên các ô báo lên một bộ đếm.
   */
  const [uploading, setUploading] = useState(0);
  const trackUpload = useCallback((busy: boolean) => {
    setUploading((n) => Math.max(0, n + (busy ? 1 : -1)));
  }, []);

  function save() {
    update.mutate(
      {
        mainImageUrl,
        media: items.map((i) => ({ url: i.url, type: i.type })),
      } as never,
      {
        onSuccess: () => toast.showSuccess(t('saved')),
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  return (
    <YStack gap={space.md}>
      <XStack ai="center" gap={space.sm}>
        <Switch
          value={reorder}
          onValueChange={(next) => {
            setReorder(next);
            setPicked(null);
          }}
          disabled={!canEdit}
          accessibilityLabel={t('reorderLabel')}
          trackColor={SWITCH_TRACK}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.borderInput}
        />
        <Text f={1} col={colors.text} fos={fontSize.bodySm}>
          {t('reorderToggle')}
        </Text>
      </XStack>

      <MainImageCard
        url={mainImageUrl}
        vehicleName={vehicle.name}
        canEdit={canEdit}
        onChange={setMainImageUrl}
        onBusyChange={trackUpload}
      />

      {slots.map((slot) => (
        <SlotCard
          key={slot}
          slot={slot}
          label={domainLabel('vehicleImageType', slot)}
          vehicleName={vehicle.name}
          helper={t(`helper.${slot}` as never)}
          items={items.filter((i) => i.type === slot)}
          canEdit={canEdit}
          full={!isSingleVehicleImageSlot(slot) && remaining === 0}
          remaining={remaining}
          onUploaded={(url) => place(slot, url)}
          onRemove={removeUrl}
          onBusyChange={trackUpload}
          reorder={reorder && canEdit}
          picked={picked}
          onPick={(url) => setPicked((cur) => (cur === url ? null : url))}
          onDropHere={
            picked && items.find((i) => i.url === picked)?.type !== slot
              ? () => {
                  setItems((prev) => moveImageToSlot(prev, picked, slot));
                  setPicked(null);
                }
              : undefined
          }
        />
      ))}

      {canEdit ? (
        <YStack gap={space.sm}>
          <Button
            label={tActions('saveChanges')}
            disabled={!dirty || uploading > 0}
            loading={update.isPending}
            onPress={save}
          />
          <Button
            label={tEdit('revert')}
            variant="ghost"
            disabled={!dirty || update.isPending}
            onPress={() => {
              setItems(initial.items);
              setMainImageUrl(initial.main);
            }}
          />
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Ảnh đại diện — ô RIÊNG, cùng đường tải lên nhưng không dính gì tới thư viện góc chụp.
 *
 * Đây là nguồn duy nhất của thẻ xe ngoài chợ (`mainImageUrl`), nên nó có đủ ba thao tác như web:
 * chọn · thay · xoá. Trên native cả ba nằm trong tấm chọn nguồn của `useImageUpload` (chụp ảnh ·
 * chọn từ thư viện · xoá ảnh) thay vì hai nút chữ cạnh nhau — một nút phá huỷ đứng trần ngay
 * cạnh ảnh là thứ ngón cái chạm nhầm khi chỉ định cuộn trang.
 */
function MainImageCard({
  url,
  vehicleName,
  canEdit,
  onChange,
  onBusyChange,
}: {
  url: string | null;
  vehicleName: string;
  canEdit: boolean;
  onChange: (url: string | null) => void;
  /** Báo lên màn khi ô này bắt đầu/kết thúc một lượt tải — xem `uploading` ở màn. */
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('VehicleManage.images');
  const tImage = useTranslations('Common.components.imageUpload');

  const upload = useImageUpload({
    title: t('mainImage'),
    hint: t('mainImageHelp'),
    presign: uploadsApi.vehicleImage,
    remaining: 1,
    /* Chọn nhiều tấm một lượt thì tấm cuối thắng — ảnh đại diện chỉ có một. */
    onUploaded: (urls: readonly string[]) => {
      const last = urls[urls.length - 1];
      if (last) onChange(last);
    },
    onRemove: url ? () => onChange(null) : undefined,
  });

  /*
   * Báo trạng thái tải lên NGƯỢC về màn, để nút Lưu khoá trong lúc còn ảnh đang bay.
   *
   * Dọn dẹp trả lại một lần giảm: ô bị tháo giữa chừng (đổi mục, lui màn) mà không trả thì bộ đếm
   * ở màn kẹt trên 0 và nút Lưu khoá vĩnh viễn.
   */
  const busy = upload.busy;
  useEffect(() => {
    if (!busy) return;
    onBusyChange(true);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  return (
    <Card>
      <YStack gap={space.sm}>
        {/* Ảnh đại diện mang dấu ● "cần cho duyệt công khai" — đúng `MainImageTile` của web. */}
        <FieldLabel label={t('mainImage')} publishRequired />
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('mainImageHelp')}
        </Text>
        {url ? (
          <YStack aspectRatio={TILE_RATIO} br={radius.md} ov="hidden">
            <RemoteImage
              uri={url}
              fallback={null}
              contentFit="cover"
              accessibilityLabel={t('alt', { slot: t('mainImage'), vehicle: vehicleName })}
            />
          </YStack>
        ) : (
          <YStack
            aspectRatio={TILE_RATIO}
            br={radius.md}
            bg={colors.surfaceMuted}
            ai="center"
            jc="center"
          >
            <Ionicons name="image-outline" size={iconSize.lg} color={colors.placeholder} />
          </YStack>
        )}
        {canEdit ? (
          <Button
            label={url ? tImage('change') : t('choose')}
            variant="secondary"
            size="sm"
            icon="camera-outline"
            loading={upload.busy}
            onPress={upload.open}
          />
        ) : null}
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('minimumHint', { max: VEHICLE_GALLERY_MAX_IMAGES })}
        </Text>
      </YStack>

      {/* Tấm chọn nguồn ảnh — `useImageUpload` yêu cầu nơi gọi tự render nó. */}
      {upload.sheet}
    </Card>
  );
}

/**
 * Một Ô ảnh.
 *
 * Ô đơn (bốn góc + ô thứ năm) hiện ĐÚNG một tấm và nút chọn đổi tấm đó; ô "Ảnh khác" xếp lưới và
 * nhận thêm tới trần thư viện. Ô trống nói rõ "Chưa đăng tải" thay vì để một khoảng xám — chủ xe
 * phải biết còn thiếu góc nào trước khi bấm gửi duyệt.
 */
function SlotCard({
  slot,
  label,
  vehicleName,
  helper,
  items,
  canEdit,
  full,
  remaining,
  onUploaded,
  onRemove,
  onBusyChange,
  reorder,
  picked,
  onPick,
  onDropHere,
}: {
  /** Đang ở chế độ sắp xếp: chạm ảnh để nhấc, chạm ô để đặt. */
  reorder: boolean;
  /** URL ảnh đang được nhấc lên (nếu có). */
  picked: string | null;
  onPick: (url: string) => void;
  /** Có mặt khi ô này là đích hợp lệ cho ảnh đang nhấc. */
  onDropHere: (() => void) | undefined;
  /** Số ảnh còn thêm được cho cả bảng — ô nhiều ảnh không chọn quá con số này một lượt. */
  remaining: number;
  slot: VehicleImageType;
  label: string;
  vehicleName: string;
  helper: string;
  items: SlotItem[];
  canEdit: boolean;
  full: boolean;
  onUploaded: (url: string) => void;
  onRemove: (url: string) => void;
  /** Báo lên màn khi ô này bắt đầu/kết thúc một lượt tải — xem `uploading` ở màn. */
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('VehicleManage.images');
  const tActions = useTranslations('Common.actions');
  const single = isSingleVehicleImageSlot(slot);

  const upload = useImageUpload({
    title: label,
    hint: helper,
    presign: uploadsApi.vehicleImage,
    remaining: single ? 1 : remaining,
    /* Người dùng chọn được NHIỀU tấm một lượt — ô đơn chỉ giữ tấm cuối, ô "khác" nhận hết. */
    onUploaded: (urls: readonly string[]) => urls.forEach(onUploaded),
  });

  /*
   * Báo trạng thái tải lên NGƯỢC về màn, để nút Lưu khoá trong lúc còn ảnh đang bay.
   *
   * Dọn dẹp trả lại một lần giảm: ô bị tháo giữa chừng (đổi mục, lui màn) mà không trả thì bộ đếm
   * ở màn kẹt trên 0 và nút Lưu khoá vĩnh viễn.
   */
  const busy = upload.busy;
  useEffect(() => {
    if (!busy) return;
    onBusyChange(true);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {label}
          </Text>
          {/* Web: thẻ "Đã tải lên" khi ô có ảnh; chưa có thì chỉ dòng hướng dẫn bên dưới. */}
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
                <Pressable
                  disabled={!reorder}
                  onPress={() => onPick(item.url)}
                  accessibilityRole={reorder ? 'button' : undefined}
                  accessibilityState={reorder ? { selected: picked === item.url } : undefined}
                >
                  <YStack
                    aspectRatio={TILE_RATIO}
                    br={radius.md}
                    ov="hidden"
                    borderWidth={picked === item.url ? 3 : 0}
                    borderColor={colors.primary}
                  >
                    {/*
                    Ảnh KHÔNG câm với trình đọc màn hình — `alt` của web ("Ảnh mặt trước của
                    Honda Vision"). Thiếu nó, `RemoteImage` đặt `accessible: false` và cả lưới ảnh
                    biến mất hoàn toàn khỏi cây khả truy cập.
                  */}
                    <RemoteImage
                      uri={item.url}
                      fallback={null}
                      contentFit="cover"
                      accessibilityLabel={t('alt', { slot: label, vehicle: vehicleName })}
                    />
                  </YStack>
                </Pressable>
                {/*
                  Nhãn nhìn thấy là "Xoá" trống trơn, KHÔNG phải "Xoá ảnh Mặt trước": ở ô thư
                  viện mỗi tấm chỉ rộng 48% bề ngang thẻ, và câu đầy đủ ở cỡ `sm` bị cắt thành
                  "Xoá ảnh Ảnh…". Nút đứng ngay dưới tấm nó xoá nên mắt không cần nhắc lại;
                  trình đọc màn hình thì vẫn nghe đủ câu.
                */}
                {canEdit && !reorder ? (
                  <Button
                    label={tActions('delete')}
                    accessibilityLabel={t('remove', { slot: label })}
                    variant="ghost"
                    size="sm"
                    icon="trash-outline"
                    onPress={() => onRemove(item.url)}
                  />
                ) : null}
              </YStack>
            ))}
          </XStack>
        ) : (
          <YStack
            aspectRatio={TILE_RATIO}
            br={radius.md}
            bg={colors.surfaceMuted}
            ai="center"
            jc="center"
          >
            <Ionicons name="image-outline" size={iconSize.lg} color={colors.placeholder} />
          </YStack>
        )}

        {onDropHere ? (
          <Button
            label={label}
            variant="primary"
            size="sm"
            icon="swap-horizontal-outline"
            onPress={onDropHere}
          />
        ) : null}

        {canEdit && !reorder && !full && (!single || items.length === 0) ? (
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
      </YStack>

      {/* Tấm chọn nguồn ảnh — `useImageUpload` yêu cầu nơi gọi tự render nó. */}
      {upload.sheet}
    </Card>
  );
}
