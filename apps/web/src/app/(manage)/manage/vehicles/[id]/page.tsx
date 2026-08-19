'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { VehicleDetailContent } from '@/features/vehicles/components/VehicleDetailContent';

/**
 * Hồ sơ 360 của một xe — Figma `236:2222` (desktop) · `236:4783` (mobile).
 *
 * Trang chỉ dựng khung: tiêu đề + nút quay lại. Toàn bộ query, quyền, trạng thái và hành động
 * nằm ở `VehicleDetailContent` — dùng CHUNG với modal hồ sơ xe (mở từ hộp thư yêu cầu thuê),
 * theo đúng cách `BookingDetailContent` dùng chung giữa trang và modal.
 */
export default function VehicleDetailPage() {
  const t = useTranslations('Vehicles');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const backToList = () => router.push(ROUTES.MANAGE.VEHICLES);

  return (
    <PageContainer>
      <ManagePageHeader
        title={t('detail.title')}
        subtitle={t('detail.pageSubtitle')}
        onBack={backToList}
      />
      <VehicleDetailContent
        vehicleId={params.id}
        notFoundAction={{ label: t('detail.backToList'), onClick: backToList }}
        onDeleted={() => router.replace(ROUTES.MANAGE.VEHICLES)}
      />
    </PageContainer>
  );
}
