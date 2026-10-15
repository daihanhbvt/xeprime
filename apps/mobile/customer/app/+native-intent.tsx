import { gatewayReturnRedirect } from '@/features/payment-gateway/return-link';

/**
 * Đổi hướng deep link TRƯỚC khi router dựng màn — áp cho cả lúc app đang chạy lẫn lúc khởi động
 * nguội (Android giết tiến trình khi khách ở app ví). Hiện chỉ một luật: quay về từ cổng MoMo/VNPAY
 * thì vào màn thanh toán của chuyến thay vì trang chuyến.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return gatewayReturnRedirect(path) ?? path;
}
