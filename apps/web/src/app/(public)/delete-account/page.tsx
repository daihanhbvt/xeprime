import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { PublicDeletionForm } from '@/features/account/components/PublicDeletionForm';
import { ContentSection } from '@/features/content-page/components/ContentSection';
import { InfoNote } from '@/features/content-page/components/InfoNote';
import { PageHero } from '@/features/content-page/components/PageHero';
import styles from './page.module.css';

/**
 * Yêu cầu xoá tài khoản — trang CÔNG KHAI, không cần đăng nhập.
 *
 * ## Vì sao trang này tồn tại, tách khỏi `/account/delete-account`
 *
 * App Store và Google Play đều bắt buộc một app có tài khoản phải công bố một ĐỊA CHỈ WEB để
 * người dùng yêu cầu xoá tài khoản — mở được mà KHÔNG cần cài app và KHÔNG cần đăng nhập. Người
 * duyệt app không có tài khoản thật, nên một đường nằm sau tường đăng nhập không dùng được cho
 * việc đó. Đây là địa chỉ điền vào hồ sơ nộp store.
 *
 * `/account/delete-account` vẫn là đường CHÍNH — và là đường DUY NHẤT mở được một support case
 * thật, theo dõi được tiến trình và rút lại được. Biểu mẫu ở trang này KHÔNG gọi API và không tạo
 * bản ghi nào (xem `PublicDeletionForm`), nên khối cuối trang trỏ thẳng sang đường kia.
 *
 * ## Không đánh chỉ mục
 *
 * `robots: noindex` cùng lý do với `/account/delete-account`: một biểu mẫu xoá tài khoản đứng
 * trong kết quả tìm kiếm là mời người lạ gõ email của người khác vào đó. Store không cần trang
 * được index — họ chỉ cần nó mở được bằng URL.
 *
 * ## Server Component + một đảo client
 *
 * Toàn bộ nội dung giải thích render ở server (bot của store đọc được HTML tĩnh); chỉ biểu mẫu là
 * `'use client'` vì nó cần form state.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Account.publicDeletion');
  return {
    title: t('title'),
    description: t('lead'),
    robots: { index: false, follow: false },
  };
}

/** Bốn nhóm dữ liệu — CÙNG khoá với luồng trong khu tài khoản, để hai trang không kể hai câu chuyện. */
const DATA_GROUPS = ['profile', 'vehicles', 'trips', 'billing'] as const;

export default async function DeleteAccountPage() {
  const t = await getTranslations('Account.publicDeletion');
  const tItems = await getTranslations('Account.deleteAccount.items');
  const tNav = await getTranslations('Navigation.public');
  // Tên văn bản pháp lý lấy từ CHÍNH văn bản đó — cùng nguồn với chân trang và khu pháp lý.
  const tLegal = await getTranslations('Legal.docs.privacy');

  return (
    <>
      <PageHero
        breadcrumb={[{ label: tNav('home'), href: ROUTES.HOME }, { label: t('title') }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('lead')}
      />

      <div className={styles.page}>
        <ContentSection id="delete-account-form" heading={t('formHeading')} lead={t('formLead')}>
          <div className={styles.formCard}>
            <PublicDeletionForm />
          </div>
        </ContentSection>

        <ContentSection id="delete-account-scope" heading={t('whatHeading')} lead={t('whatLead')}>
          <ul className={styles.groups}>
            {DATA_GROUPS.map((key) => (
              <li key={key} className={styles.group}>
                {tItems(key)}
              </li>
            ))}
          </ul>

          {/*
            Nghĩa vụ lưu trữ đứng thành một khối CẢNH BÁO riêng, không phải một dòng chú thích mờ
            cuối danh sách: nó là ngoại lệ duy nhất của lời hứa phía trên, và người đọc trang này
            đang đọc để biết chính xác cái gì mất, cái gì không.
          */}
          <InfoNote tone="warning" title={t('retentionHeading')} className={styles.retention}>
            <p>{t('retentionBody')}</p>
            <p className={styles.policyLink}>
              <Link href={legalPath.doc(LEGAL_DOC.PRIVACY)}>{tLegal('title')}</Link>
            </p>
          </InfoNote>
        </ContentSection>

        <ContentSection id="delete-account-in-app" heading={t('inAppHeading')}>
          <p className={styles.inAppBody}>{t('inAppBody')}</p>
          <p>
            <Link href={ROUTES.ACCOUNT.DELETE_ACCOUNT} className={styles.inAppLink}>
              {t('inAppLink')} →
            </Link>
          </p>
        </ContentSection>
      </div>
    </>
  );
}
