import * as yup from 'yup';
import { VN_PHONE_PATTERN } from '@xeprime/types';

/** Câu lỗi cho schema số điện thoại — xem chú thích ở `buildPhoneSchema`. */
export interface PhoneSchemaLabels {
  invalid: string;
  required: string;
}

/**
 * Câu lỗi mặc định — TIẾNG VIỆT, cho `apps/web` (lớp validate của web chưa i18n hoá).
 *
 * App native truyền câu đã dịch vào thay vì dùng bộ này.
 */
const VI: PhoneSchemaLabels = {
  invalid: 'Số điện thoại không hợp lệ',
  required: 'Vui lòng nhập số điện thoại',
};

/**
 * SĐT Việt Nam: `0xxxxxxxxx` hoặc `+84xxxxxxxxx`.
 *
 * LUẬT ở đây, CHỮ đi vào từ ngoài. Client nào cũng phải nhận cùng một tập số hợp lệ — đó là hợp
 * đồng với backend — nhưng câu báo lỗi thì phải đổi theo ngôn ngữ người dùng đang đọc, mà một
 * chuỗi nằm cứng trong package thì cố định từ lúc nạp bundle.
 */
export const buildPhoneSchema = (labels: PhoneSchemaLabels) =>
  yup.string().trim().matches(VN_PHONE_PATTERN, labels.invalid);

/**
 * Bắt buộc: `required` đứng TRƯỚC phép so mẫu. Yup dừng ở phép kiểm đầu tiên hỏng theo thứ tự khai
 * báo, và chuỗi rỗng cũng trượt mẫu — để `matches` đứng trước thì ô bỏ trống báo "không hợp lệ"
 * thay vì "vui lòng nhập". Tập số hợp lệ không đổi.
 */
export const buildRequiredPhoneSchema = (labels: PhoneSchemaLabels) =>
  yup.string().trim().required(labels.required).matches(VN_PHONE_PATTERN, labels.invalid);

export const phoneSchema = buildPhoneSchema(VI);

export const requiredPhoneSchema = buildRequiredPhoneSchema(VI);
