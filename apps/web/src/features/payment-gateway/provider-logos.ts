import { PAYMENT_GATEWAY_PROVIDER, type AppLocale, type PaymentGatewayProvider } from '@xeprime/types';

/** Một file logo trong `public/payment-methods/` và kích thước THẬT của nó (giữ tỉ lệ, không méo). */
export interface ProviderLogo {
  src: string;
  width: number;
  height: number;
}

/**
 * Logo CHÍNH THỨC của từng cổng — file gốc của nhà cung cấp, không vẽ lại, không đổi màu, không cắt.
 *
 * Nguồn (tải 13/10/2026):
 *  - **MoMo** — "Primary logo on app icon" ở trang Brand Usage của MoMo
 *    (`developers.momo.vn/v3/docs/payment/branding/brand-usage-agreement/`, gói
 *    `MoMo_Logo_Primary.zip`). Hướng dẫn của MoMo: màn chọn phương thức thanh toán dùng ĐÚNG bản này
 *    (biểu tượng nền hồng), không nhỏ hơn 30px chiều cao, không kéo méo / đổ bóng / đổi màu. MoMo xét
 *    cách dùng logo trước khi duyệt go-live. Bản gốc 800×800 được thu về 144×144 (đủ nét ở 48px @3x).
 *  - **VNPAY** — logo "Cổng thanh toán VNPAY QR" mà CHÍNH trang cổng `pay.vnpay.vn` đặt trên đầu trang
 *    (`/images/brands/logo.svg`, bản tiếng Anh `logo-en.svg`). Khách bấm chọn VNPAY ở đây rồi thấy
 *    đúng logo đó ở trang tiếp theo — hai màn nói cùng một thương hiệu. VNPAY không có trang bộ nhận
 *    diện công khai; đổi logo thì lấy lại từ đúng đường dẫn đó.
 *
 * MoMo đã có logo dù cổng chưa cấu hình: kênh chỉ HIỆN khi server báo đang mở, nên khi khoá MoMo được
 * khai, thẻ chọn ví có logo ngay mà không phải sửa giao diện.
 */
const LOGOS: Readonly<Record<PaymentGatewayProvider, Readonly<Record<AppLocale, ProviderLogo>>>> = {
  [PAYMENT_GATEWAY_PROVIDER.MOMO]: {
    vi: { src: '/payment-methods/momo.png', width: 144, height: 144 },
    en: { src: '/payment-methods/momo.png', width: 144, height: 144 },
  },
  [PAYMENT_GATEWAY_PROVIDER.VNPAY]: {
    vi: { src: '/payment-methods/vnpay-vi.svg', width: 116, height: 32 },
    en: { src: '/payment-methods/vnpay-en.svg', width: 116, height: 32 },
  },
};

/** Logo của một cổng theo ngôn ngữ giao diện — `null` với mã cổng lạ (dữ liệu mới hơn bản web). */
export function paymentProviderLogo(provider: string, locale: AppLocale): ProviderLogo | null {
  return LOGOS[provider as PaymentGatewayProvider]?.[locale] ?? null;
}
