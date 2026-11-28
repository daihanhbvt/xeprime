import { memo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { FieldBox } from '@/components/ui/FieldBox';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import type { Branch } from '@/api/branches/api';
import { BranchFormSheet } from '@/features/branches/components/BranchFormSheet';

/**
 * "Địa chỉ nhận xe" của chủ xe tuyến HOA HỒNG trong wizard thêm xe - port web
 * `VehiclePickupAddressField` (18/11/2026): thay ô chọn chi nhánh khi chỉ có MỘT chi nhánh. Xe luôn ở
 * chi nhánh đó nên không có gì để chọn, nhưng chủ xe phải THẤY xe được nhận ở đâu và sửa được ngay.
 * Chạm mở `BranchFormSheet` dùng chung (danh mục hành chính, ghim toạ độ - phí giao xe đọc toạ độ này).
 */
export const VehiclePickupAddressField = memo(function VehiclePickupAddressField({
  branch,
  loading,
}: {
  branch: Branch | null;
  loading: boolean;
}) {
  const t = useTranslations('Vehicles.form.pickupAddress');
  const { has } = usePermissions();
  const [editing, setEditing] = useState(false);
  const canEdit = Boolean(branch) && has(PERMISSION.BRANCH_MANAGE);
  const text = branch ? (branch.address ?? branch.provinceName ?? '') : '';

  return (
    <>
      <FieldBox
        label={t('label')}
        required
        value={loading ? '' : text}
        placeholder={loading ? t('loading') : t('missing')}
        hint={t('tip')}
        onPress={() => {
          if (canEdit) setEditing(true);
        }}
      />
      {branch && canEdit ? (
        <BranchFormSheet
          open={editing}
          branch={branch}
          onClose={() => setEditing(false)}
          notice={
            branch.vehicleCount > 0 ? (
              <Callout tone="warning" title={t('sharedTitle', { count: branch.vehicleCount })}>
                {t('sharedBody')}
              </Callout>
            ) : null
          }
        />
      ) : null}
    </>
  );
});
