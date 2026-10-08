import { SupportCenterScreen } from '@/features/support/SupportCenterScreen';

/**
 * Trung tâm hỗ trợ dạng TRANG CON — đích của dải "gian hàng bị khoá/hết hạn", có nút lui về đúng
 * màn vừa bấm. Mục menu vẫn là `/manage/support` (tab).
 */
export default function ManageHelpPageRoute() {
  return <SupportCenterScreen shell="stacked" />;
}
