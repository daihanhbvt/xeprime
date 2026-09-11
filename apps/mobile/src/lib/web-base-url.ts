import { devServerHost } from './dev-server';
import { logger } from './logger';

/** Cổng của `apps/web` lúc chạy dev (`next dev`) — cùng số với `NEXT_PUBLIC_APP_URL` mặc định. */
const DEFAULT_WEB_PORT = 3000;

/**
 * Địa chỉ gốc của bản WEB, để app mở những trang mà chỉ web mới có.
 *
 * Hiện có đúng một khách hàng: WebView đọc bốn văn bản pháp lý (`/legal/<slug>`). Chúng KHÔNG
 * được dựng lại bằng màn native dù nội dung đã nằm sẵn trong bó message — văn bản pháp lý phải
 * sửa được mà không chờ một bản app mới qua vòng duyệt của store, và web là nơi duy nhất làm
 * được điều đó (ADR 0028 điều 9: sàn phải công khai quy chế đang có hiệu lực).
 *
 * Cùng cách suy với `resolveApiBaseUrl`: có `EXPO_PUBLIC_WEB_URL` thì dùng, không thì lấy chính
 * máy đang chạy Metro ở cổng 3000. Nhờ vậy dev không phải khai thêm biến nào, còn bản build thật
 * thì trỏ tới tên miền công khai.
 *
 * KHÔNG nhận đường dẫn tương đối như `resolveApiBaseUrl` — không có proxy Metro cho web, và một
 * giá trị tương đối ở đây sẽ lặng lẽ tạo ra URL không mở được.
 */
export function resolveWebBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/+$/, '');
  if (configured && /^https?:\/\//i.test(configured)) return configured;

  /*
   * Lùi về máy dev là một CẤU HÌNH THIẾU, không phải một chế độ bình thường — và nó hỏng ở nơi
   * khó đoán nhất: WebView chỉ báo "không mở được trang", không nói nó đã thử mở cái gì.
   *
   * Bẫy hay gặp nhất: `EXPO_PUBLIC_*` được NHÚNG CỨNG lúc bundle, nên vừa thêm biến vào `.env`
   * mà Metro đang chạy thì bundle cũ vẫn không có nó. Phải khởi động lại Metro (`--clear` nếu
   * cache transform còn giữ giá trị cũ).
   */
  const fallback = `http://${devServerHost()}:${DEFAULT_WEB_PORT}`;
  logger.warn(
    `EXPO_PUBLIC_WEB_URL chưa có trong bundle — lùi về ${fallback}. Khai nó trong apps/mobile/.env rồi KHỞI ĐỘNG LẠI Metro (biến EXPO_PUBLIC_* nhúng lúc bundle, không đọc lúc chạy).`,
    { configured: configured ?? null },
  );
  return fallback;
}
