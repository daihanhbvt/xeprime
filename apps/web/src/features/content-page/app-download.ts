/**
 * Địa chỉ công khai của sàn — dùng để mã hoá vào QR tải ứng dụng.
 *
 * CỐ Ý là hằng chứ không phải biến env: đây là địa chỉ TIẾP THỊ in lên một mã người ta quét
 * bằng điện thoại, không phải endpoint theo môi trường. Mã quét từ bản staging vẫn phải dẫn
 * người dùng tới sàn thật; trỏ nó về `stg.xeprime.vn` là phát một mã chết ra ngoài.
 */
const MARKETING_SITE_URL = 'https://xeprime.vn';

/**
 * Hai mã QR tải ứng dụng — dùng ở chân trang VÀ ở trang `/app`, qua `AppStoreQr`.
 *
 * **Đây là mã TẠM.** Ứng dụng chưa lên store, nên chưa có link store để mã hoá — hai mã cùng
 * trỏ về trang chủ, khác nhau ở tham số `app` để phân biệt nguồn quét (và để hai hình không
 * giống hệt nhau). Trang chủ lơ đi tham số lạ nên người quét vẫn tới đúng nơi, không gặp 404.
 *
 * Khi app phát hành: thay `value` bằng link store thật, rồi gỡ `AppPromo.hero.status` và
 * `AppPromo.download.body` ở bó message. KHÔNG thêm một cơ chế thứ hai — hai dòng dưới đây là
 * toàn bộ chỗ cần sửa.
 *
 * Chân trang KHÔNG còn nhãn trạng thái nào (yêu cầu 23/09/2026): câu "đang phát triển" và viên
 * "Sắp ra mắt" đã gỡ khỏi `Marketplace.footer.apps`. Chỗ nói ra trạng thái app giờ là trang
 * `/app`, nơi có đủ chỗ để nói cho tử tế.
 *
 * Sống ở `content-page` chứ không phải `marketplace`: nó phục vụ trang `/app` và chân trang,
 * không phục vụ chợ xe. Để nó ở `marketplace/constants.ts` là bắt một component của khu nội
 * dung phải import ngược sang khu chợ cho một hằng chẳng liên quan gì tới chợ.
 *
 * Tên cửa hàng là DANH TỪ RIÊNG, không dịch và không cần khoá message — cùng lý do với danh
 * sách mạng xã hội trong chân trang.
 */
export const APP_DOWNLOAD_QR: ReadonlyArray<{
  key: 'ios' | 'android';
  store: string;
  value: string;
}> = [
  { key: 'ios', store: 'App Store', value: `${MARKETING_SITE_URL}/?app=ios` },
  { key: 'android', store: 'Google Play', value: `${MARKETING_SITE_URL}/?app=android` },
];
