import { PartnerHandoffScreen } from '@/features/partner-handoff/PartnerHandoffScreen';

/**
 * "Đăng ký gian hàng thành công" — bước cuối của luồng tạo gian hàng tuyến GÓI trong app
 * Customer. API đã trả 2xx và `tenants.onboarding_state = package_pending` nằm ở SERVER,
 * nên đóng app ở đây không mất gì: XePrime Partner đăng nhập là khôi phục đúng bước.
 */
export default function PartnerSuccessRoute() {
  return <PartnerHandoffScreen success />;
}
