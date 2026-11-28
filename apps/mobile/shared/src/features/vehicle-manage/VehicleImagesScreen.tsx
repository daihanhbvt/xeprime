import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useImageSlotLabel } from '@/features/vehicles/hooks/use-vehicle-spec-items';
import {
  VEHICLE_IMAGE_TILE_GAP,
  VehicleImageTile,
} from '@/features/vehicles/components/VehicleImageTile';
import {
  VEHICLE_GALLERY_MAX_IMAGES,
  VEHICLE_IMAGE_TYPE,
  isSingleVehicleImageSlot,
  requiredVehicleImageTypes,
  type VehicleImageType,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi } from '@/api/uploads/api';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { useColors } from '@/theme/ThemeProvider';
import { space, typeScale } from '@/theme/tokens';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useShellFooter, VehicleManageShell, type VehicleSectionWorkspace } from './components/VehicleManageShell';

/** Một tấm ảnh đã gán vị trí. */
export interface SlotItem {
  url: string;
  type: VehicleImageType;
}


/**
 * Mục "Hình ảnh" của không gian Quản lý xe — bản native của `ImagesSection`.
 *
 * Khác hẳn ô tải ảnh phẳng của form sửa xe, và đó là cả điểm của màn: ảnh xe được gán theo GÓC
 * CHỤP (trước · sau · trái · phải · nội thất/mặt đồng hồ · khác), lưu vào `media[{url,type}]`.
 * Một danh sách `images: string[]` không nói được tấm nào là mặt trước, nên trang xe không dựng
 * được thứ tự tử tế và chủ xe không biết còn thiếu góc nào.
 *
 * Bộ ô KHÁC nhau theo loại xe (`requiredVehicleImageTypes`): ô tô hỏi năm góc (trước · sau ·
 * trái · phải · nội thất), xe máy chỉ hỏi HAI (trước · sau). Hỏi "ảnh nội thất" của một chiếc
 * Wave là hỏi một tấm ảnh không tồn tại, và đòi nó đủ bốn mặt ngoài là đòi bốn tấm gần giống
 * nhau. MỌI ô ở đây đều BẮT BUỘC, và mỗi ô giữ đúng MỘT ảnh.
 *
 * Ảnh BÌA không có ô riêng (07/10/2026): nó là ảnh MẶT TRƯỚC, server suy ra từ `media` trong
 * cùng transaction. Trước đây đây là một ô độc lập, nên tải ảnh mặt trước KHÔNG kéo theo ảnh bìa
 * và thẻ xe ngoài chợ hiện được một tấm khác với ô "mặt trước" của chính chiếc xe đó.
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
  const slotLabel = useImageSlotLabel();
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateVehicle(vehicleId);

  const initial = useMemo(
    () => (vehicle.media ?? []).map((m) => ({ url: m.url, type: m.type as VehicleImageType })),
    [vehicle.media],
  );
  const [items, setItems] = useState<SlotItem[]>(initial);
  /*
   * Chế độ đổi chỗ (chạm nhấc - chạm thả) TẮT trên app: Figma `24231:106078` chỉ vẽ lưới ảnh, người
   * dùng chốt 27/11/2026 "y chang Figma" - bỏ thẻ công tắc. Thay ảnh từng ô vẫn đủ.
   */
  const reorder = false;
  const [picked, setPicked] = useState<string | null>(null);

  /** Đưa ảnh đang nhấc vào ô `slot` — ô đơn đang có ảnh thì hai ảnh đổi chỗ (web `handleDragEnd`). */
  function moveTo(slot: VehicleImageType) {
    const url = picked;
    setPicked(null);
    if (!url) return;
    setItems((current) => {
      const dragged = current.find((i) => i.url === url);
      if (!dragged || dragged.type === slot) return current;
      const displaced = isSingleVehicleImageSlot(slot)
        ? current.find((i) => i.type === slot)
        : null;
      return current.map((i) => {
        if (i.url === dragged.url) return { ...i, type: slot };
        if (displaced && i.url === displaced.url) return { ...i, type: dragged.type };
        return i;
      });
    });
  }

  /*
   * "Đã đổi gì chưa" tính bằng SO SÁNH với giá trị gốc, không phải một cờ bật-một-chiều: tải lên
   * rồi xoá đúng tấm vừa tải là quay về hiện trạng, và nút Lưu phải tắt lại — như web.
   */
  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  /*
   * Ô HIỆN = đúng các góc BẮT BUỘC của loại xe, như web: KHÔNG có ô "Ảnh khác", mỗi tấm ảnh phải
   * có vị trí (30/09/2026). Ảnh CŨ loại "khác" — và ảnh xe máy loại `dashboard` của luật trước
   * 07/10/2026 — vẫn nằm nguyên trong `items` và được gửi lại y như cũ khi lưu.
   */
  const slots = useMemo(
    () => requiredVehicleImageTypes(vehicle.vehicleType ?? ''),
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
    update.mutate({ media: items.map((i) => ({ url: i.url, type: i.type })) } as never, {
      onSuccess: () => toast.showSuccess(t('saved')),
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  /* Hai nút Hoàn tác · Lưu thay đổi DÍNH ĐÁY màn (Figma `24231:106078`). */
  useShellFooter(
    () =>
      canEdit ? (
        <XStack gap={space.sm}>
          <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
            <Button
              label={tEdit('revert')}
              variant="outline"
              disabled={!dirty || update.isPending}
              onPress={() => setItems(initial)}
            />
          </YStack>
          <YStack f={2}>
            <Button
              lineIcon="tick"
              variant="gradient"
              label={tActions('saveChanges')}
              disabled={!dirty || uploading > 0}
              loading={update.isPending}
              onPress={save}
            />
          </YStack>
        </XStack>
      ) : null,
    [canEdit, dirty, uploading, update.isPending, items],
  );

  return (
    <YStack gap={space.md}>
      {/* Figma `24231:106078`: lưới HAI cột, mỗi ô là một thẻ ảnh nhỏ cách nhau 12. */}
      <XStack flexWrap="wrap" gap={VEHICLE_IMAGE_TILE_GAP}>
      {slots.map((slot) => (
        <SlotCard
          reorder={reorder && canEdit}
          picked={picked}
          onPick={(url) => setPicked((current) => (current === url ? null : url))}
          onDropHere={() => moveTo(slot)}
          key={slot}
          slot={slot}
          label={domainLabel('vehicleImageType', slot)}
          shortLabel={slotLabel(slot)}
          vehicleName={vehicle.name}
          helper={t(`helper.${slot}` as never)}
          items={items.filter((i) => i.type === slot)}
          canEdit={canEdit}
          full={!isSingleVehicleImageSlot(slot) && remaining === 0}
          remaining={remaining}
          onUploaded={(url) => place(slot, url)}
          onRemove={removeUrl}
          onBusyChange={trackUpload}
          cover={slot === VEHICLE_IMAGE_TYPE.FRONT}
        />
      ))}
      </XStack>


    </YStack>
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
  shortLabel,
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
  cover = false,
}: {
  /** Ô mặt trước = ảnh bìa: hiện nhãn "Ảnh bìa" (Figma). */
  cover?: boolean;
  /** Đang ở chế độ đổi chỗ — chạm ảnh để nhấc, chạm ô để thả. */
  reorder: boolean;
  /** URL ảnh đang nhấc (ở bất kỳ ô nào), `null` = chưa nhấc. */
  picked: string | null;
  onPick: (url: string) => void;
  onDropHere: () => void;
  /** Số ảnh còn thêm được cho cả bảng — ô nhiều ảnh không chọn quá con số này một lượt. */
  remaining: number;
  slot: VehicleImageType;
  label: string;
  /** Nhãn NGẮN của góc chụp ("Mặt trước") - chữ Figma dưới ảnh; `label` đầy đủ cho trình đọc. */
  shortLabel: string;
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
  const colors = useColors();
  const t = useTranslations('VehicleManage.images');
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

  const pickedHere = picked != null && items.some((item) => item.url === picked);
  const dropTarget = reorder && picked != null && !pickedHere;

  /* Ô đơn: đúng MỘT thẻ (có ảnh hoặc trống); ô nhiều ảnh: mỗi tấm một thẻ. */
  const tiles: (SlotItem | null)[] = items.length > 0 ? items : [null];
  const canAdd = canEdit && !full && (!single || items.length === 0);
  // Bút "đổi ảnh" trên ô đã có ảnh (Figma Edit 2): ô đơn tải tấm mới thay tấm cũ (`place` giữ tấm cuối).
  const canReplace = canEdit && (single || !full);

  return (
    <>
      {tiles.map((item) => (
        <VehicleImageTile
          key={item?.url ?? 'empty'}
          uri={item?.url ?? null}
          label={shortLabel}
          imageLabel={t('alt', { slot: label, vehicle: vehicleName })}
          emptyHint={t('formats')}
          badge={cover ? t('coverBadge') : null}
          // Ô trống: chạm cả ô ảnh để tải (Figma ô trống không có icon bút).
          onPressImage={() => (item ? onPick(item.url) : upload.open())}
          imagePressDisabled={item ? !reorder : !canAdd || upload.busy}
          pressLabel={item ? label : t('choose')}
          onRemove={canEdit && item ? () => onRemove(item.url) : null}
          removeLabel={t('remove', { slot: label })}
          // Bút "đổi ảnh" trên ô đã có ảnh (Figma Edit 2): ô đơn tải tấm mới thay tấm cũ (`place` giữ tấm cuối).
          onReplace={canReplace && item ? upload.open : null}
          replaceLabel={t('choose')}
          replaceDisabled={upload.busy}
          selected={item != null && item.url === picked}
          dropTarget={dropTarget ? { onPress: onDropHere, label } : null}
          footer={
            full ? (
              <Text col={colors.textMuted} fos={typeScale.label.fontSize}>
                {t('maxReached', { max: VEHICLE_GALLERY_MAX_IMAGES })}
              </Text>
            ) : null
          }
        />
      ))}

      {/* Tấm chọn nguồn ảnh — `useImageUpload` yêu cầu nơi gọi tự render nó. */}
      {upload.sheet}
    </>
  );
}
