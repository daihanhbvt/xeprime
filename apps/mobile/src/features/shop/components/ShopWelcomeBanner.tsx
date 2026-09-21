import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';

/**
 * DẢI CHÀO MỪNG sau lần thanh toán gói đầu tiên (ADR 0040).
 *
 * ## Vì sao là một dải, không phải một stepper
 *
 * Người dùng vừa đi qua hai bước và vừa chuyển tiền. Dựng thêm một checklist "5/9 mục" hay một
 * chuỗi bốn chặng ở đây là nói với họ rằng họ vẫn đang ở trong một quy trình — trong khi họ đã vào
 * khu quản lý, gói đã chạy, và việc còn lại là ĐÚNG MỘT thứ.
 *
 * Trong luồng dữ liệu bình thường, bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa chỉ,
 * nên mục duy nhất còn thiếu ngay sau khi thanh toán là LOGO. Đó là lý do dải này chỉ nói về logo,
 * và im lặng khi logo đã có.
 *
 * ## Ba hình dạng
 *
 * | Trạng thái | Dải nói gì |
 * | --- | --- |
 * | thiếu logo | "Còn 1 bước để đăng xe" + CTA mở ngay tấm chọn ảnh logo |
 * | đủ logo, chưa có xe | "Sẵn sàng rồi" + CTA "Đăng xe đầu tiên" |
 * | đủ logo, đã có xe | KHÔNG dựng gì |
 *
 * Hình dạng thứ ba quan trọng nhất: một dải "mọi thứ đều ổn" đứng thường trực trên đầu màn chỉ dạy
 * người dùng bỏ qua vùng ấy, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
 *
 * ## Không phải một cổng quyền
 *
 * Dải này là TRANG TRÍ đúng nghĩa: tham số `welcome` không mở hay khoá gì cả, và cổng logo thật nằm
 * ở `VehiclesService.submitForPublicReview` (ADR 0040). Bỏ tham số đi chỉ làm mất dòng chào, không
 * làm xe đi qua được cổng.
 */
export function ShopWelcomeBanner({
  missingLogo,
  hasVehicle,
  onPickLogo,
}: {
  missingLogo: boolean;
  /** Đã có xe nào chưa — quyết định dải có mời "Đăng xe đầu tiên" hay im lặng. */
  hasVehicle: boolean;
  /**
   * Mở tấm chọn ảnh logo.
   *
   * Web cuộn tới ô logo rồi đặt tiêu điểm vào nút mở hộp chọn file; ở đây CTA mở thẳng tấm chọn —
   * cùng lời hứa, ít thao tác hơn một bước. Nơi gọi lấy hàm này từ `ShopIdentityCard`, khối sở hữu
   * tấm chọn đó.
   */
  onPickLogo: () => void;
}) {
  const t = useTranslations('Shop.welcome');
  const navigateOnce = useNavigateOnce();

  if (missingLogo) {
    return (
      <Callout tone="warning" title={t('logo.title')}>
        <CalloutBody>{t('logo.body')}</CalloutBody>
        <Button label={t('logo.cta')} size="sm" block={false} onPress={onPickLogo} />
      </Callout>
    );
  }

  // Hồ sơ đủ và đã có xe: không còn gì để nói. Xem docblock, "hình dạng thứ ba".
  if (hasVehicle) return null;

  return (
    <Callout tone="success" title={t('ready.title')}>
      <CalloutBody>{t('ready.body')}</CalloutBody>
      <Button
        label={t('ready.cta')}
        size="sm"
        block={false}
        onPress={() =>
          navigateOnce(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT))
        }
      />
    </Callout>
  );
}
