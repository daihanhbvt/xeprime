'use client';

import { CheckCircleFilled, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Avatar, Button, Card, Spin, Tag } from 'antd';
import { useEffect } from 'react';
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
      <ShopEntryCard />

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
        <ProfileForm profile={profile.data} />
      ) : null}
    </>
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
