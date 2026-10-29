import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ACCOUNT_DOCUMENTS_SECTION } from '@/features/account/AccountProfileScreen';
import { ACCOUNT_SECTION_PARAM } from '@/navigation/account-section';
import { ROUTES } from '@/navigation/routes';

/**
 * Giấy tờ & Xác minh đã thành một khối TRONG tab Tài khoản (design 22/10/2026). Giữ đường cũ để deep
 * link / thông báo cũ không rơi vào màn "không tìm thấy" — chuyển về tab Tài khoản VÀ cuộn thẳng tới
 * khối Giấy tờ, như trang web cũ chuyển về `/account#documents`. Điều hướng trong `useEffect`, không
 * `<Redirect>` giữa lúc render (cùng cách `ScopeGuard`).
 */
export default function AccountDocumentsRoute() {
  const router = useRouter();
  useEffect(() => {
    router.replace(
      `${String(ROUTES.account.profile())}?${ACCOUNT_SECTION_PARAM}=${ACCOUNT_DOCUMENTS_SECTION}` as Href,
    );
  }, [router]);
  return null;
}
