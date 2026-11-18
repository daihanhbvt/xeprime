'use client';

import { Alert, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION } from '@xeprime/types';

import { InfoTip } from '@/components/overlay/InfoTip';
import { BranchFormDialog } from '@/features/branches/components/BranchFormDialog';
import type { Branch } from '@/features/branches/types';
import { usePermissions } from '@/hooks/use-permissions';
import { FieldLockButton } from '@/components/form/field-lock';
import styles from './VehiclePickupAddressField.module.css';

/**
 * "Địa chỉ nhận xe" của chủ xe tuyến HOA HỒNG trong wizard thêm xe (18/11/2026) - thay ô chọn chi
 * nhánh khi chỉ có MỘT chi nhánh: xe luôn ở chi nhánh mặc định, nên không có gì để chọn, nhưng chủ
 * xe phải thấy xe sẽ được nhận ở đâu và sửa được ngay (như khối "Địa chỉ xe" của wizard đăng nhanh).
 *
 * Sửa mở `BranchFormDialog` dùng chung (danh mục hành chính, ghim toạ độ - phí giao xe đọc toạ độ
 * này). Chỉ gắn hộp thoại khi MỞ: nó dựng `defaultValues` một lần lúc mount.
 */
export function VehiclePickupAddressField({
  branch,
  loading,
}: {
  branch: Branch | null;
  loading: boolean;
}) {
  const t = useTranslations('Vehicles.form.pickupAddress');
  const { has } = usePermissions();
  const [editing, setEditing] = useState(false);
  const canEdit = has(PERMISSION.BRANCH_MANAGE);
  const text = branch ? (branch.address ?? branch.provinceName ?? '') : '';

  return (
    <Form.Item
      label={
        <span className={styles.label}>
          {t('label')}
          <InfoTip label={t('tipLabel')}>{t('tip')}</InfoTip>
        </span>
      }
      required
    >
      <div className={styles.box} aria-busy={loading || undefined}>
        <span className={text ? styles.text : styles.placeholder}>
          {loading ? t('loading') : text || t('missing')}
        </span>
        {/* Cùng nút bút chì với các ô khoá khác của thẻ Thông tin xe. */}
        {branch && canEdit ? (
          <FieldLockButton ariaLabel={t('edit')} onClick={() => setEditing(true)} />
        ) : null}
      </div>
      {branch && canEdit && editing ? (
        <BranchFormDialog
          open
          branch={branch}
          onClose={() => setEditing(false)}
          notice={
            branch.vehicleCount > 0 ? (
              <Alert
                type="warning"
                showIcon
                title={t('sharedTitle', { count: branch.vehicleCount })}
                description={t('sharedBody')}
              />
            ) : null
          }
        />
      ) : null}
    </Form.Item>
  );
}
