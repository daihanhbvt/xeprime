'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { branchFormSchema, type BranchFormValues } from '@xeprime/validators';
import { EmbedMap } from '@/components/data-display/EmbedMap';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { mapPlaceUrl, toGeoPoint } from '@/lib/map-embed';
import { useCreateBranch, useUpdateBranch } from '../hooks/use-branches';
import type { Branch } from '../types';
import styles from './BranchFormDialog.module.css';

/**
 * Thêm/sửa chi nhánh — dùng `ResponsiveDialog` chung (modal ở desktop, drawer đáy ở mobile), nên
 * không có một hộp thoại thứ hai trong repo làm cùng việc.
 *
 * Tỉnh/thành là trường BẮT BUỘC và lấy từ API danh mục, không hardcode: đây là thứ quyết định xe
 * của chi nhánh hiện ở đâu trên marketplace.
 *
 * **Toạ độ không có ô nhập.** Backend tự tra từ địa chỉ khi lưu (best-effort), và bản đồ dưới
 * đây là chỗ chủ shop KIỂM lại kết quả đó. Việc kiểm này không phải trang trí: toạ độ chi nhánh
 * là điểm xuất phát của mọi phép tính phí giao xe tận nơi, nên một cái ghim lệch vài km là mọi
 * đơn giao của chi nhánh đó sai tiền.
 */
export function BranchFormDialog({
  open,
  branch,
  onClose,
}: {
  open: boolean;
  /** Có = sửa, không = tạo mới. */
  branch: Branch | null;
  onClose: () => void;
}) {
  const t = useTranslations('Branches');
  const tc = useTranslations('Common');
  const provinces = useProvinceOptions();
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const submitting = create.isPending || update.isPending;

  const { control, handleSubmit } = useForm<BranchFormValues>({
    resolver: yupResolver(branchFormSchema),
    defaultValues: {
      name: branch?.name ?? '',
      provinceCode: branch?.provinceCode ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      provinceCode: values.provinceCode,
      address: values.address || undefined,
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

  // API trả toạ độ dạng CHUỖI (Decimal → string, ADR 0007) — parse ở đây, một chỗ.
  const point = branch
    ? toGeoPoint(
        branch.latitude == null ? null : Number(branch.latitude),
        branch.longitude == null ? null : Number(branch.longitude),
      )
    : null;
  const mapUrl = mapPlaceUrl(point);

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
          message={t('form.noProvinceTitle')}
          description={
            branch.legacyProvinceValue
              ? t('form.noProvinceLegacy', { value: branch.legacyProvinceValue })
              : t('form.noProvinceHint')
          }
        />
      ) : null}

      {provinces.isError ? (
        <Alert
          type="warning"
          showIcon
          className={styles.notice}
          message={t('form.provincesLoadError')}
          action={
            <Button size="small" onClick={provinces.refetch}>
              {tc('actions.retry')}
            </Button>
          }
        />
      ) : null}

      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <TextField
          control={control}
          name="name"
          label={t('form.nameLabel')}
          placeholder={t('form.namePlaceholder')}
          autoFocus
        />
        <SelectField
          control={control}
          name="provinceCode"
          label={t('form.provinceLabel')}
          required
          showSearch
          options={provinces.options}
          disabled={provinces.isLoading || provinces.isError}
          placeholder={
            provinces.isLoading ? t('form.provinceLoading') : t('form.provincePlaceholder')
          }
          help={t('form.provinceHelp')}
        />
        <TextField
          control={control}
          name="address"
          label={t('form.addressLabel')}
          placeholder={t('form.addressPlaceholder')}
        />
        <TextField
          control={control}
          name="phone"
          label={t('form.phoneLabel')}
          placeholder={t('form.phonePlaceholder')}
        />
      </DialogForm>

      {/*
        Chỉ hiện khi SỬA: chi nhánh mới chưa có địa chỉ nào để tra, một khối bản đồ rỗng ở form
        tạo chỉ là chỗ trống gây khó hiểu. Ba nhánh dưới đây là ba sự thật khác nhau và phải nói
        khác nhau — có vị trí / có địa chỉ nhưng tra không ra / chưa nhập địa chỉ.
      */}
      {branch ? (
        <section className={styles.mapBlock} aria-label={t('map.title')}>
          <h3 className={styles.mapTitle}>{t('map.title')}</h3>
          {mapUrl ? (
            <>
              <EmbedMap src={mapUrl} title={t('map.frameTitle')} height={200} />
              <p className={styles.mapHint}>{t('map.hint')}</p>
            </>
          ) : (
            <p className={styles.mapHint}>
              {branch.address ? t('map.pending') : t('map.addressFirst')}
            </p>
          )}
        </section>
      ) : null}
    </ResponsiveDialog>
  );
}
