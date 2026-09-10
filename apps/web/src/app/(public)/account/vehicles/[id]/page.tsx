'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ROUTES } from '@/constants/routes';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleDetailContent } from '@/features/vehicles/components/VehicleDetailContent';

/**
 * Chi tiết một xe nhìn từ khu tài khoản — CHỈ là vỏ (tiêu đề + đường quay lại) quanh
 * `VehicleDetailContent`, đúng như `/manage/vehicles/[id]` và modal hồ sơ xe. Không có màn chi
 * tiết xe thứ hai: query, quyền, trạng thái và hành động đều nằm trong component dùng chung.
 */
export default function AccountVehicleDetailPage() {
  const t = useTranslations('Account.vehicles.detail');
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const backToList = () => router.push(ROUTES.ACCOUNT.VEHICLES);

  return (
    <OwnerGate>
      <AccountPageHeader
        title={t('title')}
        back={{ href: ROUTES.ACCOUNT.VEHICLES, label: t('back') }}
      />
      <VehicleDetailContent
        vehicleId={params.id}
        notFoundAction={{ label: t('back'), onClick: backToList }}
        onDeleted={() => router.replace(ROUTES.ACCOUNT.VEHICLES)}
      />
    </OwnerGate>
  );
}
