'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { VEHICLE_REGISTRATION_SOURCE, isVehicleRegistrationSource } from '@/constants/routes';
import { QuickVehicleWizard } from '@/features/list-vehicle/components/QuickVehicleWizard';

import styles from './page.module.css';

/**
 * `/list-your-vehicle/register` — wizard đăng xe nhanh (3 bước).
 *
 * `?from=` chỉ nhận MỘT trong ba mã đã biết (marketplace | account | manage) và chỉ dùng để
 * chọn nút quay lại + đích sau khi lưu. Không bao giờ nhận một URL để chuyển hướng: đó là cách
 * mở sẵn một lỗ open-redirect trên chính luồng onboarding.
 */
function RegisterPageInner() {
  const params = useSearchParams();
  const from = params.get('from');
  const source = isVehicleRegistrationSource(from)
    ? from
    : VEHICLE_REGISTRATION_SOURCE.MARKETPLACE;

  return (
    <main className={styles.page}>
      <QuickVehicleWizard source={source} />
    </main>
  );
}

export default function ListYourVehicleRegisterPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" />}>
      <RegisterPageInner />
    </Suspense>
  );
}
