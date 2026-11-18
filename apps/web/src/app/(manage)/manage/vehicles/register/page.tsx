'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { PartnerFocusLayout } from '@/components/layout/PartnerFocusLayout';
import { ShellFrame } from '@/components/layout/ShellFrame';
import { VEHICLE_REGISTRATION_SOURCE, isVehicleRegistrationSource } from '@/constants/routes';
import { QuickVehicleWizard } from '@/features/list-vehicle/components/QuickVehicleWizard';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './page.module.css';

/**
 * `/vehicles/register` của site partner — wizard đăng xe nhanh (hồ sơ chủ xe nếu chưa có gian hàng
 * + 3 bước xe). Đây là bước đầu của tuyến hoa hồng: tài khoản đối tác chưa có gian hàng vào thẳng đây
 * từ trang chọn cách cho thuê, và gian hàng mở ở bước lưu.
 *
 * Khung trang chọn theo NGUỒN VÀO (`?from=`), không theo "đã có gian hàng chưa" - nên khung không đổi
 * giữa chừng khi gian hàng vừa mở trên chính màn đang điền:
 *  - `account` / `manage` (chủ xe đã có tài khoản bấm "Thêm xe"): khung ĐẦY ĐỦ, menu ngang như mọi
 *    màn khác (18/11/2026);
 *  - `marketplace` (người mới đăng ký): `PartnerFocusLayout` gọn, không menu (`AppShell` coi route
 *    này là "bare").
 *
 * `?from=` chỉ nhận MỘT trong ba mã đã biết (marketplace | account | manage) và chỉ dùng để
 * chọn khung, nút quay lại + đích sau khi lưu. Không bao giờ nhận một URL để chuyển hướng: đó là
 * cách mở sẵn một lỗ open-redirect trên chính luồng onboarding.
 */
function RegisterPageInner() {
  const params = useSearchParams();
  const { data: user } = useCurrentUser();
  const from = params.get('from');
  const source = isVehicleRegistrationSource(from)
    ? from
    : VEHICLE_REGISTRATION_SOURCE.MARKETPLACE;

  const content = (
    <main className={styles.page}>
      <QuickVehicleWizard source={source} />
    </main>
  );

  if (source !== VEHICLE_REGISTRATION_SOURCE.MARKETPLACE && user) {
    return (
      <ShellFrame user={user} layout="topnav">
        {content}
      </ShellFrame>
    );
  }
  return <PartnerFocusLayout>{content}</PartnerFocusLayout>;
}

export default function ListYourVehicleRegisterPage() {
  return (
    <Suspense fallback={<LoadingState variant="page" />}>
      <RegisterPageInner />
    </Suspense>
  );
}
