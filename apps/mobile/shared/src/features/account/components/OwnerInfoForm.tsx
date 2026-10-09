import { useForm, useWatch } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ownerAccountProfileSchema, type OwnerAccountProfileValues } from '@xeprime/validators';
import { uploadsApi } from '@/api/uploads/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { TextField } from '@/components/ui/TextField';
import { useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import type { MyShop } from '@/features/shop/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import type { UserProfile } from '../api';
import { useUpdateMyProfile } from '../hooks/use-account';

/** Độ dài tối đa của lời giới thiệu — cùng trần với `ownerAccountProfileSchema` (`bioMax`). */
const BIO_MAX = 2000;

export function ownerInfoValuesOf(profile: UserProfile, shop: MyShop): OwnerAccountProfileValues {
  return {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? '',
    bio: shop.profile.bio ?? '',
  };
}

/**
 * "THÔNG TIN CHỦ XE" — toàn bộ thứ khách thấy về một chủ xe cá nhân, trên MỘT khối (ADR 0054,
 * bản native của web `OwnerInfoForm`): ảnh đại diện, họ tên, lời giới thiệu.
 *
 * Hai bản ghi, một nút lưu: ảnh + họ tên thuộc TÀI KHOẢN (`PATCH /users/me`), lời giới thiệu thuộc
 * trang chủ xe (`PATCH /tenants/current/profile`, gửi RIÊNG `bio`). Chỉ phần nào thật sự đổi mới
 * được gửi. Hai lời gọi không chung transaction: một bên hỏng thì bên kia vẫn đã lưu — form giữ
 * nguyên phần người dùng đang sửa (`keepDirtyValues`) và báo đúng lỗi của phần hỏng.
 *
 * Ảnh BẮT BUỘC (`avatarRequired`) và không có nút xoá: với chủ xe cá nhân nó là ảnh khách thấy.
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
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const updateMe = useUpdateMyProfile();
  const updateShop = useUpdateShopProfile();

  const resolver = useValidationResolver<OwnerAccountProfileValues>(
    ownerAccountProfileSchema,
    'Account.validation',
  );
  /*
   * `values` (không phải `defaultValues`): sau khi lưu, hai query trả bản mới và form theo — nếu
   * không, nút Huỷ sẽ mời hoàn tác thứ đã lưu xong.
   */
  const { control, handleSubmit, reset, formState } = useForm<OwnerAccountProfileValues>({
    resolver,
    values: ownerInfoValuesOf(profile, shop),
    resetOptions: { keepDirtyValues: true },
  });
  // Theo dõi để nút Lưu đọc đúng trạng thái khi chỉ đổi ảnh (ô ảnh không qua bàn phím).
  useWatch({ control, name: 'avatarUrl' });
  const saving = updateMe.isPending || updateShop.isPending;
  const dirty = formState.isDirty;

  const submit = handleSubmit(async (values) => {
    if (saving) return;
    const saved = ownerInfoValuesOf(profile, shop);
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
    if (failed) toast.showError(errorMessage(failed.reason));
    else toast.showSuccess(t('saved'));
  });

  return (
    <YStack gap={space.md}>
      <ImageUploadField
        control={control}
        name="avatarUrl"
        label={tAccount('avatarUrl')}
        presign={uploadsApi.avatar}
        hint={tAccount('avatarHelp')}
        required
        removable={false}
        disabled={saving}
      />
      <TextField
        control={control}
        name="displayName"
        label={tAccount('displayName')}
        placeholder={tAccount('displayNamePlaceholder')}
        icon="person-outline"
        autoComplete="name"
        required
        editable={!saving}
      />
      <TextField
        control={control}
        name="bio"
        label={t('bio')}
        placeholder={t('bioPlaceholder')}
        multiline
        rows={4}
        maxLength={BIO_MAX}
        editable={!saving && canEditBio}
      />
      <XStack gap={space.sm}>
        {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
        {dirty ? (
          <YStack flexShrink={0}>
            <Button
              label={tCommon('cancel')}
              variant="secondary"
              disabled={saving}
              onPress={() => reset()}
            />
          </YStack>
        ) : null}
        <YStack f={1}>
          <Button
            label={tCommon('saveChanges')}
            icon="save-outline"
            loading={saving}
            disabled={!dirty}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
