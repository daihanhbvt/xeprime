'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SHOP_LOGO_TRIGGER_ID } from '@/constants/routes';
import { useWorkspace } from '@/hooks/use-workspace';

/**
 * DẢI CHÀO MỪNG sau lần thanh toán gói đầu tiên — `/manage/shop?welcome=1` (ADR 0040).
 *
 * ## Vì sao là một dải, không phải một stepper
 *
 * Người dùng vừa đi qua hai bước và vừa chuyển tiền. Dựng thêm một checklist "5/9 mục" hay một
 * `Steps` bốn chặng ở đây là nói với họ rằng họ vẫn đang ở trong một quy trình — trong khi họ đã
 * vào Manage, gói đã chạy, và việc còn lại là ĐÚNG MỘT thứ.
 *
 * Trong luồng dữ liệu bình thường, bước 1 của onboarding đã đòi đủ tên · SĐT · tỉnh · xã · địa
 * chỉ, nên mục duy nhất còn thiếu ngay sau khi thanh toán là LOGO. Đó là lý do dải này chỉ nói
 * về logo, và im lặng khi logo đã có.
 *
 * ## Ba hình dạng
 *
 * | Trạng thái | Dải nói gì |
 * | --- | --- |
 * | thiếu logo | "Còn 1 bước để đăng xe" + CTA cuộn/đặt tiêu điểm vào ô logo |
 * | đủ logo, chưa có xe | "Sẵn sàng rồi" + CTA "Đăng xe đầu tiên" |
 * | đủ logo, đã có xe | KHÔNG dựng gì |
 *
 * Hình dạng thứ ba quan trọng nhất: một dải "mọi thứ đều ổn" đứng thường trực trên đầu trang chỉ
 * dạy người dùng bỏ qua vùng ấy, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
 *
 * ## Không phải một cổng quyền
 *
 * Dải này là TRANG TRÍ đúng nghĩa: `?welcome=1` không mở hay khoá gì cả, và cổng logo thật nằm ở
 * `VehiclesService.submitForPublicReview` (ADR 0040). Xoá tham số khỏi URL chỉ làm mất dòng chào,
 * không làm xe đi qua được cổng.
 */
export function ShopWelcomeBanner({
  missingLogo,
  hasVehicle,
}: {
  missingLogo: boolean;
  /** Đã có xe nào chưa — quyết định dải có mời "Đăng xe đầu tiên" hay im lặng. */
  hasVehicle: boolean;
}) {
  const t = useTranslations('Shop.welcome');
  const { paths } = useWorkspace();

  if (missingLogo) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('logo.title')}
        description={t('logo.body')}
        action={
          <Button type="primary" onClick={focusLogoUpload}>
            {t('logo.cta')}
          </Button>
        }
      />
    );
  }

  // Hồ sơ đủ và đã có xe: không còn gì để nói. Xem docblock, "hình dạng thứ ba".
  if (hasVehicle) return null;

  return (
    <Alert
      type="success"
      showIcon
      title={t('ready.title')}
      description={t('ready.body')}
      action={
        <Link href={paths.vehicleNew}>
          <Button type="primary">{t('ready.cta')}</Button>
        </Link>
      }
    />
  );
}

/**
 * Cuộn tới ô logo VÀ đặt tiêu điểm vào chính nút mở hộp chọn file.
 *
 * Tiêu điểm là nửa thường bị quên: cuộn không thôi thì người dùng bàn phím vẫn đứng ở dải thông
 * báo, và phím Tab tiếp theo đưa họ sang một nút khác hẳn. Sau lời gọi này, `Enter` mở ngay hộp
 * chọn file — tức CTA làm trọn việc nó hứa.
 *
 * `preventScroll` cho `focus()`: `scrollIntoView` ở trên đã cuộn mượt, và để trình duyệt cuộn
 * lần thứ hai (tức thời) sẽ giật ngược giữa animation.
 *
 * Không có phần tử đó (section chưa dựng vì thiếu quyền `tenant.update`) thì không làm gì —
 * nhưng khi ấy dải này cũng không được dựng, vì nơi gọi chỉ dựng nó cho người sửa được hồ sơ.
 */
function focusLogoUpload(): void {
  const el = document.getElementById(SHOP_LOGO_TRIGGER_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}
