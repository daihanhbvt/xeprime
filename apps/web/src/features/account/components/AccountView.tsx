'use client';

import {
  CheckCircleFilled,
  EditOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Avatar, Button, Card, Spin, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { useMyProfile, useUpdateMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import { ShopEntryCard } from './ShopEntryCard';
import styles from './AccountView.module.css';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

/**
 * Trang gốc của khu tài khoản — hồ sơ của CON NGƯỜI đang đăng nhập.
 *
 * Không phải hồ sơ gian hàng (`/manage/shop`): người không có gian hàng vẫn phải sửa được tên
 * và ảnh của mình, còn chủ gian hàng thì sửa hồ sơ cá nhân ở ĐÂY chứ không phải ở cổng quản lý
 * (ADR 0014 — hai trang cùng ghi vào một hàng `users` là bug chờ sẵn).
 *
 * Cổng đăng nhập nằm ở `AccountShell`, không lặp lại ở đây; component này chỉ lo trạng thái
 * của chính truy vấn hồ sơ.
 */
export function AccountView() {
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();

  return (
    <>
      {profile.isLoading ? (
        <div className={styles.center}>
          <Spin size="large" />
        </div>
      ) : profile.isError ? (
        <div className={styles.center}>
          <Alert type="error" showIcon message={errorMessage(profile.error)} />
          <Button onClick={() => void profile.refetch()}>{tCommon('actions.retry')}</Button>
        </div>
      ) : profile.data ? (
        <>
          <ProfileForm profile={profile.data} />
          <ShopEntryCard />
        </>
      ) : null}
    </>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const update = useUpdateMyProfile();
  const [isEditing, setIsEditing] = useState(false);

  const resolver = useValidationResolver<AccountProfileValues>(
    accountProfileSchema,
    'Account.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<AccountProfileValues>({
    resolver,
    defaultValues: {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    },
  });

  // Hồ sơ được refetch (đổi ở tab khác, invalidate sau khi lưu) → nạp lại giá trị vào form,
  // nếu không người dùng sẽ nhìn thấy dữ liệu cũ trong ô nhập.
  useEffect(() => {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [profile.displayName, profile.avatarUrl, reset]);

  // `useWatch` thay cho `watch()`: chỉ component này render lại khi hai field đó đổi, và nó là
  // API React Compiler memo hoá được (`watch()` trả hàm mới mỗi render nên bị bỏ qua).
  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? undefined },
      {
        onSuccess: () => {
          message.success(t('saved'));
          setIsEditing(false);
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  function cancelEditing() {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
    setIsEditing(false);
  }

  return (
    <Card className={styles.card}>
      <div className={styles.inner}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>
              <SafetyCertificateOutlined aria-hidden />
              {t('profile.eyebrow')}
            </span>
            <h2 className={styles.title}>{t('profile.title')}</h2>
            <p className={styles.description}>{t('profile.description')}</p>
          </div>
          <Button
            icon={<EditOutlined />}
            onClick={() => setIsEditing(true)}
            disabled={isEditing || update.isPending}
          >
            {t('profile.edit')}
          </Button>
        </div>

        <div className={styles.profileGrid}>
          <section className={styles.summary} aria-label={t('profile.accountLabel')}>
            <Avatar size={104} src={avatarUrl || undefined} className={styles.avatar}>
              {initial(displayName || profile.displayName)}
            </Avatar>
            <div className={styles.name}>{displayName || profile.displayName}</div>
            <div className={styles.accountLabel}>{t('profile.accountLabel')}</div>
          </section>

          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>
                <MailOutlined aria-hidden />
                {t('profile.email')}
              </dt>
              <dd>{profile.email ?? t('noEmail')}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>
                <PhoneOutlined aria-hidden />
                {t('profile.phone')}
              </dt>
              <dd>
                {profile.phone ?? t('noPhone')}
                {profile.phone ? (
                  <Tag
                    color={profile.phoneVerified ? STATUS_COLOR.SUCCESS : STATUS_COLOR.WARNING}
                    className={styles.verified}
                  >
                    {profile.phoneVerified ? <CheckCircleFilled /> : null}
                    {profile.phoneVerified ? t('verified') : t('profile.unverified')}
                  </Tag>
                ) : null}
              </dd>
            </div>
          </dl>
        </div>

        {isEditing ? (
          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <div className={styles.fields}>
              <TextField
                control={control}
                name="displayName"
                label={t('displayName')}
                placeholder={t('displayNamePlaceholder')}
                autoComplete="name"
                prefix={<UserOutlined />}
                disabled={update.isPending}
              />
              <TextField
                control={control}
                name="avatarUrl"
                label={t('avatarUrl')}
                placeholder={t('avatarUrlPlaceholder')}
                disabled={update.isPending}
              />
            </div>
            <div className={styles.formActions}>
              <Button onClick={cancelEditing} disabled={update.isPending}>
                {tCommon('actions.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={update.isPending}
                disabled={!formState.isDirty && !update.isPending}
              >
                {tCommon('actions.saveChanges')}
              </Button>
            </div>
          </form>
        ) : null}

        <div className={styles.securityNote}>
          <LockOutlined className={styles.securityIcon} aria-hidden />
          <div>
            <h3 className={styles.securityTitle}>{t('profile.securityTitle')}</h3>
            <p className={styles.securityDescription}>{t('profile.securityDescription')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
