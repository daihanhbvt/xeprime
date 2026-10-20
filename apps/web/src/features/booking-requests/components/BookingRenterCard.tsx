'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Form } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { isSameVnPhone } from '@xeprime/types';
import { TextField } from '@/components/form/TextField';
import type { CurrentUser } from '@/hooks/use-current-user';
import { cx } from '@/lib/cx';
import type { RequestFormValues } from '../schema';
import styles from './BookingReviewStep.module.css';

/** Liên hệ đã ghi trên một yêu cầu — thứ thẻ hiện lại ở chế độ chỉ đọc. */
export interface BookingRenterContact {
  name: string;
  phone: string | null;
}

interface BookingRenterCardProps {
  /**
   * Tài khoản đang đăng nhập — để biết SĐT đang hiện có phải số ĐÃ XÁC MINH của tài khoản không
   * (huy hiệu "Đã xác thực"), và email đã xác minh mà chủ xe nhận.
   */
  renter: CurrentUser | null;
  /**
   * Màn Xem lại: hai ô họ tên + SĐT liên hệ của chuyến (ADR 0063), mặc định là của tài khoản.
   * Không truyền ⇒ thẻ chỉ đọc `contact`.
   */
  control?: Control<RequestFormValues>;
  /** Chế độ chỉ đọc: liên hệ đã ghi trên yêu cầu. Thiếu (dữ liệu cũ) ⇒ hiện của tài khoản. */
  contact?: BookingRenterContact | null;
  /** Lời nhắn cho chủ xe — ô nhập ở màn Xem lại, giá trị chỉ-đọc ở chuyến đã gửi. */
  children?: ReactNode;
  /**
   * Bậc tiêu đề của thẻ — `h3` trong hộp đặt xe (dưới tiêu đề `h2` của bước), `h2` khi thẻ đứng
   * ngay dưới `h1` của một trang (chuyến chờ chủ xe phản hồi): không nhảy bậc dàn ý.
   */
  headingLevel?: 2 | 3;
}

/**
 * Thẻ "Thông tin người thuê" — Figma `19727:56002` (màn Xem lại) và `19727:60745` (chuyến chờ chủ xe
 * phản hồi). Hai màn kể cùng một người thuê, nên là MỘT thẻ, hai chế độ:
 *
 * - **Có `control`** (màn Xem lại): hai ô nhập như thiết kế, mặc định là họ tên + SĐT của TÀI KHOẢN.
 *   Khách đổi được — thuê hộ người nhà, hay muốn chủ xe gọi số khác — và số khác KHÔNG cần OTP
 *   (ADR 0063). Số trùng số tài khoản đã xác minh thì mang huy hiệu "Đã xác thực"; khác thì nói thẳng
 *   rằng chủ xe sẽ thấy thêm số tài khoản: khách phải biết số nào của mình đi tới đâu.
 * - **Không `control`** (chuyến đã gửi): đọc lại đúng liên hệ đã ghi trên yêu cầu, không sửa được.
 *
 * Phiên mất giữa chừng (đăng xuất ở tab khác) ⇒ `renter = null`: thẻ chỉ còn lời nhắn, không dựng
 * một khung chờ không bao giờ xong.
 */
export function BookingRenterCard({
  renter,
  control,
  contact,
  children,
  headingLevel = 3,
}: BookingRenterCardProps) {
  const t = useTranslations('BookingRequests.flow');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const editable = control !== undefined;

  return (
    <section className={styles.card} aria-label={t('reviewPage.renter.title')}>
      <Heading className={styles.cardTitle}>{t('reviewPage.renter.title')}</Heading>
      <p className={styles.cardLead}>
        {editable ? t('reviewPage.renter.description') : t('reviewPage.renter.readonlyDescription')}
      </p>
      {renter ? (
        editable ? (
          <RenterContactFields control={control} renter={renter} />
        ) : (
          <RenterContactValues
            renter={renter}
            contact={contact ?? { name: renter.displayName, phone: renter.phone }}
          />
        )
      ) : null}
      {children}
    </section>
  );
}

/** Huy hiệu "Đã xác thực" — chỉ khi SĐT đang hiện CHÍNH LÀ số đã xác minh của tài khoản. */
function VerifiedTag() {
  const t = useTranslations('BookingRequests.flow');
  return (
    <span className={styles.verifiedTag}>
      <CheckCircleFilled aria-hidden /> {t('contact.verified')}
    </span>
  );
}

/**
 * Lời nói cạnh SĐT liên hệ — `null` khi không có gì cần nói. Một chỗ cho cả ô nhập lẫn bản chỉ đọc:
 * hai màn phải nói cùng một câu về cùng một số.
 */
function usePhoneNote(phone: string | null, renter: CurrentUser): ReactNode {
  const t = useTranslations('BookingRequests.flow');
  if (!phone?.trim()) return null;
  if (isSameVnPhone(phone, renter.phone)) return renter.phoneVerified ? <VerifiedTag /> : null;
  // Tài khoản chưa có số (vừa vào bằng Google/Facebook) thì chưa có "số thứ hai" nào để nói tới.
  return renter.phone ? (
    <span className={styles.contactHint}>
      {t('reviewPage.renter.phoneDifferent', { accountPhone: renter.phone })}
    </span>
  ) : null;
}

/** Hai ô nhập của màn Xem lại — luật nằm ở `requestFormSchema`, server kiểm lại. */
function RenterContactFields({
  control,
  renter,
}: {
  control: Control<RequestFormValues>;
  renter: CurrentUser;
}) {
  const t = useTranslations('BookingRequests.flow');
  const phone = useWatch({ control, name: 'customerPhone' });
  const phoneNote = usePhoneNote(phone, renter);

  return (
    <>
      {/* Nhãn nằm TRÊN ô như thiết kế — `Form.Item` đứng một mình mặc định đặt nhãn bên trái. */}
      <Form component={false} layout="vertical" colon={false}>
        <div className={styles.contactInputs}>
          <TextField
            control={control}
            name="customerName"
            label={t('reviewPage.renter.name')}
            placeholder={t('reviewPage.renter.namePlaceholder')}
            autoComplete="name"
            required
          />
          <TextField
            control={control}
            name="customerPhone"
            type="tel"
            label={t('reviewPage.renter.phone')}
            placeholder={t('reviewPage.renter.phonePlaceholder')}
            autoComplete="tel"
            required
            help={phoneNote ?? undefined}
          />
        </div>
      </Form>
      {renter.email ? (
        <dl className={styles.contactGrid}>
          <div className={styles.contactField}>
            <dt>{t('reviewPage.renter.email')}</dt>
            <dd className={styles.contactValue}>
              <span className={styles.contactText}>{renter.email}</span>
            </dd>
          </div>
        </dl>
      ) : null}
    </>
  );
}

/**
 * Bản chỉ đọc — liên hệ đã ghi trên yêu cầu (chuyến đã gửi). Chữ trơn như bản vẽ của các màn chuyến
 * (Figma `19759:40303`: nhãn `14px/Medium`, giá trị `16px/Medium`), không phải ô nhập bị khoá.
 */
function RenterContactValues({
  renter,
  contact,
}: {
  renter: CurrentUser;
  contact: BookingRenterContact;
}) {
  const t = useTranslations('BookingRequests.flow');
  const phoneNote = usePhoneNote(contact.phone, renter);

  return (
    <dl className={styles.contactGrid}>
      <div className={styles.contactField}>
        <dt>{t('reviewPage.renter.name')}</dt>
        <dd className={cx(styles.contactValue, styles.contactPlain)}>{contact.name}</dd>
      </div>
      <div className={styles.contactField}>
        <dt>{t('reviewPage.renter.phone')}</dt>
        <dd className={cx(styles.contactValue, styles.contactPlain)}>
          <span className={styles.contactText}>{contact.phone ?? '—'}</span>
          {phoneNote}
        </dd>
      </div>
      {renter.email ? (
        <div className={styles.contactField}>
          <dt>{t('reviewPage.renter.email')}</dt>
          <dd className={cx(styles.contactValue, styles.contactPlain)}>
            <span className={styles.contactText}>{renter.email}</span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
