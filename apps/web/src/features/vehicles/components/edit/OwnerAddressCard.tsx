'use client';

import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toGeoPoint } from '@xeprime/domain';

import { MapLink } from '@/components/data-display/MapLink';
import { StaticMapImage } from '@/components/data-display/StaticMapImage';
import { BranchFormDialog } from '@/features/branches/components/BranchFormDialog';
import { branchMapSrc, useBranches } from '@/features/branches/hooks/use-branches';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import type { VehicleDetail } from '../../types';
import { EditCard } from './EditCard';
import styles from './EditPanes.module.css';

/**
 * "Địa chỉ xe" của chủ xe tuyến hoa hồng — địa chỉ hiện tại của xe = chi nhánh giữ xe
 * (`Vehicle.branchId → TenantBranch`), không có nguồn địa chỉ thứ hai. Chủ xe không có màn Chi
 * nhánh như gian hàng, nên sửa ngay tại đây bằng đúng `BranchFormDialog`, và được nói rõ khi chi
 * nhánh đó đang giữ nhiều xe.
 *
 * Bản đồ là một ẢNH TĨNH API vẽ hộ (`StaticMapImage`, ADR 0061 điều 1) kèm liên kết mở ứng dụng bản
 * đồ — thiếu toạ độ thì chỉ hiện chữ, không bao giờ chặn sửa.
 */
export function OwnerAddressCard({
  vehicle,
  canEdit,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.information');
  const tAddress = useTranslations('Address');
  const branches = useBranches();
  const [editing, setEditing] = useState(false);
  const hideBranchMap = useSupportHides(SUPPORT_HIDDEN_AREA.BRANCH_MAP);

  const branch = branches.data?.items.find((b) => b.id === vehicle.branch?.id) ?? null;
  const point = branch
    ? toGeoPoint(
        branch.latitude == null ? null : Number(branch.latitude),
        branch.longitude == null ? null : Number(branch.longitude),
      )
    : null;
  const addressLine = [branch?.address, branch?.provinceName ?? vehicle.branch?.provinceName]
    .filter(Boolean)
    .join(', ');

  return (
    <EditCard
      title={t('addressTitle')}
      extra={
        branch && canEdit ? (
          <Button type="link" onClick={() => setEditing(true)}>
            {t('addressEdit')}
          </Button>
        ) : null
      }
    >
      {!vehicle.branch ? (
        <Alert type="warning" showIcon title={t('addressMissing')} />
      ) : (
        <div className={styles.address}>
          <p className={styles.addressLine}>{addressLine || t('addressNoStreet')}</p>
          {branch?.name ? <p className={styles.toggleHint}>{branch.name}</p> : null}
          {point && branch ? (
            <>
              {/* API chỉ vẽ cho chi nhánh có địa chỉ riêng (`branchMapTarget`) — thiếu thì khỏi hỏi. */}
              {branch.address && !hideBranchMap ? (
                <StaticMapImage
                  src={branchMapSrc(branch.id, point, branch.address)}
                  alt={t('addressMapTitle')}
                />
              ) : null}
              <MapLink point={point} label={tAddress('map.openInGoogleMaps')} />
            </>
          ) : branch?.address ? (
            <p className={styles.toggleHint}>{t('addressMapPending')}</p>
          ) : null}
        </div>
      )}
      {branch ? (
        <BranchFormDialog
          open={editing}
          branch={branch}
          onClose={() => setEditing(false)}
          notice={
            branch.vehicleCount > 1 ? (
              <Alert
                type="warning"
                showIcon
                title={t('addressSharedTitle', { count: branch.vehicleCount })}
                description={t('addressSharedBody')}
              />
            ) : (
              <Alert type="info" showIcon title={t('addressBranchHint')} />
            )
          }
        />
      ) : null}
    </EditCard>
  );
}
