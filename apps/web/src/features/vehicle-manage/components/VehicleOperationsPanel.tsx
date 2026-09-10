'use client';

import { Collapse } from 'antd';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import type { VehicleDetail } from '@/features/vehicles/types';

import { VehicleManageProvider } from './VehicleManageContext';
import { AutoAcceptSection } from './sections/AutoAcceptSection';
import { DriverSurchargesSection } from './sections/DriverSurchargesSection';
import { HandoverTimeSection } from './sections/HandoverTimeSection';
import { TermsSection } from './sections/TermsSection';
import styles from './VehicleOperationsPanel.module.css';

/**
 * Tab "Vận hành & điều kiện thuê" ở `/manage/vehicles/:id/edit` — CÙNG các section của không
 * gian quản lý xe Owner Lite (ADR 0027/0028: hai tuyến một mã nguồn). Gian hàng có nhiều xe nên
 * gom từng khối vào Collapse thay vì trải 4 màn; form bên trong, hook, endpoint đều y hệt.
 */
export function VehicleOperationsPanel({
  vehicle,
  canEdit,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.operationsTab');
  const services = vehicle.serviceTypes ?? [];
  const selfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const withDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);

  const items = [
    { key: 'handover', label: t('handover'), children: <HandoverTimeSection /> },
    {
      key: 'self-drive',
      label: t('selfDrive'),
      children: selfDrive ? (
        <div className={styles.stack}>
          <AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
          <TermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
        </div>
      ) : (
        <p className={styles.off}>{t('serviceOff')}</p>
      ),
    },
    {
      key: 'with-driver',
      label: t('withDriver'),
      children: withDriver ? (
        <div className={styles.stack}>
          <AutoAcceptSection serviceType={SERVICE_TYPE.WITH_DRIVER} />
          <DriverSurchargesSection />
          <TermsSection serviceType={SERVICE_TYPE.WITH_DRIVER} />
        </div>
      ) : (
        <p className={styles.off}>{t('serviceOff')}</p>
      ),
    },
  ];

  return (
    <VehicleManageProvider value={{ vehicle, canEdit }}>
      <p className={styles.hint}>{t('hint')}</p>
      <Collapse className={styles.collapse} defaultActiveKey={['handover']} items={items} />
    </VehicleManageProvider>
  );
}
