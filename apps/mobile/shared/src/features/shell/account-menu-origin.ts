import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * Đánh dấu một màn được MỞ TỪ "Tài khoản của tôi" (`/manage/more`) để thanh trên của nó có nút lui
 * về đó (người dùng chốt 19/11/2026: các mục trong Tài khoản mở ra như một trang con, có đường về).
 *
 * Các mục đó (Hồ sơ chủ xe, Tài khoản & bảo mật, Cẩm nang, Hợp đồng, Bảo vệ dữ liệu, Hỗ trợ…) là
 * màn của bộ TAB khu quản lý, nên không có ngăn xếp để "lui" theo nghĩa stack - dấu này đi trên URL
 * (`?from=account`), sống qua F5 / deep link, và màn mở từ chỗ khác (thanh menu, thông báo) không mang
 * nó nên giữ nguyên thanh trên có logo như cũ.
 */
export const ACCOUNT_MENU_ORIGIN_PARAM = 'from';
export const ACCOUNT_MENU_ORIGIN = 'account';

/** Gắn dấu "mở từ Tài khoản" vào một đích; đích dạng object thì thêm vào `params`. */
export function fromAccountMenu(href: Href): Href {
  if (typeof href === 'string') {
    const join = href.includes('?') ? '&' : '?';
    return `${href}${join}${ACCOUNT_MENU_ORIGIN_PARAM}=${ACCOUNT_MENU_ORIGIN}` as Href;
  }
  return {
    ...href,
    params: { ...(href.params ?? {}), [ACCOUNT_MENU_ORIGIN_PARAM]: ACCOUNT_MENU_ORIGIN },
  } as Href;
}

/**
 * Màn này có đang mở từ "Tài khoản của tôi" không, và lối LUI về đó. Khi có, nút Back cứng Android
 * cũng về "Tài khoản của tôi" (bộ tab tự lui thì về tab đầu - Tổng quan). Thanh trên của màn đổi
 * sang dáng TRANG CHI TIẾT (← + tên trang), ẩn thanh chung - xem `ManageHeader`.
 */
export function useAccountMenuBack(): { fromAccount: boolean; back: () => void } {
  const router = useRouter();
  const params = useLocalSearchParams<{ [ACCOUNT_MENU_ORIGIN_PARAM]?: string }>();
  const fromAccount = params[ACCOUNT_MENU_ORIGIN_PARAM] === ACCOUNT_MENU_ORIGIN;
  const back = useCallback(() => router.navigate(ROUTES.manage.more()), [router]);
  useFocusEffect(
    useCallback(() => {
      if (!fromAccount) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [fromAccount, back]),
  );
  return { fromAccount, back };
}
