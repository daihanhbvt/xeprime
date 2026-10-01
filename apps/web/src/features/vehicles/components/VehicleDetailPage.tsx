'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { VehicleDetailContent } from '@/features/vehicles/components/VehicleDetailContent';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';

/**
 * Hồ sơ 360 của một xe — Figma `236:2222` (desktop) · `236:4783` (mobile).
 *
 * Trang chỉ dựng khung: tiêu đề + nút quay lại. Toàn bộ query, quyền, trạng thái và hành động
 * nằm ở `VehicleDetailContent` — dùng CHUNG với modal hồ sơ xe (mở từ hộp thư yêu cầu thuê),
 * theo đúng cách `BookingDetailContent` dùng chung giữa trang và modal.
 */
export function VehicleDetailPage() {
  const t = useTranslations('Vehicles');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // Trả về ĐÚNG chi nhánh đang lọc lúc rời danh sách (ADR 0052), chứ không về danh sách trần.
  const listHref = useBranchReturnHref(ROUTES.MANAGE.VEHICLES);
  const backToList = () => router.push(listHref);

  return (
    <PageContainer width="wide">
      <ManagePageHeader
        title={t('detail.title')}
        subtitle={t('detail.pageSubtitle')}
        onBack={backToList}
      />
      <VehicleDetailContent
        vehicleId={params.id}
        notFoundAction={{ label: t('detail.backToList'), onClick: backToList }}
        onDeleted={() => router.replace(listHref)}
      />
    </PageContainer>
  );
}
