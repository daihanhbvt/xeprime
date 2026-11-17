'use client';

import { Button, Form, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EmptyState } from '@/components/feedback/EmptyState';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoCard } from '@/components/layout/InfoCard';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useMyProfile } from '../hooks/use-account';
import { AccountDeletionDialog } from './AccountDeletionDialog';
import { AccountPasswordForm } from './AccountPasswordForm';
import { AccountProfileCard } from './AccountProfileCard';
import { LoginMethods } from './LoginMethods';
import styles from './PartnerAccountPage.module.css';

/**
 * TÀI KHOẢN & BẢO MẬT - trang của CON NGƯỜI đang đăng nhập ở site partner, mọi tuyến (ADR 0085
 * điều 2). Design `24131:71662` (17/11/2026):
 *
 *   - cột trái 400: thẻ hồ sơ cá nhân (ảnh, họ tên) + dòng "Yêu cầu xóa tài khoản";
 *   - cột phải: "Thông tin đăng nhập" (SĐT, email - đổi/xác minh qua OTP) và "Mật khẩu".
 *
 * Một URL, không mục lục và không `?section=` (người dùng chốt 17/11/2026 - trang đủ gọn để nhìn
 * hết một lượt). Link cũ mang `?section=` vẫn mở được trang; các bí danh của "Hồ sơ chủ xe" cũ
 * (`address|vat-invoice|tax|plan`) do `PartnerAccountRoute` chuyển sang `/shop` trước khi tới đây.
 *
 * Xoá tài khoản là một YÊU CẦU (support case), mở trong hộp `AccountDeletionDialog` dùng chung với
 * site khách: điều kiện, quy trình, gửi, xem trạng thái và rút yêu cầu.
 *
 * Không có gì của GIAN HÀNG ở đây - tên, logo, SĐT liên hệ của gian hàng sống ở Cài đặt gian hàng.
 */
export function PartnerAccountPage() {
  const t = useTranslations('Account.securityPage');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />

      {profile.isPending ? (
        <div className={styles.layout} aria-busy="true">
          <div className={styles.skeletonCard}>
            <Skeleton active avatar paragraph={{ rows: 6 }} />
          </div>
          <div className={styles.content}>
            <div className={styles.skeletonCard}>
              <Skeleton active paragraph={{ rows: 3 }} />
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
        /*
          Một `Form` ngữ cảnh (không dựng thẻ <form>) cho cả trang: nhãn nằm TRÊN ô, không dấu hai
          chấm. Mỗi khối vẫn giữ <form> riêng của nó.
        */
        <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
          <div className={styles.layout}>
            <div className={styles.aside}>
              <AccountProfileCard profile={profile.data} />
              <Button
                type="link"
                danger
                className={styles.delete}
                icon={<LineIcon name="delete" />}
                onClick={() => setDeleting(true)}
              >
                {t('deleteLink')}
              </Button>
            </div>

            <div className={styles.content}>
              <InfoCard title={t('loginTitle')} hint={t('loginHint')}>
                <LoginMethods profile={profile.data} />
              </InfoCard>
              <InfoCard title={t('passwordTitle')} hint={t('passwordHint')}>
                <AccountPasswordForm />
              </InfoCard>
            </div>
          </div>
        </Form>
      )}

      {/* Render có điều kiện: mỗi lần mở là một lượt đọc mới, tick xác nhận không đi theo. */}
      {deleting ? <AccountDeletionDialog open onClose={() => setDeleting(false)} /> : null}
    </div>
  );
}
