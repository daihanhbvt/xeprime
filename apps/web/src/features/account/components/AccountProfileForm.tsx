'use client';

import { InfoCircleOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';

import { ImageUploadField } from '@/components/form/ImageUploadField';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import { useCurrentUser } from '@/hooks/use-current-user';
import { initialOf } from '@/lib/initials';
import { presignAvatar } from '@/services/upload';

import { useAccountIdentityLabel } from '../hooks/use-account-identity-label';
import { useAccountProfileForm } from '../hooks/use-account-profile-form';
import type { UserProfile } from '../types';
import { AccountTrackBadge } from './AccountTrackBadge';
import styles from './AccountProfileForm.module.css';

/**
 * Section "Hồ sơ cá nhân" của trang Tài khoản & bảo mật (site partner).
 *
 * Trái: thẻ danh tính — ảnh, tên, nhãn vai, tuyến — xem trước NGAY khi đang gõ (đọc từ form, không
 * từ dữ liệu đã lưu), để người dùng thấy mình sẽ hiện ra sao trước khi bấm Lưu. Phải: hai ô sửa.
 *
 * Luôn ở chế độ sửa, không có nút "Chỉnh sửa hồ sơ" mở khoá: hai ô, một nút Lưu chỉ sáng khi có
 * thay đổi — cùng nhịp với trang Cửa hàng. Một bước mở khoá cho hai ô là một cú bấm không bảo vệ
 * được gì.
 *
 * Dòng cuối phân biệt tài khoản với GIAN HÀNG: tên/ảnh ở đây là của con người đang đăng nhập; tên,
 * logo, SĐT liên hệ mà khách thấy là của gian hàng và sửa ở Cài đặt gian hàng. Chủ xe tuyến hoa
 * hồng KHÔNG dùng khối này: với họ ảnh + họ tên là thứ khách thấy, nên trang của họ có khối riêng
 * (`OwnerInfoForm` — ảnh bắt buộc, kèm lời giới thiệu; ADR 0054).
 */
export function AccountProfileForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const tHub = useTranslations('Account.hub');
  const tCommon = useTranslations('Common');
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  const canOpenShopSettings = useShopSettingsAccess();

  const { form, submit, revert, saving } = useAccountProfileForm(profile);
  const { control, formState } = form;
  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });
  const previewName = displayName?.trim() || profile.displayName;
  const dirty = formState.isDirty;

  return (
    <div className={styles.layout}>
      <aside className={styles.identity} aria-label={tHub('profile.previewLabel')}>
        <Avatar size={88} src={avatarUrl || undefined} className={styles.avatar}>
          {initialOf(previewName)}
        </Avatar>
        <p className={styles.name}>{previewName}</p>
        {/*
          Có gian hàng: tên gian hàng + nhãn tuyến — nhãn đã nói vai ("Chủ gian hàng · Gói…"), nên
          không lặp thêm một dòng vai riêng. Cỡ nhãn THƯỜNG để tên gói dài xuống dòng, không bị cắt.
        */}
        {user?.tenant ? (
          <>
            <p className={styles.workspace}>{user.tenant.name}</p>
            <AccountTrackBadge tenant={user.tenant} />
          </>
        ) : user ? (
          <p className={styles.role}>{identityLabel(user)}</p>
        ) : null}
      </aside>

      <form onSubmit={submit} noValidate className={styles.form}>
        <TextField
          control={control}
          name="displayName"
          label={t('displayName')}
          placeholder={t('displayNamePlaceholder')}
          autoComplete="name"
          prefix={<UserOutlined />}
          disabled={saving}
        />
        <ImageUploadField
          control={control}
          name="avatarUrl"
          label={t('avatarUrl')}
          presign={presignAvatar}
          help={t('avatarHelp')}
        />

        <p className={styles.note}>
          <InfoCircleOutlined aria-hidden className={styles.noteIcon} />
          <span>
            {tHub('profile.notShop')}{' '}
            {canOpenShopSettings ? (
              <Link href={ROUTES.MANAGE.SHOP}>{tHub('profile.shopSettingsLink')}</Link>
            ) : null}
          </span>
        </p>

        <div className={styles.actions}>
          {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
          {dirty ? (
            <Button onClick={revert} disabled={saving}>
              {tCommon('actions.cancel')}
            </Button>
          ) : null}
          <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
            {tCommon('actions.saveChanges')}
          </Button>
        </div>
      </form>
    </div>
  );
}
