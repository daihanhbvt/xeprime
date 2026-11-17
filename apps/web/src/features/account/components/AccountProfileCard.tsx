'use client';

import { ArrowRightOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { Avatar, Button, Tooltip, Upload } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES, resolveAccountTrack } from '@xeprime/types';

import { TextField } from '@/components/form/TextField';
import { LineIcon } from '@/components/icons/LineIcon';
import { ROUTES } from '@/constants/routes';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import { useCurrentUser } from '@/hooks/use-current-user';
import { initialOf } from '@/lib/initials';

import { useAccountIdentityLabel } from '../hooks/use-account-identity-label';
import { useAccountProfileForm } from '../hooks/use-account-profile-form';
import { useAvatarUpload } from '../hooks/use-avatar-upload';
import type { UserProfile } from '../types';
import styles from './AccountProfileCard.module.css';

const AVATAR_MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/**
 * Thẻ HỒ SƠ CÁ NHÂN ở cột trái trang Tài khoản & bảo mật (site partner, design `24131:71668`).
 *
 * Đầu thẻ là thẻ danh tính - ảnh, tên, vai, gian hàng · gói - xem trước NGAY khi đang gõ (đọc từ
 * form, không từ dữ liệu đã lưu). Thân thẻ là ô họ tên + nút máy ảnh trên ảnh đại diện; một nút
 * "Lưu thay đổi" chỉ sáng khi có thay đổi, và "Hủy" chỉ tồn tại khi có gì để huỷ.
 *
 * Khung ghi chú phân biệt tài khoản với GIAN HÀNG: tên/ảnh ở đây là của con người đang đăng nhập;
 * tên, logo, SĐT mà khách thấy là của gian hàng (Cài đặt gian hàng). Với CHỦ xe tuyến hoa hồng thì
 * ngược lại: ảnh + họ tên này CHÍNH LÀ thứ khách thấy (ADR 0054), nên câu nói điều đó và dẫn sang
 * Hồ sơ chủ xe (`/shop`, ADR 0085).
 *
 * Nhãn vai là nhãn danh tính dùng chung (`useAccountIdentityLabel`) - "Chủ gian hàng", không phải
 * "Admin gian hàng" của bản vẽ (cùng quyết định với trang Nhân viên & Phân quyền).
 */
export function AccountProfileCard({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account.securityPage.profile');
  const tCommon = useTranslations('Common');
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  const canOpenShopSettings = useShopSettingsAccess();
  const commissionOwner = isCommissionOwner(user);

  const { form, submit, revert, saving } = useAccountProfileForm(profile);
  const { control, formState, setValue } = form;
  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });
  const previewName = displayName?.trim() || profile.displayName;
  const dirty = formState.isDirty;

  const setAvatar = (url: string | null) =>
    setValue('avatarUrl', url, { shouldDirty: true, shouldValidate: true });
  const avatar = useAvatarUpload((url) => setAvatar(url));
  const locked = saving || avatar.uploading;

  /*
   * "Gian hàng · Gói": chủ xe cá nhân không có gian hàng để gọi tên (tenant của họ là khung kỹ thuật
   * - cùng luật với dòng phụ của menu hồ sơ); thành viên gian hàng thấy tên gian hàng họ làm việc.
   */
  const workspace =
    user?.tenant && !commissionOwner
      ? [user.tenant.name, resolveAccountTrack(user.tenant).planName].filter(Boolean)
      : [];

  return (
    <section className={styles.card} aria-label={t('cardLabel')}>
      <span className={styles.cover} aria-hidden="true" />

      <div className={styles.avatarWrap}>
        <Avatar size={96} src={avatarUrl || undefined} className={styles.avatar}>
          {initialOf(previewName)}
        </Avatar>
        <Upload
          accept={IMAGE_UPLOAD_MIME_TYPES.join(',')}
          showUploadList={false}
          beforeUpload={avatar.select}
          disabled={locked}
        >
          <Tooltip title={t('changeAvatar')}>
            <button
              type="button"
              className={styles.camera}
              disabled={locked}
              aria-label={
                avatar.uploading
                  ? tCommon('components.imageUpload.uploading', { percent: avatar.progress })
                  : t('changeAvatar')
              }
            >
              {avatar.uploading ? <LoadingOutlined aria-hidden /> : <LineIcon name="camera" />}
            </button>
          </Tooltip>
        </Upload>
        {avatarUrl ? (
          <Tooltip title={t('removeAvatar')}>
            <button
              type="button"
              className={styles.remove}
              disabled={locked}
              aria-label={t('removeAvatar')}
              onClick={() => setAvatar(null)}
            >
              <CloseOutlined aria-hidden />
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className={styles.identity}>
        <p className={styles.name}>{previewName}</p>
        {user ? (
          <span className={styles.role}>
            <span className={styles.roleDot} aria-hidden="true" />
            {identityLabel(user)}
          </span>
        ) : null}
        {workspace.length > 0 ? (
          <p className={styles.workspace}>
            {workspace.map((item, index) => (
              <span key={item} className={styles.workspaceItem}>
                {index > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <hr className={styles.divider} />

      <form onSubmit={submit} noValidate className={styles.form}>
        <TextField
          control={control}
          name="displayName"
          label={t('displayName')}
          placeholder={t('displayNamePlaceholder')}
          autoComplete="name"
          suffix={<LineIcon name="edit" className={styles.fieldIcon} />}
          disabled={saving}
        />

        <div className={styles.note}>
          <p>
            {t.rich('avatarHelp', {
              max: AVATAR_MAX_MB,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <p>
            {t.rich(commissionOwner ? 'personalStorefront' : 'notShop', {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          {commissionOwner || canOpenShopSettings ? (
            <Link href={ROUTES.MANAGE.SHOP} className={styles.noteLink}>
              {commissionOwner ? t('ownerProfileLink') : t('shopSettingsLink')}
              <ArrowRightOutlined aria-hidden />
            </Link>
          ) : null}
        </div>

        <div className={styles.actions}>
          {/* Chưa sửa gì thì không có gì để huỷ - nút không tồn tại, chứ không phải mờ đi. */}
          {dirty ? (
            <Button size="large" onClick={revert} disabled={saving}>
              {tCommon('actions.cancel')}
            </Button>
          ) : null}
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            loading={saving}
            disabled={!dirty || avatar.uploading}
          >
            {tCommon('actions.saveChanges')}
          </Button>
        </div>
      </form>
    </section>
  );
}
