'use client';

import { Collapse } from 'antd';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE, SUPPORT_CAPABILITY } from '@xeprime/types';
import type { VehicleDetail } from '@/features/vehicles/types';

import { VehicleManageProvider } from './VehicleManageContext';
import { AutoAcceptSection } from './sections/AutoAcceptSection';
import { DriverSurchargesSection } from './sections/DriverSurchargesSection';
import { HandoverTimeSection } from './sections/HandoverTimeSection';
import { TermsSection } from './sections/TermsSection';
import {
  SUPPORT_HIDDEN_AREA,
  useSupportCan,
  useSupportHides,
} from '@/features/tenant-support/support-session';
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
  /*
   * Phiên hỗ trợ (ADR 0050 §13): điều khoản thuê (pháp lý + cọc) và phụ phí có tài xế (tiền) không
   * mở — hai khối đó không dựng. Khung giờ giao nhận và điều kiện vận hành đòi đúng capability.
   */
  const moneyHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MONEY_TERMS);
  const canOperate = useSupportCan(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
  const editable = canEdit && canOperate;

  const items = [
    { key: 'handover', label: t('handover'), children: <HandoverTimeSection /> },
    {
      key: 'self-drive',
      label: t('selfDrive'),
      children: selfDrive ? (
        <div className={styles.stack}>
          <AutoAcceptSection serviceType={SERVICE_TYPE.SELF_DRIVE} />
          {moneyHidden ? null : <TermsSection serviceType={SERVICE_TYPE.SELF_DRIVE} />}
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
          {moneyHidden ? null : <DriverSurchargesSection />}
          {moneyHidden ? null : <TermsSection serviceType={SERVICE_TYPE.WITH_DRIVER} />}
        </div>
      ) : (
        <p className={styles.off}>{t('serviceOff')}</p>
      ),
    },
  ];

  return (
    <VehicleManageProvider value={{ vehicle, canEdit: editable }}>
      <p className={styles.hint}>{t('hint')}</p>
      <Collapse className={styles.collapse} defaultActiveKey={['handover']} items={items} />
    </VehicleManageProvider>
  );
}
