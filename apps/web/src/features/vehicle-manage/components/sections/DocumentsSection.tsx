'use client';

import { useTranslations } from 'next-intl';

import { VehicleDocumentsWorkspace } from '@/features/vehicle-documents/components/VehicleDocumentsWorkspace';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';

/**
 * Mục "Giấy tờ xe" — CHỈ là vỏ quanh `VehicleDocumentsWorkspace`: upload riêng tư, signed
 * download, phiên bản, OCR/duyệt tay, lưu trữ và quyền đều của workspace đó. Không có luồng
 * giấy tờ thứ hai, không có ảnh thu nhỏ từ bucket riêng tư chỉ để giống mockup.
 */
export function DocumentsSection() {
  const { vehicle } = useManagedVehicle();
  const t = useTranslations('VehicleManage.documents');
  return (
    <SectionCard title={t('title')} subtitle={t('subtitle')} headingLevel={1}>
      <VehicleDocumentsWorkspace vehicle={vehicle} />
    </SectionCard>
  );
}
