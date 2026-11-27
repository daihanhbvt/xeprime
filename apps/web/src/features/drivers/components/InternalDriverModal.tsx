'use client';

import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import type { InternalDriver } from '../types';
import { useInternalDriverForm } from './InternalDriverForm';

/**
 * Thêm / sửa MỘT tài xế nội bộ ngoài hộp "Thêm tài xế mới": sửa từ thẻ / trang chi tiết, và thêm
 * nhanh ngay trong bộ chọn tài xế của đơn (lưu xong gán luôn). Cùng form với tab "Tài xế nội bộ".
 */
export function InternalDriverModal({
  open,
  driver,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Có = sửa người này; null = thêm mới. */
  driver: InternalDriver | null;
  onClose: () => void;
  /** Gọi sau khi lưu xong — bộ chọn trên đơn dùng để gán ngay người vừa thêm. */
  onSaved?: (driver: InternalDriver) => void;
}) {
  const t = useTranslations('Drivers.add.internal');
  const tCommon = useTranslations('Common');
  const { form, submit, pending } = useInternalDriverForm({
    open,
    driver,
    onDone: (saved) => {
      onSaved?.(saved);
      onClose();
    },
  });

  return (
    <ResponsiveDialog
      title={driver ? t('editTitle') : t('title')}
      open={open}
      size="sm"
      okText={driver ? t('save') : t('submit')}
      cancelText={tCommon('actions.cancel')}
      confirmLoading={pending}
      onOk={submit}
      onClose={onClose}
    >
      {form}
    </ResponsiveDialog>
  );
}
