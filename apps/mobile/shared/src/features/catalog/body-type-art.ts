import type { ImageSourcePropType } from 'react-native';
import cuv from '../../../assets/body-types/cuv.png';
import mini from '../../../assets/body-types/mini.png';
import mpv from '../../../assets/body-types/mpv.png';
import pickup from '../../../assets/body-types/pickup.png';
import sedan from '../../../assets/body-types/sedan.png';
import suv from '../../../assets/body-types/suv.png';
import van from '../../../assets/body-types/van.png';

/**
 * Ảnh kiểu dáng xe — bản sao của `apps/web/public/body-types/*.png`, đúng những hình chủ xe
 * thấy lúc chọn kiểu dáng, nên khách lọc bằng cùng một ngôn ngữ hình ảnh.
 *
 * Phải là bảng tra TĨNH: API trả `iconUrl` dạng đường dẫn gốc web (`/body-types/suv.png`) mà
 * điện thoại không có host để tải, còn Metro thì chỉ gói được ảnh nào được import tường minh.
 * Khoá ở đây là `key` của danh mục chứ không phải tên file — API đổi đường dẫn không ảnh hưởng.
 *
 * Kiểu dáng lạ (admin thêm mới) không có trong bảng: `CatalogCardPicker` vẽ glyph ô tô trung
 * tính, KHÔNG mượn hình của mục khác — cùng cách web xử lý khi thiếu `iconUrl`.
 */
export const BODY_TYPE_ART: Readonly<Record<string, ImageSourcePropType>> = {
  mini,
  sedan,
  cuv,
  suv,
  mpv,
  pickup,
  van,
};
