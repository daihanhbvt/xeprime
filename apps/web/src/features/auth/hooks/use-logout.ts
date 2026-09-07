'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { destroySession } from '@/services/auth.service';

import { useAuthCache } from './use-auth-actions';

/**
 * Đăng xuất — MỘT bản cài đặt, hai lối vào (`useMarketLogout`, `usePortalLogout`).
 *
 * Hai hook đó từng là hai bản chép tay giống hệt nhau trừ đích đến, và chúng đã trôi khỏi nhau
 * đúng như docblock của chúng cảnh báo: bản khu khách bọc `try/catch` quanh `destroySession()`,
 * bản cổng quản lý thì không — nên một lần `DELETE /auth/session` hỏng (mất mạng, proxy chặn)
 * làm cả hàm ném giữa chừng: cache không được dọn, không điều hướng đi đâu, và nút Đăng xuất
 * trở thành nút chết. Ba bước dưới đây vì thế chỉ được viết một lần:
 *
 *  1. xoá phiên phía server (cookie httpOnly — client không tự xoá được, ADR 0002);
 *  2. dọn cache TanStack Query (và đánh thức observer đang mount — xem `useAuthCache`);
 *  3. điều hướng về đích của ngữ cảnh.
 *
 * Bước 1 hỏng KHÔNG được chặn bước 2 và 3: người dùng đã nói họ muốn ra, và cookie hỏng thì
 * `/auth/me` cũng sẽ 401 ở lần gọi kế tiếp.
 */
export function useLogout(destination: string): () => Promise<void> {
  const router = useRouter();
  const { clearAfterLogout } = useAuthCache();

  return useCallback(async () => {
    try {
      await destroySession();
    } catch {
      // Cookie có thể đã hết hạn phía server, hoặc mạng hỏng — vẫn phải dọn cache và đưa
      // người dùng đi. Giữ họ lại trong một phiên mà chính họ vừa xin thoát là tệ hơn.
    }
    clearAfterLogout();
    router.replace(destination);
  }, [router, clearAfterLogout, destination]);
}
