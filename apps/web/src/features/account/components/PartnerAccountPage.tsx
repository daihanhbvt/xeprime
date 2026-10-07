'use client';

import { Form, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback/EmptyState';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SectionCard } from '@/components/layout/SectionCard';
import { SectionNav, type SectionNavItem } from '@/components/layout/SectionNav';
import {
  ACCOUNT_SECTION,
  PERSONAL_ACCOUNT_SECTIONS,
  accountSectionDomId,
  accountSectionOf,
  type AccountSection,
} from '@/constants/routes';
import { useScrollToSection } from '@/hooks/use-scroll-to-section';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import { AccountProfileForm } from './AccountProfileForm';
import { AccountSecuritySections } from './AccountSecuritySections';
import styles from './PartnerAccountPage.module.css';

/**
 * TÀI KHOẢN & BẢO MẬT — trang của CON NGƯỜI đang đăng nhập ở site partner (05/10/2026).
 *
 * Gộp hai trang cũ: "Hồ sơ cá nhân" (`/manage/account`) và "Bảo mật tài khoản" (`/manage/security`).
 * Cả hai cùng hiện email/SĐT, nên người dùng phải đoán đổi số ở cửa nào; và cả hai cùng nói về
 * một danh tính. Một trang, bốn section theo thứ tự người ta cần chúng — từ thường dùng tới hiếm
 * và khó lùi lại:
 *
 *   1. Hồ sơ cá nhân      — tên, ảnh đại diện.
 *   2. Thông tin đăng nhập — email/SĐT, tình trạng xác minh, đổi qua OTP.
 *   3. Mật khẩu            — đổi, hoặc đặt lần đầu cho tài khoản OTP/mạng xã hội.
 *   4. Xoá tài khoản       — một YÊU CẦU, form khép lại cho tới khi người dùng chủ động mở.
 *
 * Cùng khuôn với trang Cửa hàng (`SectionNav` + `SectionCard`): mục lục dính bên trái, section xếp
 * dọc bên phải, `?section=` ở URL để link chia sẻ / F5 / Quay lại về đúng chỗ (ADR 0004). Không có
 * gì của GIAN HÀNG ở đây — tên, logo, SĐT liên hệ của gian hàng sống ở Cài đặt gian hàng.
 *
 * Mỗi section dùng lại component của khu tài khoản (không clone): luồng OTP, luật mật khẩu và
 * luồng yêu cầu xoá tài khoản chỉ có một chỗ để sửa (`AccountSecuritySections`).
 *
 * CHỦ xe tuyến hoa hồng không thấy bản này — cùng URL, họ thấy "Hồ sơ chủ xe" (`OwnerProfilePage`,
 * chọn ở `PartnerAccountRoute`).
 */
export function PartnerAccountPage() {
  const t = useTranslations('Account.hub');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();

  const { filters, setFilters } = useUrlFilters((params) => ({
    /*
     * Hai section của "Hồ sơ chủ xe" (trang chủ xe, địa chỉ) không có ở đây — một link
     * `?section=storefront` gửi cho người ở tuyến gói rơi về đầu trang, không về một mục lục
     * đang sáng một dòng không tồn tại.
     */
    section: personalSectionOf(params.get('section')),
    // Dẫn xuất, không bao giờ ghi ngược lên URL — chỉ để lần vẽ đầu biết có nên cuộn hay không.
    sectionInUrl: params.has('section'),
  }));

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />

      {profile.isPending ? (
        <div className={styles.layout} aria-busy="true">
          <Skeleton active title={false} paragraph={{ rows: 4 }} className={styles.navSkeleton} />
          <div className={styles.content}>
            <div className={styles.skeletonCard}>
              <Skeleton active avatar paragraph={{ rows: 4 }} />
            </div>
            <div className={styles.skeletonCard}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          </div>
        </div>
      ) : profile.isError ? (
        <div className={styles.skeletonCard}>
          <EmptyState
            variant="error"
            title={t('loadError')}
            description={errorMessage(profile.error)}
            onRetry={() => void profile.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        </div>
      ) : (
        <AccountSections
          profile={profile.data}
          section={filters.section}
          sectionInUrl={filters.sectionInUrl}
          // Đổi section không đổi tập dữ liệu nào, chỉ cuộn — không xoá `?page=` của ai.
          onSectionChange={(section) => setFilters({ section }, { resetPage: false })}
        />
      )}
    </div>
  );
}

function personalSectionOf(value: string | null): AccountSection {
  const section = accountSectionOf(value);
  return PERSONAL_ACCOUNT_SECTIONS.includes(section) ? section : ACCOUNT_SECTION.PROFILE;
}

/**
 * Bốn section — chỉ dựng khi đã có hồ sơ, để `useScrollToSection` tìm thấy đích ngay lần vẽ đầu
 * (link `?section=password` từ một redirect phải rơi đúng chỗ, không phải đầu trang).
 */
function AccountSections({
  profile,
  section,
  sectionInUrl,
  onSectionChange,
}: {
  profile: UserProfile;
  section: AccountSection;
  sectionInUrl: boolean;
  onSectionChange: (section: AccountSection) => void;
}) {
  const t = useTranslations('Account.hub');

  const items: SectionNavItem<AccountSection>[] = [
    { key: ACCOUNT_SECTION.PROFILE, label: t('sections.profile') },
    { key: ACCOUNT_SECTION.LOGIN, label: t('sections.login') },
    { key: ACCOUNT_SECTION.PASSWORD, label: t('sections.password') },
    { key: ACCOUNT_SECTION.DELETE, label: t('sections.delete') },
  ];

  useScrollToSection(accountSectionDomId(section), sectionInUrl);

  return (
    <div className={styles.layout}>
      <SectionNav
        items={items}
        active={section}
        onSelect={onSectionChange}
        domIdOf={accountSectionDomId}
        title={t('navTitle')}
        ariaLabel={t('navLabel')}
      />

      {/*
        Một `Form` ngữ cảnh (không dựng thẻ <form>) cho cả bốn section: nhãn nằm TRÊN ô, không dấu
        hai chấm — cùng nhịp với trang Cửa hàng. Mỗi section vẫn giữ <form> riêng của nó.
      */}
      <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
        <div className={styles.content}>
          <SectionCard
            id={accountSectionDomId(ACCOUNT_SECTION.PROFILE)}
            title={t('sections.profile')}
            hint={t('sections.profileHint')}
          >
            <AccountProfileForm profile={profile} />
          </SectionCard>

          <AccountSecuritySections profile={profile} />
        </div>
      </Form>
    </div>
  );
}
