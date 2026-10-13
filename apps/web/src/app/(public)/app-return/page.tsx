import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PAYMENT_RETURN_PARAM } from '@xeprime/types';
import { NativeTripReturn } from '@/features/payment-gateway/components/NativeTripReturn';

/**
 * Trang quay về CÔNG KHAI sau khi trả tiền giữ chỗ qua MoMo/VNPAY từ app XePrime (ADR 0058).
 *
 * Cổng chỉ nhận `returnUrl` http(s), còn trình duyệt mà app mở (Custom Tab /
 * ASWebAuthenticationSession) không có cookie phiên — trang chuyến cần đăng nhập sẽ kẹt ở
 * "Phiên hết hạn". Trang này KHÔNG gọi API, không cần đăng nhập: chỉ chuyển sang deep link
 * `xeprime://trips/<id>` để trình duyệt tự đóng; app tự hỏi server kết quả của lượt.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('PaymentGateway.appReturn');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function AppReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params[PAYMENT_RETURN_PARAM.NATIVE_TRIP];
  return <NativeTripReturn tripId={typeof raw === 'string' ? raw : null} />;
}
