import { useTranslations } from 'use-intl';
import { ScreenMessage } from './ScreenMessage';

/**
 * Trạng thái "lọc / tìm mà không ra gì" DÙNG CHUNG mọi màn danh sách của app (người dùng chốt
 * 20/11/2026): chỉ hình "no-results" + MỘT câu "Không tìm thấy kết quả", không mô tả, không nút
 * "Xoá bộ lọc" (gỡ lọc ngay trên thanh lọc/ô tìm), và đứng GẦN ĐẦU vùng nội dung thay vì giữa màn.
 *
 * Câu đọc từ `Common.statePages.noResults.title` - cùng bộ chữ trạng thái với web `StatePage`.
 */
export function NoResults() {
  const t = useTranslations('Common.statePages.noResults');
  return <ScreenMessage kind="no-results" title={t('title')} placement="top" />;
}
