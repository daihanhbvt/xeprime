import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IMAGE_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { uploadsApi } from '@/api/uploads/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { LineIcon } from '@/components/icons/LineIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { TextField } from '@/components/ui/TextField';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { isCommissionOwner as isCommissionOwnerOf } from '@/features/shell/partner-track';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorMessage } from '@/lib/get-error-message';
import { ROUTES } from '@/navigation/routes';
import { FONT_FAMILY } from '@/theme/fonts';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, market, radius, space, typeScale } from '@/theme/tokens';
import type { UserProfile } from '../api';
import { useUpdateMyProfile } from '../hooks/use-account';
import { useAccountIdentityLabel } from '../use-account-identity-label';

const COVER = require('../../../../assets/images/partner/account-profile-cover.webp') as number;
const AVATAR_MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/** Figma `24231:108387` "Vehicle Summary": ảnh nền cao 100, avatar 72 viền trắng 2, nút máy ảnh 22. */
const COVER_HEIGHT = 100;
const AVATAR = 72;
const AVATAR_RING = 2;
const CAMERA_BADGE = 22;
const CAMERA_ICON = 12;
const DOT = 6;
const GAP_12 = 12;
const GAP_6 = 6;
const BADGE_PAD_Y = 2;
const PAD_Y_12 = 12;

/**
 * Hồ sơ CON NGƯỜI trên trang "Tài khoản và bảo mật" của app Partner - Figma `24231:108387`, bản
 * native của web `AccountProfileCard` (cùng luật, cùng câu chữ).
 *
 *  - Đầu thẻ: ảnh nền mờ dần, avatar + nút máy ảnh (mở tấm "Tải lên ảnh đại diện": Chụp ảnh / Chọn
 *    từ thư viện, có ảnh thì thêm "Xoá ảnh" - giữ lối gỡ ảnh của web), họ tên, viên vai trò, dòng
 *    gian hàng. App Partner không nhắc "gói": dòng gian hàng là tên gian hàng + nhãn trung tính
 *    (người dùng chốt 25/11/2026); chủ xe tuyến hoa hồng không có dòng này, như web.
 *  - Ô "Họ & tên hiển thị" luôn mở để sửa (bút chì chỉ là dấu hiệu, như Figma).
 *  - Ảnh mới và tên mới chỉ ghi khi bấm "Lưu thay đổi"; chưa sửa gì thì nút mờ, sửa rồi mới có "Huỷ".
 */
export function PartnerProfileCard({ profile }: { profile: UserProfile }) {
  const colors = useColors();
  const t = useTranslations('Account.securityPage.profile');
  const tAccount = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const tUpload = useTranslations('Common.components.imageUpload');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  const canOpenShopSettings = useShopSettingsAccess();
  const commissionOwner = isCommissionOwnerOf(user);
  const update = useUpdateMyProfile();

  const resolver = useValidationResolver<AccountProfileValues>(accountProfileSchema, 'Account.validation');
  const { control, handleSubmit, reset, setValue, formState } = useForm<AccountProfileValues>({
    resolver,
    defaultValues: { displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null },
  });

  // Hồ sơ được tải lại (đổi ở thiết bị khác, sau khi lưu) → nạp lại form, không để ô hiện dữ liệu cũ.
  useEffect(() => {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [profile.displayName, profile.avatarUrl, reset]);

  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });
  const previewName = displayName?.trim() || profile.displayName;
  const dirty = formState.isDirty;

  const setAvatar = useCallback(
    (url: string | null) => setValue('avatarUrl', url, { shouldDirty: true, shouldValidate: true }),
    [setValue],
  );
  const upload = useImageUpload({
    title: t('avatarSheetTitle'),
    hint: t('avatarSheetHint', { max: AVATAR_MAX_MB }),
    presign: uploadsApi.avatar,
    onUploaded: (urls) => {
      const url = urls[0];
      if (url) setAvatar(url);
    },
    ...(avatarUrl ? { onRemove: () => setAvatar(null) } : {}),
  });
  const locked = update.isPending || upload.busy;

  const submit = handleSubmit((values) => {
    update.mutate(
      // `null` khi gỡ ảnh: `undefined` nghĩa là "không đụng tới" và nút Xoá ảnh sẽ im lặng.
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? null },
      {
        onSuccess: () => toast.showSuccess(tAccount('saved')),
        onError: (err) => toast.showError(getErrorMessage(err)),
      },
    );
  });

  const revert = useCallback(
    () => reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null }),
    [profile.displayName, profile.avatarUrl, reset],
  );

  const workspace = useMemo(
    () => (user?.tenant && !commissionOwner ? [user.tenant.name, t('workspacePartner')] : []),
    [user?.tenant, commissionOwner, t],
  );

  const strong = useCallback(
    (chunks: ReactNode) => (
      <Text
        col={colors.text}
        fontFamily={FONT_FAMILY.semibold}
        fow={fontWeight.semibold}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
      >
        {chunks}
      </Text>
    ),
    [colors.text],
  );

  return (
    <YStack bg={colors.surface} p={space.md} gap={space.md} ov="hidden" style={elevation.card}>
      {/* Ảnh nền mờ dần xuống trắng (Figma "Mask group") - trang trí, không đọc ra. */}
      <YStack pos="absolute" t={0} l={0} r={0} h={COVER_HEIGHT} pointerEvents="none" accessible={false}>
        <Image source={COVER} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
        <LinearGradient colors={['transparent', colors.surface]} style={StyleSheet.absoluteFill} />
      </YStack>

      <XStack ai="center" gap={GAP_12}>
        <YStack w={AVATAR} h={AVATAR}>
          {/* Bóng ở lớp ngoài, cắt tròn ở lớp trong - iOS bỏ bóng của view có `overflow: hidden`. */}
          <YStack br={radius.pill} style={elevation.avatar}>
            <YStack br={radius.pill} bw={AVATAR_RING} bc={colors.surface} ov="hidden">
              <Avatar name={previewName} url={avatarUrl ?? null} size={AVATAR - AVATAR_RING * 2} />
            </YStack>
          </YStack>
          <Pressable
            onPress={upload.open}
            disabled={locked}
            accessibilityRole="button"
            accessibilityLabel={upload.busy ? tUpload('upload') : t('changeAvatar')}
            accessibilityState={{ disabled: locked, busy: upload.busy }}
            hitSlop={space.sm}
            style={styles.cameraPos}
          >
            <YStack
              w={CAMERA_BADGE}
              h={CAMERA_BADGE}
              br={radius.pill}
              bg={colors.brandShape}
              bw={1}
              bc={colors.surface}
              ai="center"
              jc="center"
            >
              {upload.busy ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <LineIcon name="camera-1" size={CAMERA_ICON} color={colors.onPrimary} />
              )}
            </YStack>
          </Pressable>
        </YStack>

        <YStack f={1} minWidth={0} gap={space.sm}>
          <XStack ai="center" gap={GAP_12} flexWrap="wrap">
            <Text
              col={colors.text}
              fos={typeScale.lead.fontSize}
              lh={typeScale.lead.lineHeight}
              fow={fontWeight.semibold}
              flexShrink={1}
              numberOfLines={1}
            >
              {previewName}
            </Text>
            {user ? (
              <XStack
                ai="center"
                gap={GAP_6}
                px={space.sm}
                py={BADGE_PAD_Y}
                br={radius.card}
                bg={market.inverse}
                bw={1}
                bc={market.glow}
              >
                <YStack w={DOT} h={DOT} br={radius.pill} bg={colors.brandShape} />
                <Text
                  col={colors.brandShape}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {identityLabel(user)}
                </Text>
              </XStack>
            ) : null}
          </XStack>
          {workspace.length > 0 ? (
            <XStack ai="center" gap={space.sm} flexWrap="wrap">
              {workspace.map((item, index) => (
                <XStack key={`${index}-${item}`} ai="center" gap={space.sm} flexShrink={1}>
                  {index > 0 ? <YStack w={DOT} h={DOT} br={radius.pill} bg={colors.textPlaceholder} /> : null}
                  <Text
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                    flexShrink={1}
                  >
                    {item}
                  </Text>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </YStack>
      </XStack>

      <YStack h={1} bg={colors.border} />

      <TextField
        control={control}
        name="displayName"
        label={t('displayName')}
        placeholder={t('displayNamePlaceholder')}
        autoComplete="name"
        editable={!update.isPending}
        suffix={<LineIcon name="edit" size={20} color={colors.placeholder} />}
      />

      <YStack bg={colors.background} br={radius.control} p={GAP_12} gap={space.sm}>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t.rich('avatarHelp', { max: AVATAR_MAX_MB, strong })}
        </Text>
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t.rich(commissionOwner ? 'personalStorefront' : 'notShop', { strong })}
        </Text>
        {commissionOwner || canOpenShopSettings ? (
          <XStack>
            <LinkArrow
              label={commissionOwner ? t('ownerProfileLink') : t('shopSettingsLink')}
              onPress={() => navigateOnce(ROUTES.manage.shop())}
            />
          </XStack>
        ) : null}
      </YStack>

      <XStack gap={GAP_12} pt={PAD_Y_12}>
        {/* Chưa sửa gì thì không có gì để huỷ - nút không tồn tại, chứ không phải mờ đi (như web). */}
        {dirty ? (
          <YStack flexShrink={0}>
            <Button label={tCommon('cancel')} variant="neutral" disabled={update.isPending} onPress={revert} />
          </YStack>
        ) : null}
        <YStack f={1}>
          <Button
            label={tCommon('saveChanges')}
            loading={update.isPending}
            disabled={!dirty || upload.busy}
            onPress={() => void submit()}
          />
        </YStack>
      </XStack>

      {upload.sheet}
    </YStack>
  );
}

const styles = StyleSheet.create({
  cameraPos: { position: 'absolute', left: AVATAR - CAMERA_BADGE, top: AVATAR - CAMERA_BADGE },
});
