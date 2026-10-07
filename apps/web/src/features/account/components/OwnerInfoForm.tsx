'use client';

import { UserOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { ownerAccountProfileSchema, type OwnerAccountProfileValues } from '@xeprime/validators';

import { AvatarUploadField } from '@/components/form/AvatarUploadField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import type { MyShop } from '@/features/shop/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { presignAvatar } from '@/services/upload';

import { useUpdateMyProfile } from '../hooks/use-account';
import type { UserProfile } from '../types';
import styles from './OwnerInfoForm.module.css';

function valuesOf(profile: UserProfile, shop: MyShop): OwnerAccountProfileValues {
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? '',
    bio: shop.profile.bio ?? '',
  };
}

/**
 * "THÔNG TIN CHỦ XE" — toàn bộ thứ khách thấy về một chủ xe cá nhân, trên MỘT khối (ADR 0054):
 * ảnh đại diện, họ tên, lời giới thiệu.
 *
 * Hai bản ghi, một nút lưu: ảnh + họ tên thuộc TÀI KHOẢN (`PATCH /users/me`), lời giới thiệu thuộc
 * trang chủ xe (`PATCH /tenants/current/profile`, gửi RIÊNG `bio` — endpoint nhận cập nhật từng
 * phần). Chỉ phần nào thật sự đổi mới được gửi: sửa mỗi lời giới thiệu không chạm tài khoản, và
 * ngược lại.
 *
 * Hai lời gọi không chung transaction (hai bảng, hai service). Một bên hỏng thì bên kia vẫn đã lưu
 * — form KHÔNG reset phần hỏng, báo đúng lỗi của nó, và lần bấm Lưu kế tiếp chỉ gửi lại phần còn
 * khác server.
 *
 * Ảnh BẮT BUỘC (`avatarRequired`) và không có nút xoá: với chủ xe cá nhân nó là ảnh khách thấy
 * trên chợ — không có logo nào để rơi về.
 */
export function OwnerInfoForm({
  profile,
  shop,
  canEditBio,
}: {
  profile: UserProfile;
  shop: MyShop;
  /** `tenant.update` — lời giới thiệu là của trang chủ xe. Họ tên/ảnh là của chính người dùng. */
  canEditBio: boolean;
}) {
  const t = useTranslations('Account.ownerHub.info');
  const tAccount = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const updateMe = useUpdateMyProfile();
  const updateShop = useUpdateShopProfile();

  const resolver = useValidationResolver<OwnerAccountProfileValues>(
    ownerAccountProfileSchema,
    'Account.validation',
  );
  /*
   * `values` (không phải `defaultValues`): sau khi lưu, hai query trả bản mới và form theo — nếu
   * không, nút Huỷ sẽ mời hoàn tác thứ đã lưu xong. RHF so sâu nên một lần refetch không đổi gì
   * không xoá thay đổi đang gõ.
   */
  const { control, handleSubmit, reset, formState } = useForm<OwnerAccountProfileValues>({
    resolver,
    values: valuesOf(profile, shop),
    /*
     * Một bên lưu xong, bên kia hỏng: query của bên xong đổi ⇒ RHF nạp lại `values`. Giữ nguyên ô
     * người dùng ĐANG sửa, nếu không phần hỏng bị xoá mất đúng lúc cần bấm Lưu lại.
     */
    resetOptions: { keepDirtyValues: true },
  });
  const displayName = useWatch({ control, name: 'displayName' });
  const saving = updateMe.isPending || updateShop.isPending;
  const dirty = formState.isDirty;

  const submit = handleSubmit(async (values) => {
    // Enter vẫn submit form khi nút Lưu đang quay — chặn lượt thứ hai ở đây.
    if (saving) return;
    const saved = valuesOf(profile, shop);
    const accountChanged =
      values.displayName !== saved.displayName || values.avatarUrl !== saved.avatarUrl;
    const bioChanged = canEditBio && values.bio !== saved.bio;

    const results = await Promise.allSettled([
      accountChanged
        ? updateMe.mutateAsync({ displayName: values.displayName, avatarUrl: values.avatarUrl })
        : Promise.resolve(null),
      bioChanged ? updateShop.mutateAsync({ bio: values.bio }) : Promise.resolve(null),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    // Câu lỗi tra từ MÃ (ADR 0012), không hiện `message` tiếng Việt của backend.
    if (failed) message.error(errorMessage(failed.reason));
    else message.success(t('saved'));
  });

  return (
    <form onSubmit={submit} noValidate className={styles.layout}>
      <div className={styles.avatar}>
        <AvatarUploadField
          control={control}
          name="avatarUrl"
          fallbackName={displayName || profile.displayName}
          presign={presignAvatar}
          disabled={saving}
        />
      </div>

      <div className={styles.fields}>
        <TextField
          control={control}
          name="displayName"
          label={tAccount('displayName')}
          placeholder={tAccount('displayNamePlaceholder')}
          autoComplete="name"
          prefix={<UserOutlined />}
          required
          disabled={saving}
        />
        {/* `fieldset[disabled]` khoá ô nhiều dòng bằng cơ chế của trình duyệt. */}
        <fieldset disabled={saving || !canEditBio} className={styles.fieldset}>
          <TextAreaField
            control={control}
            name="bio"
            label={t('bio')}
            placeholder={t('bioPlaceholder')}
            maxLength={2000}
          />
        </fieldset>

        <div className={styles.actions}>
          {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
          {dirty ? (
            <Button onClick={() => reset()} disabled={saving}>
              {tCommon('actions.cancel')}
            </Button>
          ) : null}
          <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
            {tCommon('actions.saveChanges')}
          </Button>
        </div>
      </div>
    </form>
  );
}
