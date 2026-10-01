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
 * (30/09/2026). Mục này chỉ giữ bản nháp và tự lưu bằng `PATCH /vehicles/:id`. Ảnh đại diện vẫn
 * là `mainImageUrl` — nguồn duy nhất của thẻ xe/chợ. Nút Lưu bị chặn khi còn ảnh đang tải, để
 * không lưu thiếu.
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
    () => ({
      main: vehicle.mainImageUrl ?? null,
      items: (vehicle.media ?? []).map((m) => ({ url: m.url, type: m.type as VehicleImageType })),
    }),
    [vehicle.mainImageUrl, vehicle.media],
  );
  const [main, setMain] = useState<string | null>(initial.main);
  const [items, setItems] = useState<VehicleMediaItem[]>(initial.items);
  const [uploading, setUploading] = useState(false);

  const dirty = main !== initial.main || JSON.stringify(items) !== JSON.stringify(initial.items);

  async function submit() {
    try {
      await update.mutateAsync({
        mainImageUrl: main,
        media: items.map((i) => ({ url: i.url, type: i.type })),
      });
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
        main={main}
        onMainChange={setMain}
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
            ? () => {
                setMain(initial.main);
                setItems(initial.items);
              }
            : undefined
        }
        submitting={update.isPending}
        disabled={!canEdit || !dirty || uploading}
      />
    </form>
  );
}
