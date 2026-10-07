'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ACCOUNT_SECTION, ROUTES, accountSectionPath } from '@/constants/routes';
import { partnerPageRedirect } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Đích của route cũ `/registration` — THEO TUYẾN, nên phải chạy ở client sau `/auth/me`:
 *
 *  - chủ xe tuyến hoa hồng → section "Thông tin chủ xe" của Hồ sơ chủ xe;
 *  - tuyến gói → trang Cửa hàng (bản tương đương, `partnerPageRedirect`);
 *  - chưa có gian hàng / đang chờ thanh toán → nơi B1 đưa họ tới.
 *
 * Một `redirect()` ở server không biết tuyến, và đưa mọi người về cùng một section chỉ đúng với
 * một tuyến. Luật chọn đích là `partnerPageRedirect` — cùng hàm `AppShell` dùng cho URL gõ tay.
 */
export function OwnerRegistrationRedirect() {
  const router = useRouter();
  const { data: user, isPending } = useCurrentUser();

  useEffect(() => {
    if (isPending) return;
    router.replace(
      partnerPageRedirect(user, ROUTES.MANAGE.REGISTRATION) ??
        accountSectionPath(ACCOUNT_SECTION.PROFILE),
    );
  }, [isPending, user, router]);

  return <LoadingState variant="page" />;
}
