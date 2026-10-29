import type { ImageSourcePropType } from 'react-native';
import { PAYMENT_GATEWAY_PROVIDER, type AppLocale, type PaymentGatewayProvider } from '@xeprime/types';
import momo from '../../../assets/payment-methods/momo.png';
import vnpayEn from '../../../assets/payment-methods/vnpay-en.png';
import vnpayVi from '../../../assets/payment-methods/vnpay-vi.png';
import vnpayMark from '../../../assets/payment-methods/vnpay-mark.png';

/**
 * Logo CHÍNH THỨC của từng ví — bản native của `provider-logos.ts` (web). Ảnh gói sẵn từ
 * `apps/web/public/payment-methods/` bằng `scripts/sync-payment-logos.mjs` (SVG → PNG @1x/2x/3x).
 *
 * `width`/`height` là TỈ LỆ file gốc — nơi vẽ chỉ đặt chiều cao, bề ngang theo tỉ lệ; kéo méo logo
 * là vi phạm hướng dẫn thương hiệu. Bảng TĨNH vì Metro chỉ gói ảnh được import tường minh.
 */
export interface ProviderLogo {
  source: ImageSourcePropType;
  width: number;
  height: number;
}

const LOGOS: Readonly<Record<PaymentGatewayProvider, Readonly<Record<AppLocale, ProviderLogo>>>> = {
  [PAYMENT_GATEWAY_PROVIDER.MOMO]: {
    vi: { source: momo, width: 144, height: 144 },
    en: { source: momo, width: 144, height: 144 },
  },
  [PAYMENT_GATEWAY_PROVIDER.VNPAY]: {
    vi: { source: vnpayVi, width: 116, height: 32 },
    en: { source: vnpayEn, width: 116, height: 32 },
  },
};

export function paymentProviderLogo(provider: string, locale: AppLocale): ProviderLogo | null {
  return LOGOS[provider as PaymentGatewayProvider]?.[locale] ?? null;
}

/**
 * BIỂU TƯỢNG vuông của từng cổng — bản native của `paymentProviderMark` web (#207), cho ô chọn ví
 * của màn thanh toán tiền giữ chỗ (Figma `19759:37876` · `19759:37935`). Logo chữ dài thu vào ô
 * vuông chỉ còn một dải mỏng. VNPAY: `apps/web/public/payment-methods/vnpay-mark.png` (168×131).
 */
const MARKS: Readonly<Record<PaymentGatewayProvider, ProviderLogo>> = {
  [PAYMENT_GATEWAY_PROVIDER.MOMO]: { source: momo, width: 144, height: 144 },
  [PAYMENT_GATEWAY_PROVIDER.VNPAY]: { source: vnpayMark, width: 168, height: 131 },
};

/** Biểu tượng vuông của một cổng — `null` với mã cổng lạ. */
export function paymentProviderMark(provider: string): ProviderLogo | null {
  return MARKS[provider as PaymentGatewayProvider] ?? null;
}
