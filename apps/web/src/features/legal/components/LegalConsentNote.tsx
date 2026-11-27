'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { LEGAL_DOC, type LegalDoc } from '@/constants/legal';
import { LegalDocLink } from './LegalDocLink';
import styles from './LegalConsentNote.module.css';

/**
 * Những thời điểm người dùng thật sự cam kết một điều gì đó. `marketAuth` là câu của hộp tài khoản
 * site khách theo design v2 — cùng hai văn bản với `auth`, khác câu chữ.
 *
 * `bookingAgree` / `bookingAgreeHost` là câu NHÃN của ô tick "Tôi đã đọc và đồng ý…" ở màn Xem lại
 * yêu cầu thuê (Figma `19727:55409`); bản `Host` dùng khi xe bắt buộc đồng ý điều khoản riêng của
 * chủ xe — một ô tick phủ cả hai, không phải hai ô cạnh nhau. Chỉ HAI liên kết (người dùng chốt
 * 27/11/2026, như đa số sàn): Điều khoản sử dụng — điều 1 viện dẫn cả bộ, kể cả Điều kiện chung hợp
 * đồng thuê xe — và Chính sách huỷ, điều kiện tiền bạc khách phải thấy trước khi giao kết.
 * `bookingCheck*` là bản cũ app native còn dùng — app chỉ cấp handler cho bốn thẻ cũ.
 *
 * `packagePurchase` (mua gói, chỉ web) viện dẫn thêm Điều kiện gói dịch vụ gian hàng; `subscription`
 * là bản cũ app native còn đọc.
 */
export type LegalConsentPlace =
  | 'auth'
  | 'marketAuth'
  | 'booking'
  | 'bookingCheck'
  | 'bookingCheckHost'
  | 'bookingAgree'
  | 'bookingAgreeHost'
  | 'subscription'
  | 'packagePurchase'
  | 'shop'
  | 'shopCheck';

/**
 * Khoá message viết THÀNH CHỮ, không ghép từ `place` lúc chạy.
 *
 * Khoá ghép động thì TypeScript không tra được trong bó message, và `as never` để lách sẽ kéo
 * kiểu của tham số values về `undefined` — mất luôn phần kiểm tra thẻ rich-text, thứ đáng giá
 * nhất ở đây.
 */
const CONSENT_KEY = {
  auth: 'consent.auth',
  marketAuth: 'consent.marketAuth',
  booking: 'consent.booking',
  bookingCheck: 'consent.bookingCheck',
  bookingCheckHost: 'consent.bookingCheckHost',
  bookingAgree: 'consent.bookingAgree',
  bookingAgreeHost: 'consent.bookingAgreeHost',
  subscription: 'consent.subscription',
  packagePurchase: 'consent.packagePurchase',
  shop: 'consent.shop',
  shopCheck: 'consent.shopCheck',
} as const satisfies Record<LegalConsentPlace, string>;

/**
 * Câu "tiếp tục tức là bạn đồng ý với …" đặt ngay cạnh nút hành động.
 *
 * Đây là con đường vào văn bản pháp lý mà chân trang KHÔNG phủ được: người đang ở trong hộp
 * thoại đặt xe hay ở cổng quản lý không nhìn thấy chân trang marketplace, và đây mới là lúc họ
 * có lý do để đọc.
 *
 * Mặc định KHÔNG phải ô tick: một câu có liên kết thật, luôn hiện, nói đúng thứ đang ràng buộc —
 * "thông báo trước khi giao kết". Riêng màn Xem lại yêu cầu thuê của design v2 đặt lại ô tick
 * (ngược quyết định bỏ ô tick ngày 20/08): ở đó câu này là NHÃN của ô, dựng với `as="span"` vì
 * `<p>` không được nằm trong `<label>`.
 *
 * Liên kết mở HỘP XEM NHANH toàn văn (`LegalDocLink` → `LegalDocDialog`) thay vì rời trang: mọi chỗ
 * đặt câu này đều nằm giữa một luồng dở dang (biểu mẫu, hộp thoại). Ctrl/Cmd + bấm vẫn mở trang
 * `/legal/<doc>` ở tab mới.
 */
export function LegalConsentNote({
  place,
  className,
  as: Tag = 'p',
}: {
  place: LegalConsentPlace;
  className?: string;
  /** `span` khi câu là nhãn của một ô tick — đoạn văn không hợp lệ bên trong `<label>`. */
  as?: 'p' | 'span';
}) {
  const t = useTranslations('Legal');

  const link = (doc: LegalDoc) =>
    function LegalChunk(chunks: ReactNode) {
      return (
        <LegalDocLink doc={doc} className={styles.link}>
          {chunks}
        </LegalDocLink>
      );
    };

  /*
   * Cấp handler cho MỌI thẻ dù mỗi câu chỉ dùng vài thẻ: next-intl ném lỗi khi message có thẻ
   * thiếu handler, còn handler thừa thì vô hại. Nhờ vậy sửa câu chữ (đổi văn bản được viện dẫn)
   * không phải sửa kèm component — `legal.test.ts` giữ cho thẻ mới không lọt ra ngoài bộ này.
   */
  return (
    <Tag className={cx(styles.note, className)}>
      {t.rich(CONSENT_KEY[place], {
        terms: link(LEGAL_DOC.TERMS),
        privacy: link(LEGAL_DOC.PRIVACY),
        rules: link(LEGAL_DOC.MARKETPLACE_RULES),
        cancellation: link(LEGAL_DOC.CANCELLATION),
        contract: link(LEGAL_DOC.RENTAL_CONTRACT),
        payment: link(LEGAL_DOC.PAYMENT),
        subscription: link(LEGAL_DOC.SUBSCRIPTION),
      })}
    </Tag>
  );
}
