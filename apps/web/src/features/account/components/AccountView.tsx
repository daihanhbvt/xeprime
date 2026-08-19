'use client';

import { CheckCircleFilled, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Avatar, Button, Card, Spin, Tag } from 'antd';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { useMyProfile, useUpdateMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import styles from './AccountView.module.css';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * "{t('title')}" — hồ sơ của KHÁCH THUÊ XE.
 *
 * Không phải hồ sơ gian hàng (`/manage/shop`): người không có gian hàng vẫn phải sửa được tên
 * và ảnh của mình. Đây chính là đích của nút "Cập nhật tài khoản" sau khi đăng ký.
 */
export function AccountView() {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  if (profile.isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="large" />
      </div>
    );
  }

  if (profile.isError) {
    if (isUnauthenticated(profile.error)) {
      return (
        <div className={styles.center}>
          <Alert type="info" showIcon message={t('signInRequired')} />
          <Button
            type="primary"
            onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
          >
            {t('signIn')}
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon message={errorMessage(profile.error)} />
        <Button onClick={() => void profile.refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }

  if (!profile.data) return null;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>{t('title')}</h1>
      <ProfileForm profile={profile.data} />
    </div>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const update = useUpdateMyProfile();

  const { control, handleSubmit, reset, formState } = useForm<AccountProfileValues>({
    resolver: yupResolver(accountProfileSchema),
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
        onSuccess: () => message.success(t('saved')),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  return (
    <Card className={styles.card}>
      <div className={styles.identity}>
        <Avatar size={72} src={avatarUrl || undefined} className={styles.avatar}>
          {initial(displayName || profile.displayName)}
        </Avatar>
        <div>
          <div className={styles.name}>{displayName || profile.displayName}</div>
          <div className={styles.contactRow}>
            <MailOutlined /> {profile.email ?? t('noEmail')}
          </div>
          <div className={styles.contactRow}>
            <PhoneOutlined /> {profile.phone ?? t('noPhone')}
            {profile.phone && profile.phoneVerified ? (
              <Tag color={STATUS_COLOR.SUCCESS} className={styles.verified}>
                <CheckCircleFilled /> {t('verified')}
              </Tag>
            ) : null}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className={styles.form}>
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
          placeholder="https://…"
          disabled={update.isPending}
        />

        <Alert
          type="info"
          showIcon
          className={styles.readonlyNote}
          message={t('identityLockedTitle')}
          description={t('identityLockedBody')}
        />

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={update.isPending}
          disabled={!formState.isDirty && !update.isPending}
        >
          {tCommon('actions.saveChanges')}
        </Button>
      </form>
    </Card>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
