import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ROUTES } from '@/navigation/routes';

/**
 * Giấy tờ & Xác minh đã thành một khối TRONG tab Tài khoản (design 22/10/2026). Giữ đường cũ để deep
 * link / thông báo cũ không rơi vào màn "không tìm thấy" — chuyển về tab Tài khoản. Điều hướng trong
 * `useEffect`, không `<Redirect>` giữa lúc render (cùng cách `ScopeGuard`).
 */
export default function AccountDocumentsRoute() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.account.home());
  }, [router]);
  return null;
}
