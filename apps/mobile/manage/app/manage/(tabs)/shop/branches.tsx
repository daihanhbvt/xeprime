import { Redirect } from 'expo-router';

import { ROUTES, SHOP_SECTION } from '@/navigation/routes';

/**
 * ALIAS CHUYỂN TIẾP - y như web `/manage/shop/branches` (02/11/2026): "Chi nhánh" là một thẻ của
 * "Thông tin cửa hàng" (`ShopBranchesCard`), không còn màn riêng ở site partner. Liên kết sâu / thông
 * báo cũ trỏ vào đây vẫn tới đúng chỗ.
 */
export default function ManageShopBranchesRoute() {
  return <Redirect href={ROUTES.manage.shop({ section: SHOP_SECTION.BRANCHES })} />;
}
