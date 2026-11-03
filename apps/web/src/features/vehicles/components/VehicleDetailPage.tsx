'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ROUTES } from '@/constants/routes';
import { PageContainer } from '@/components/layout/PageContainer';
import { VehicleDetailContent } from '@/features/vehicles/components/VehicleDetailContent';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';

/**
 * Hồ sơ xe — Figma Partner-XePrime section `23672:25621` (03/11/2026).
 *
 * Trang chỉ truyền tiêu đề + nút quay lại. Toàn bộ query, quyền, trạng thái và hành động (cả
 * hàng nút ở vùng phải tiêu đề) nằm ở `VehicleDetailContent` — dùng CHUNG với modal hồ sơ xe (mở từ hộp thư yêu cầu thuê),
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
      <VehicleDetailContent
        vehicleId={params.id}
        pageHeader={{
          title: t('detail.title'),
          subtitle: t('detail.pageSubtitle'),
          onBack: backToList,
        }}
        notFoundAction={{ label: t('detail.backToList'), onClick: backToList }}
        onDeleted={() => router.replace(listHref)}
      />
    </PageContainer>
  );
}
