'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { VehicleImageType } from '@xeprime/types';

import { StickyFormActions } from '@/components/form/StickyFormActions';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useManagedVehicle } from '../VehicleManageContext';
import { VehicleImageBoard, type VehicleMediaItem } from '../VehicleImageBoard';
import styles from './ImagesSection.module.css';

/**
 * Mục "Hình ảnh" (mockup 3) — thư viện xếp theo Ô VỊ TRÍ trên cùng bảng `vehicle_images` với
 * `imageType`; API cũ `images: string[]` vẫn nguyên.
 *
 * Phần hiển thị + upload là `VehicleImageBoard`, dùng CHUNG với bước ảnh của hai wizard thêm xe
 * (30/09/2026). Mục này chỉ giữ bản nháp và tự lưu bằng `PATCH /vehicles/:id`.
 *
 * Ảnh BÌA không có ô riêng ở đây (07/10/2026): `vehicles.main_image_url` là giá trị dẫn xuất từ
 * ô ảnh MẶT TRƯỚC, server ghi trong cùng transaction lưu thư viện. Nút Lưu bị chặn khi còn ảnh
 * đang tải, để không lưu thiếu — và server từ chối lượt lưu còn trống một góc bắt buộc
 * (`VEHICLE_IMAGES_INCOMPLETE`), nên câu lỗi đó hiện bằng toast như mọi lỗi khác.
 */
export function ImagesSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage.images');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);

  const initial = useMemo(
    () => (vehicle.media ?? []).map((m) => ({ url: m.url, type: m.type as VehicleImageType })),
    [vehicle.media],
  );
  const [items, setItems] = useState<VehicleMediaItem[]>(initial);
  const [uploading, setUploading] = useState(false);

  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  async function submit() {
    try {
      await update.mutateAsync({ media: items.map((i) => ({ url: i.url, type: i.type })) });
      message.success(t('saved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  return (
    <form
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <VehicleImageBoard
        vehicleType={vehicle.vehicleType}
        vehicleName={vehicle.name}
        items={items}
        onItemsChange={setItems}
        canEdit={canEdit}
        onUploadingChange={setUploading}
      />

      <StickyFormActions
        submitLabel={tActions('saveChanges')}
        cancelLabel={tEdit('revert')}
        onCancel={
          dirty
            ? () => setItems(initial)
            : undefined
        }
        submitting={update.isPending}
        disabled={!canEdit || !dirty || uploading}
      />
    </form>
  );
}
