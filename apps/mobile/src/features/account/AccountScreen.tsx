import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DataRow } from '@/components/ui/DataRow';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser, useLogout } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ShopEntryCard } from '@/features/shell/ShopEntryCard';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { ROUTES } from '@/navigation/routes';
import { useMyProfile, useUpdateMyProfile } from './hooks/use-account';
import type { UserProfile } from './api';

/**
 * Tab "Tài khoản" (CUS-04) + đăng xuất (AUTH-07) — bản native của `AccountView` bên web.
 *
 * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: hai endpoint trả hai thứ khác nhau, và chỉ
 * cái đầu có `phone` + `phoneVerified` — hai trường màn này phải hiện.
 *
 * Cổng phiên nằm ở `app/(tabs)/account.tsx` (`RequireSession`). Phiên chết GIỮA LÚC màn đang mở
 * cũng được cổng đó bắt.
 */
export function AccountScreen() {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const profile = useMyProfile();

  if (profile.isLoading) {
    return (
      <Screen edges={['left', 'right']}>
        <ProfileSkeleton />
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen edges={['left', 'right']} scroll={false}>
        <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  return (
    <AccountBody
      profile={profile.data}
      refreshing={profile.isRefetching}
      refetch={() => void profile.refetch()}
      t={t}
      tCommon={tCommon}
    />
  );
}

function AccountBody({
  profile,
  refreshing,
  refetch,
  t,
  tCommon,
}: {
  profile: UserProfile;
  refreshing: boolean;
  refetch: () => void;
  t: ReturnType<typeof useTranslations<'Account'>>;
  tCommon: ReturnType<typeof useTranslations<'Common.actions'>>;
}) {
  const tNav = useTranslations('Navigation.public');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const { tenant } = useTenantScope();
  const { data: session } = useCurrentUser();
  const logout = useLogout();
  const update = useUpdateMyProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  /*
   * Kéo-xuống-làm-mới. ĐANG SỬA thì bỏ qua, chứ không gỡ `onRefresh`: có/không prop đó là đổi
   * cây view gốc của `ScrollView` (xem chú thích ở `Screen`), và làm thế giữa lúc gõ là bàn phím
   * sập. Bỏ qua vì hồ sơ mới về sẽ `reset()` form ngay bên dưới — tức nuốt mất thứ đang gõ dở.
   */
  const onRefresh = () => {
    if (isEditing) return;
    refetch();
  };

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

  // Hồ sơ được refetch (đổi ở thiết bị khác, invalidate sau khi lưu) → nạp lại giá trị vào form,
  // nếu không người dùng sẽ nhìn thấy dữ liệu cũ trong ô nhập.
  useEffect(() => {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [profile.displayName, profile.avatarUrl, reset]);

  // `useWatch` thay cho `watch()`: chỉ phần này render lại khi hai field đó đổi.
  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });

  /*
   * Vai NỀN TẢNG thắng vai gian hàng — và phải đứng trước, vì một `platform_admin` KHÔNG thuộc
   * gian hàng nào vẫn tới được màn này (`ScopeGuard` cho họ qua bằng `platformRole`). Bỏ nhánh
   * này là họ không thấy vai của mình ở đâu cả.
   */
  const roleLabel = session?.platformRole
    ? domainLabel('platformRole', session.platformRole)
    : tenant
      ? domainLabel('tenantRole', tenant.roleKey)
      : null;

  const submit = handleSubmit((values) => {
    update.mutate(
      {
        displayName: values.displayName,
        ...(values.avatarUrl ? { avatarUrl: values.avatarUrl } : {}),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          setIsEditing(false);
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  /** Huỷ chỉnh sửa trả lại ĐÚNG dữ liệu gốc — không giữ lại thứ vừa gõ dở. */
  function cancelEditing() {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
    setIsEditing(false);
  }

  return (
    // Màn gốc của tab: thanh tab đã nuốt `insets.bottom` — xem ghi chú ở `TripsScreen`.
    <Screen edges={['left', 'right']} refreshing={refreshing} onRefresh={onRefresh}>
      <YStack gap={space.lg}>
        <Card>
          <YStack gap={space.md}>
            <XStack ai="flex-start" gap={space.sm}>
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                  {t('profile.eyebrow')}
                </Text>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={2}>
                  {t('profile.title')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('profile.description')}
                </Text>
              </YStack>
              {!isEditing ? (
                <Button
                  label={t('profile.edit')}
                  variant="secondary"
                  size="sm"
                  block={false}
                  icon="create-outline"
                  disabled={update.isPending}
                  onPress={() => setIsEditing(true)}
                />
              ) : null}
            </XStack>

            <XStack ai="center" gap={space.md}>
              <Avatar
                name={displayName || profile.displayName}
                url={avatarUrl ?? null}
                size={64}
              />
              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.h3}
                  fow={fontWeight.bold}
                  numberOfLines={2}
                >
                  {displayName || profile.displayName}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {t('profile.accountLabel')}
                </Text>
              </YStack>
            </XStack>

            {roleLabel || tenant ? (
              <XStack gap={space.xs} flexWrap="wrap">
                {roleLabel ? <Chip label={roleLabel} icon="shield-checkmark-outline" /> : null}
                {tenant ? <Chip label={tenant.name} icon="storefront-outline" /> : null}
              </XStack>
            ) : null}

            {/*
              Email và SĐT CHỈ ĐỌC: chúng là khoá nhận diện, đổi phải đi qua một luồng xác thực
              riêng (chưa có). Đưa chúng vào form là dựng một chức năng giả — cùng lý do web để
              read-only, và cùng lý do `UpdateMeDto` chỉ nhận hai trường.
            */}
            <DataRow label={t('profile.email')} value={profile.email ?? t('noEmail')} />
            <XStack ai="center" gap={space.sm}>
              <YStack f={1} minWidth={0}>
                <DataRow label={t('profile.phone')} value={profile.phone ?? t('noPhone')} />
              </YStack>
              {profile.phone ? (
                <StatusBadge
                  label={profile.phoneVerified ? t('verified') : t('profile.unverified')}
                  color={profile.phoneVerified ? STATUS_COLOR.SUCCESS : STATUS_COLOR.WARNING}
                  size="sm"
                />
              ) : null}
            </XStack>

            {isEditing ? (
              <YStack gap={space.md}>
                <TextField
                  control={control}
                  name="displayName"
                  label={t('displayName')}
                  placeholder={t('displayNamePlaceholder')}
                  icon="person-outline"
                  autoComplete="name"
                  editable={!update.isPending}
                  required
                />
                <TextField
                  control={control}
                  name="avatarUrl"
                  label={t('avatarUrl')}
                  placeholder={t('avatarUrlPlaceholder')}
                  autoCapitalize="none"
                  keyboardType="url"
                  editable={!update.isPending}
                />
                <Button
                  label={tCommon('saveChanges')}
                  loading={update.isPending}
                  disabled={!formState.isDirty && !update.isPending}
                  onPress={() => void submit()}
                />
                <Button
                  label={tCommon('cancel')}
                  variant="ghost"
                  disabled={update.isPending}
                  onPress={cancelEditing}
                />
              </YStack>
            ) : null}

            {/* Khối giải thích vì sao hai trường trên khoá — y hệt `securityNote` của web. */}
            <XStack ai="flex-start" gap={space.sm}>
              <Ionicons name="lock-closed-outline" size={iconSize.md} color={colors.textMuted} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('profile.securityTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('profile.securityDescription')}
                </Text>
              </YStack>
            </XStack>
          </YStack>
        </Card>

        <ShopEntryCard />

        {/* Đổi ngôn ngữ là chức năng của VỎ app native — web đổi ở nơi khác, không phải mất mát. */}
        <Card lift="flat" padded={false}>
          <XStack ai="center" jc="space-between" gap={space.sm} p={space.md}>
            <XStack ai="center" gap={space.sm} f={1} minWidth={0}>
              <Ionicons name="language-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text col={colors.text} fos={fontSize.body} numberOfLines={1}>
                {t('title')}
              </Text>
            </XStack>
            <LocaleSwitcher />
          </XStack>
        </Card>

        <Button
          label={tNav('logout')}
          variant="danger"
          icon="log-out-outline"
          loading={logout.isPending}
          onPress={() => setConfirmingLogout(true)}
        />
      </YStack>

      {/* Đăng xuất là thao tác không hỏi lại được sau khi làm — hỏi trước, bằng hộp của app. */}
      <AlertDialog
        open={confirmingLogout}
        title={tNav('logout')}
        message={t('logoutConfirm')}
        confirmLabel={tNav('logout')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={logout.isPending}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace(ROUTES.explore.home()),
          })
        }
      />
    </Screen>
  );
}
