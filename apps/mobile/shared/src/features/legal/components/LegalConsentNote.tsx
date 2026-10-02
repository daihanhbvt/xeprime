import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { colors, fontSize } from '@/theme/tokens';
import { useLegalLinkChunks } from '../use-legal-link-chunks';

/** Bốn thời điểm người dùng thật sự cam kết một điều gì đó — cùng bộ với web. */
export type LegalConsentPlace = 'auth' | 'booking' | 'subscription' | 'shop';

/**
 * Khoá message viết THÀNH CHỮ, không ghép từ `place` lúc chạy.
 *
 * Khoá ghép động thì TypeScript không tra được trong bó message, và `as never` để lách sẽ kéo
 * kiểu của tham số values về `undefined` — mất luôn phần kiểm tra thẻ rich-text, thứ đáng giá
 * nhất ở đây. (Cùng lý do và cùng bảng với `LegalConsentNote` bên web.)
 */
const CONSENT_KEY = {
  auth: 'consent.auth',
  booking: 'consent.booking',
  subscription: 'consent.subscription',
  shop: 'consent.shop',
} as const satisfies Record<LegalConsentPlace, string>;

/**
 * Câu "tiếp tục tức là bạn đồng ý với …" đặt ngay cạnh nút hành động — bản native của
 * `LegalConsentNote` bên web, cùng câu chữ, cùng chỗ đặt.
 *
 * App KHÔNG có chân trang marketplace, nên nếu thiếu dòng này thì các đường vào tài khoản không
 * hề dẫn tới điều khoản nào.
 *
 * KHÔNG phải ô tick, y như web: một câu có liên kết thật, luôn hiện, nói đúng thứ đang ràng buộc
 * thì trung thực hơn một ô tick chặn nút gửi mà không ai đọc. **Ngoại lệ duy nhất là màn ĐĂNG
 * KÝ** — nơi người dùng giao kết lần đầu và chợ ứng dụng đòi hành vi đồng ý tường minh; ở đó
 * dùng `LegalConsentCheckbox`.
 *
 * Liên kết mở một màn WEBVIEW TRONG app (`useLegalLinkChunks`): các chỗ đặt câu này đều nằm giữa
 * một biểu mẫu dở dang, nên đẩy người dùng ra trình duyệt hệ thống là mất những gì đã nhập.
 */
export function LegalConsentNote({ place }: { place: LegalConsentPlace }) {
  const t = useTranslations('Legal');
  const chunks = useLegalLinkChunks();

  return (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {t.rich(CONSENT_KEY[place], chunks)}
    </Text>
  );
}
