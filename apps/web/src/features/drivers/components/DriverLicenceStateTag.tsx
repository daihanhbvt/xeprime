'use client';

import { Tag, Typography } from 'antd';
import { useTranslations } from 'next-intl';
import { DRIVER_LICENCE_STATE } from '@xeprime/types';
import { holderNameDiffers, LIST_SEPARATOR } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { DriverLicenceSummary } from '../types';
import styles from './DriversPage.module.css';

const COLOR: Readonly<Record<string, string>> = {
  [DRIVER_LICENCE_STATE.VERIFIED]: 'green',
  [DRIVER_LICENCE_STATE.PENDING]: 'gold',
  [DRIVER_LICENCE_STATE.NONE]: 'default',
};

/**
 * Bằng lái của tài xế nhìn từ phía bên thuê (ADR 0063): mức + hạng/hạn, cùng HỌ TÊN và LOẠI bằng
 * khi đã xác thực để bên thuê đối chiếu đúng người — không ảnh, không số bằng. Dùng chung cho bảng tài xế và bộ chọn gán đơn.
 */
export function DriverLicenceStateTag({
  licence,
  compact = false,
  invitedName,
}: {
  licence: Pick<DriverLicenceSummary, 'state'> & Partial<DriverLicenceSummary>;
  /** Bộ chọn gán đơn: chỉ cái tag, không dòng hạng/hạn. */
  compact?: boolean;
  /** Tên bên thuê nhập khi mời — lệch với tên trên bằng thì cảnh báo. */
  invitedName?: string;
}) {
  const t = useTranslations('Drivers');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const tag = (
    <Tag color={COLOR[licence.state] ?? 'default'}>
      {domainLabel('driverLicenceState', licence.state)}
    </Tag>
  );
  if (compact || licence.state !== DRIVER_LICENCE_STATE.VERIFIED) return tag;

  const classes = licence.classes ?? [];
  // `expiresOn` là NGÀY LỊCH `YYYY-MM-DD` — `dateKey` không mượn nửa đêm theo máy.
  const expiry = licence.expiresOn
    ? t('licence.validUntil', { date: fmt.dateKey(licence.expiresOn) })
    : t('licence.noExpiry');
  return (
    <div>
      {tag}
      <div className={styles.meta}>
        {[classes.length > 0 ? t('licence.classes', { classes: classes.join(', ') }) : null, expiry]
          .filter(Boolean)
          .join(LIST_SEPARATOR)}
      </div>
      {licence.fullName ? (
        <div className={styles.meta}>
          {[
            t('licence.holder', { name: licence.fullName }),
            licence.kind ? t('licence.kind', { kind: domainLabel('driverLicenceKind', licence.kind) }) : null,
          ]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
        </div>
      ) : null}
      {invitedName && holderNameDiffers(licence.fullName, invitedName) ? (
        <Typography.Text type="warning" className={styles.meta}>
          {t('licence.nameMismatch')}
        </Typography.Text>
      ) : null}
    </div>
  );
}
