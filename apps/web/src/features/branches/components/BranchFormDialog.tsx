'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { guessAddressLine } from '@xeprime/domain';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { AddressField } from '@/components/form/AddressField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';
import type { Branch } from '../types';
import styles from './BranchFormDialog.module.css';

/**
 * Tên bảy trường địa chỉ trong `branchFormSchema`. Hằng số ngoài component: định danh ổn định
 * giữa các lần render, nên `AddressField` không dựng lại bản đồ mỗi khi form re-render.
 */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;

/** Bốn trường GHIM — tách riêng vì không phải form nào cũng lưu toạ độ (xem `AddressPinNames`). */
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * Thêm/sửa chi nhánh — dùng `ResponsiveDialog` chung (modal ở desktop, drawer đáy ở mobile), nên
 * không có một hộp thoại thứ hai trong repo làm cùng việc.
 *
 * Địa chỉ đi qua `AddressField` — tỉnh/thành và xã/phường chọn từ DANH MỤC NHÀ NƯỚC (mô hình
 * hai cấp từ 01/07/2025), số nhà và đường thì gõ, rồi xác nhận ghim trên bản đồ. Cả ba phần đều
 * bắt buộc ở đây vì chi nhánh là ĐỊA ĐIỂM VẬN HÀNH THẬT: xe nằm ở đó, khách tới đó nhận xe, và
 * toạ độ của nó là điểm xuất phát của mọi phép tính phí giao xe tận nơi — một cái ghim lệch vài
 * km là mọi đơn giao của chi nhánh đó sai tiền.
 */
export function BranchFormDialog({
  open,
  branch,
  onClose,
  notice,
}: {
  open: boolean;
  /** Có = sửa, không = tạo mới. */
  branch: Branch | null;
  onClose: () => void;
  /**
   * Cảnh báo ngữ cảnh đặt trên form — ví dụ màn quản lý MỘT xe nhắc rằng chi nhánh này đang giữ
   * nhiều xe và sửa địa chỉ sẽ đổi vị trí của tất cả. Hộp thoại không tự suy điều đó.
   */
  notice?: ReactNode;
}) {
  const t = useTranslations('Branches');
  const tAddr = useTranslations('Address');
  const tc = useTranslations('Common');
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const submitting = create.isPending || update.isPending;

  const resolver = useValidationResolver<BranchFormValues>(
    branchFormSchema,
    'Branches.validation',
  );
  const { control, handleSubmit } = useForm<BranchFormValues>({
    resolver,
    defaultValues: {
      name: branch?.name ?? '',
      provinceCode: branch?.provinceCode ?? '',
      wardCode: branch?.wardCode ?? '',
      /*
       * Chi nhánh CŨ chưa có `addressLine`: đoán phần "số nhà, đường" từ chuỗi hiển thị bằng
       * cách cắt các cụm trông như đơn vị hành chính. Chỉ là GỢI Ý cho ô nhập — người dùng nhìn
       * và sửa trước khi lưu, và đó chính là lý do form này bắt họ xác nhận lại địa chỉ.
       */
      addressLine: branch?.addressLine ?? guessAddressLine(branch?.address),
      placeId: branch?.placeId ?? null,
      latitude: branch?.latitude == null ? null : Number(branch.latitude),
      longitude: branch?.longitude == null ? null : Number(branch.longitude),
      locationSource: branch?.locationSource ?? null,
      phone: branch?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      provinceCode: values.provinceCode,
      /*
       * Chuỗi RỖNG không được gửi. DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
       * chỉ bỏ qua `null`/`undefined` — một `''` vẫn đi vào `@Length` và bật lỗi 400. Từ ADR 0042
       * form không còn ô Xã/phường nên chi nhánh MỚI luôn để trống trường này; chi nhánh cũ đã có
       * mã thì giữ nguyên mã đó.
       */
      wardCode: values.wardCode || undefined,
      addressLine: values.addressLine || undefined,
      placeId: values.placeId ?? undefined,
      latitude: values.latitude ?? undefined,
      longitude: values.longitude ?? undefined,
      locationSource: values.locationSource ?? undefined,
      phone: values.phone || undefined,
    };
    // `mutateAsync` + try/catch: đóng hộp thoại CHỈ khi lưu thành công. Đóng trước rồi báo lỗi
    // sau là người dùng mất hết dữ liệu vừa nhập.
    try {
      if (branch) await update.mutateAsync({ id: branch.id, ...payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch {
      // Thông báo lỗi do hook mutation hiển thị; giữ nguyên form để sửa và gửi lại.
    }
  });

  return (
    <ResponsiveDialog
      title={branch ? t('form.editTitle', { name: branch.name }) : t('form.createTitle')}
      open={open}
      onClose={onClose}
      okText={branch ? tc('actions.save') : t('form.createOk')}
      onOk={() => void onSubmit()}
      confirmLoading={submitting}
    >
      {branch?.needsLocationReview ? (
        <Alert
          type="warning"
          showIcon
          className={styles.notice}
          title={tAddr('review.title')}
          description={
            branch.legacyProvinceValue
              ? `${tAddr('review.hint')} ${tAddr('review.legacyValue', { value: branch.legacyProvinceValue })}`
              : tAddr('review.hint')
          }
        />
      ) : null}

      {notice}

      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="name"
          label={t('form.nameLabel')}
          placeholder={t('form.namePlaceholder')}
          autoFocus
        />
        <AddressField
          control={control}
          names={ADDRESS_FIELD_NAMES}
          pin={ADDRESS_PIN_NAMES}
          required
          /*
           * Chỉ TẠO MỚI mới điền sẵn tỉnh đã nhớ. Ở chế độ SỬA, ô tỉnh trống nghĩa là chi nhánh
           * này có từ trước danh mục hành chính (ADR 0035 điều 7) — điền vào đó tỉnh mà người
           * dùng vừa xem ở nơi khác sẽ dời một địa điểm vận hành có thật sang tỉnh khác, âm thầm,
           * chỉ vì họ bấm Lưu.
           */
          prefillRememberedProvince={!branch}
        />
        <TextField
          control={control}
          name="phone"
          label={t('form.phoneLabel')}
          placeholder={t('form.phonePlaceholder')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}
