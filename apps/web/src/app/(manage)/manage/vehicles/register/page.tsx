'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { PartnerFocusLayout } from '@/components/layout/PartnerFocusLayout';
import { VEHICLE_REGISTRATION_SOURCE, isVehicleRegistrationSource } from '@/constants/routes';
import { QuickVehicleWizard } from '@/features/list-vehicle/components/QuickVehicleWizard';

import styles from './page.module.css';

/**
 * `/vehicles/register` của site partner — wizard đăng xe nhanh (hồ sơ chủ xe nếu chưa có gian hàng
 * + 3 bước xe). Đây là bước đầu của tuyến hoa hồng: tài khoản đối tác chưa có gian hàng vào thẳng đây
 * từ trang chọn cách cho thuê, và gian hàng mở ở bước lưu.
 *
 * Chạy trong `PartnerFocusLayout` (không sidebar — `AppShell` coi route này là "bare"): sidebar bật
 * lên giữa chừng khi gian hàng vừa mở là một cú giật bố cục ngay trên màn hình đang điền.
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
    <PartnerFocusLayout>
      <Suspense fallback={<LoadingState variant="page" />}>
        <RegisterPageInner />
      </Suspense>
    </PartnerFocusLayout>
  );
}
