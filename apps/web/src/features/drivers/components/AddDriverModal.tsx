'use client';

import { Segmented } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DRIVER_ROSTER_KIND, type DriverRosterKind } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import type { InviteDriverFormValues } from '../schema';
import { useInternalDriverForm } from './InternalDriverForm';
import { useInviteDriverForm } from './InviteDriverForm';
import styles from './DriverModals.module.css';

/**
 * Hộp "Thêm tài xế mới" — Figma `23737:46392` (Mời tài xế) · `24612:140670` (Tài xế nội bộ): một
 * nút trên màn Tài xế, hai tab trong hộp. "Mời lại" một liên kết đã đóng dùng cùng hộp, chỉ tab mời,
 * điền sẵn.
 */
export function AddDriverModal({
  open,
  prefill,
  onClose,
}: {
  open: boolean;
  /** "Mời lại" — có giá trị thì chỉ còn tab mời. */
  prefill: InviteDriverFormValues | null;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const [tab, setTab] = useState<DriverRosterKind>(DRIVER_ROSTER_KIND.LINKED);
  // Đóng là về tab mời — lần mở sau không đứng ở tab của lần trước.
  const close = () => {
    setTab(DRIVER_ROSTER_KIND.LINKED);
    onClose();
  };
  const invite = useInviteDriverForm({ open, prefill, onDone: close });
  const internal = useInternalDriverForm({ open, driver: null, onDone: close });

  const active = prefill ? DRIVER_ROSTER_KIND.LINKED : tab;
  const current = active === DRIVER_ROSTER_KIND.LINKED ? invite : internal;

  return (
    <ResponsiveDialog
      title={prefill ? t('form.titleReinvite') : t('add.title')}
      open={open}
      size="sm"
      okText={
        active === DRIVER_ROSTER_KIND.LINKED ? t('add.invite.submit') : t('add.internal.submit')
      }
      cancelText={tCommon('actions.cancel')}
      confirmLoading={current.pending}
      onOk={current.submit}
      onClose={close}
    >
      {prefill ? null : (
        <div className={styles.tabs}>
          <Segmented<DriverRosterKind>
            block
            value={active}
            aria-label={t('add.tabsLabel')}
            options={[
              { value: DRIVER_ROSTER_KIND.LINKED, label: t('add.tabs.invite') },
              { value: DRIVER_ROSTER_KIND.INTERNAL, label: t('add.tabs.internal') },
            ]}
            onChange={setTab}
          />
        </div>
      )}
      {active === DRIVER_ROSTER_KIND.LINKED ? invite.form : internal.form}
    </ResponsiveDialog>
  );
}
