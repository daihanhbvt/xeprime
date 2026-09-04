import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { LEGAL_DOC, legalPath, type LegalDoc } from '@/constants/legal';
import styles from './LegalConsentNote.module.css';

/** Bốn thời điểm người dùng thật sự cam kết một điều gì đó. */
export type LegalConsentPlace = 'auth' | 'booking' | 'subscription' | 'shop';

/**
 * Khoá message viết THÀNH CHỮ, không ghép từ `place` lúc chạy.
 *
 * Khoá ghép động thì TypeScript không tra được trong bó message, và `as never` để lách sẽ kéo
 * kiểu của tham số values về `undefined` — mất luôn phần kiểm tra thẻ rich-text, thứ đáng giá
 * nhất ở đây.
 */
const CONSENT_KEY = {
  auth: 'consent.auth',
  booking: 'consent.booking',
  subscription: 'consent.subscription',
  shop: 'consent.shop',
} as const satisfies Record<LegalConsentPlace, string>;

/**
 * Câu "tiếp tục tức là bạn đồng ý với …" đặt ngay cạnh nút hành động.
 *
 * Đây là con đường vào văn bản pháp lý mà chân trang KHÔNG phủ được: người đang ở trong hộp
 * thoại đặt xe hay ở cổng quản lý không nhìn thấy chân trang marketplace, và đây mới là lúc họ
 * có lý do để đọc.
 *
 * Cố ý KHÔNG phải ô tick: luồng đặt xe đã bỏ ô tick ngày 20/08 vì nó chặn nút gửi bằng một thao
 * tác không ai đọc. Một câu có liên kết thật, luôn hiện, nói đúng thứ đang ràng buộc thì trung
 * thực hơn — và vẫn là "thông báo trước khi giao kết".
 *
 * Liên kết luôn mở TAB MỚI: cả bốn chỗ đều nằm giữa một luồng dở dang (biểu mẫu, hộp thoại),
 * rời trang là mất những gì đã nhập.
 */
export function LegalConsentNote({
  place,
  className,
}: {
  place: LegalConsentPlace;
  className?: string;
}) {
  const t = useTranslations('Legal');

  const link = (doc: LegalDoc) =>
    function LegalChunk(chunks: ReactNode) {
      return (
        <Link href={legalPath.doc(doc)} className={styles.link} target="_blank" rel="noreferrer">
          {chunks}
        </Link>
      );
    };

  /*
   * Cấp handler cho CẢ BỐN thẻ dù mỗi câu chỉ dùng hai: next-intl ném lỗi khi message có thẻ
   * thiếu handler, còn handler thừa thì vô hại. Nhờ vậy sửa câu chữ (đổi văn bản được viện dẫn)
   * không phải sửa kèm component — `legal.test.ts` giữ cho thẻ mới không lọt ra ngoài bộ này.
   */
  return (
    <p className={cx(styles.note, className)}>
      {t.rich(CONSENT_KEY[place], {
        terms: link(LEGAL_DOC.TERMS),
        privacy: link(LEGAL_DOC.PRIVACY),
        rules: link(LEGAL_DOC.MARKETPLACE_RULES),
        cancellation: link(LEGAL_DOC.CANCELLATION),
      })}
    </p>
  );
}
