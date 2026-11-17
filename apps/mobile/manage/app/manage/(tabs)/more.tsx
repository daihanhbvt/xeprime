import { ManageAccountMenuScreen } from '@/features/shell/ManageAccountMenuScreen';

/**
 * `/manage/more` — "Tài khoản của tôi", đích của ô Tài khoản trên thanh menu dưới đáy (Figma
 * Partner-XePrime `Full Menu MB`). Giữ nguyên URL cũ của ngăn "Thêm" để deep link không gãy.
 */
export default function ManageMoreRoute() {
  return <ManageAccountMenuScreen />;
}
