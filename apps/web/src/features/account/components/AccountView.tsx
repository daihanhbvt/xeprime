'use client';

import { CheckCircleFilled, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Avatar, Button, Card, Spin, Tag } from 'antd';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { useMyProfile, useUpdateMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import styles from './AccountView.module.css';

/**
 * "Tài khoản của tôi" — hồ sơ của KHÁCH THUÊ XE.
 *
 * Không phải hồ sơ gian hàng (`/manage/shop`): người không có gian hàng vẫn phải sửa được tên
 * và ảnh của mình. Đây chính là đích của nút "Cập nhật tài khoản" sau khi đăng ký.
 */
export function AccountView() {
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
          <Alert type="info" showIcon message="Vui lòng đăng nhập để xem tài khoản của bạn." />
          <Button
            type="primary"
            onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
          >
            Đăng nhập
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon message={getErrorMessage(profile.error)} />
        <Button onClick={() => void profile.refetch()}>Thử lại</Button>
      </div>
    );
  }

  if (!profile.data) return null;

  return (
    <div className={styles.wrap}>
      <h1 className={styles.heading}>Tài khoản của tôi</h1>
      <ProfileForm profile={profile.data} />
    </div>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
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
        onSuccess: () => message.success('Đã cập nhật tài khoản'),
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
            <MailOutlined /> {profile.email ?? 'Chưa có email'}
          </div>
          <div className={styles.contactRow}>
            <PhoneOutlined /> {profile.phone ?? 'Chưa có số điện thoại'}
            {profile.phone && profile.phoneVerified ? (
              <Tag color="green" className={styles.verified}>
                <CheckCircleFilled /> Đã xác thực
              </Tag>
            ) : null}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className={styles.form}>
        <TextField
          control={control}
          name="displayName"
          label="Họ tên hiển thị"
          placeholder="Nguyễn Văn A"
          autoComplete="name"
          prefix={<UserOutlined />}
          disabled={update.isPending}
        />
        <TextField
          control={control}
          name="avatarUrl"
          label="Ảnh đại diện (đường dẫn)"
          placeholder="https://…"
          disabled={update.isPending}
        />

        <Alert
          type="info"
          showIcon
          className={styles.readonlyNote}
          message="Email và số điện thoại chưa đổi được"
          description="Hai thông tin này dùng để đăng nhập nên cần một luồng xác thực riêng. Liên hệ hỗ trợ nếu bạn cần thay đổi."
        />

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={update.isPending}
          disabled={!formState.isDirty && !update.isPending}
        >
          Lưu thay đổi
        </Button>
      </form>
    </Card>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
