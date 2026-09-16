import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { shopAccountRedirect } from '../shop-account-gate';

/**
 * Thi hành cổng URL của khu khách cho tài khoản gian hàng tuyến gói (ADR 0038 điều 7).
 *
 * Gắn MỘT lần ở gốc cây điều hướng, không phải từng màn: khu khách của app native là một tập màn
 * phẳng (`app/account/*`, `app/trips/*`, `app/(tabs)/*`) chứ không có layout chung như web, nên
 * gác từng màn sẽ bỏ sót đúng cái màn được thêm vào tháng sau.
 *
 * Không render gì — đây là một hiệu ứng, và nó phải chạy được kể cả khi màn đích đã vẽ xong: cổng
 * này bắt BOOKMARK và THÔNG BÁO ĐẨY cũ, tức những lối vào không đi qua menu.
 *
 * `replace` chứ không `push`: màn vừa bị chặn không được nằm lại trong ngăn xếp, nếu không nút lui
 * đưa người dùng trở lại đúng chỗ vừa bị chặn và cổng bắn lần nữa.
 */
export function ShopAccountGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user } = useCurrentUser();

  const target = shopAccountRedirect(user, pathname);
  const targetPath = target == null ? null : JSON.stringify(target);

  /*
   * Chỉ chuyển hướng MỘT lần cho mỗi đích: `pathname` đổi trước khi màn cũ tháo, nên thiếu chốt
   * này thì effect chạy lại giữa chừng và bắn `replace` chồng lên chính lượt điều hướng đang chạy.
   */
  const lastTarget = useRef<string | null>(null);

  useEffect(() => {
    if (targetPath == null) {
      lastTarget.current = null;
      return;
    }
    if (lastTarget.current === targetPath) return;
    lastTarget.current = targetPath;
    router.replace(JSON.parse(targetPath) as Parameters<typeof router.replace>[0]);
  }, [router, targetPath]);

  return null;
}
