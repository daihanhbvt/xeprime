import { ContentWebScreen } from './ContentWebScreen';
import { CONTENT_PATH } from './content-navigation';

/**
 * "Giới thiệu XePrime" — đọc trong app bằng bộ đọc nội dung chung (`ContentWebScreen`).
 *
 * Vì sao có mặt ở app: trung tâm trợ giúp dẫn hai chủ đề ("Đặt xe diễn ra thế nào", "Tôi phải trả
 * những khoản nào") vào đúng hai NEO của trang này. Không có màn này thì hai thẻ đó hoặc biến
 * mất, hoặc ném người dùng ra trình duyệt hệ thống giữa chừng.
 */
export function AboutScreen({ anchor, onBack }: { anchor?: string; onBack: () => void }) {
  return (
    <ContentWebScreen path={CONTENT_PATH.ABOUT} onBack={onBack} {...(anchor ? { anchor } : {})} />
  );
}
