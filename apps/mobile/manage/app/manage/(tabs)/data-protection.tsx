import { DataProtectionScreen } from '@/features/account/DataProtectionScreen';

/** Chính sách bảo vệ dữ liệu — bản tóm tắt chỉ-đọc, dẫn tới văn bản thật ở `/legal/privacy`. */
export default function ManageOwnerLiteDataProtectionRoute() {
  return <DataProtectionScreen shell="manage" />;
}
