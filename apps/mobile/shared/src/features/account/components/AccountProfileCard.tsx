import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useController, useForm, type Control } from 'react-hook-form';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IMAGE_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { uploadsApi } from '@/api/uploads/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { WalletBalancePill } from '@/features/wallet/components/WalletBalancePill';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { AccountPanel } from './AccountPanel';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../api';
import { useUpdateMyProfile } from '../hooks/use-account';
import { useAccountIdentityLabel } from '../use-account-identity-label';
import { ContactVerifySheet } from './ContactVerifySheet';

/** Trần dung lượng ảnh hiện trong gợi ý — đọc từ hằng của server, không gõ tay một con số. */
const AVATAR_MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));
/** `--xp-space-12` — khe giữa các hàng liên lạc và trong ghi chú đăng nhập (ngoài thang 4·8·16). */
const GAP_12 = space.sm + space.xs;
/** Cỡ biểu tượng 20px của web (`.detailIcon`, `.securityIcon`). */
const ICON_20 = 20;
/** Avatar 64 của thẻ hồ sơ web. */
const AVATAR_SIZE = 64;

/**
 * Thẻ "Thông tin tài khoản" của tab Tài khoản KHÁCH — bản native của `ProfileCard` trong
 * `AccountView` web (design Account / Profile, Figma `21621:65695`), bố cục ≤640px:
 *
 *   tiêu đề + mô tả (gạch chân như `AccountPanel`) → ảnh + tên + nhãn danh tính → hai hàng liên
 *   lạc (email, SĐT; viên Đã xác minh / Chưa xác minh; "Thay đổi"/"Thêm") → ghi chú đăng nhập nền
 *   xanh → nút "Cập nhật thông tin" trọn bề ngang mở tấm sửa ảnh + họ tên (hộp
 *   `AccountProfileEditModal` web: Huỷ · Xác nhận).
 *
 * Tách khỏi `PersonalProfileCard` vì thẻ đó còn phục vụ app Partner (`ManageAccountScreen`,
 * `OwnerProfileScreen`) với bố cục khác của khu quản lý — đổi nó theo design khách là kéo lệch
 * khu kia.
 *
 * `editable` giữ luật cũ của tab này (ADR 0038 điều 4): tài khoản dùng khu quản lý thì thẻ chỉ để
 * xem — mất nút cập nhật và lối đổi email/SĐT.
 */
export function AccountProfileCard({
  profile,
  editable,
}: {
  profile: UserProfile;
  editable: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Account');
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  const [editing, setEditing] = useState(false);
  /** Kênh liên lạc đang được đổi — `null` là không có tấm trượt nào mở. */
  const [editingContact, setEditingContact] = useState<ContactChannel | null>(null);

  return (
    <>
      {/*
        Khung `AccountPanel` web (bo 16, viền `color-border`, đệm 16, gạch dưới đầu thẻ).
        Lối tắt SỐ DƯ là `extra` của đầu thẻ — màn hẹp xuống dòng trọn bề ngang dưới câu mô tả. Một
        con số, mở Quản lý thanh toán; sổ và lệnh rút ở đúng một chỗ.
      */}
      <AccountPanel
        title={t('profile.title')}
        subtitle={t('profile.description')}
        extra={<WalletBalancePill />}
      >
        {/* Ảnh cạnh tên — web ≤900px xếp `summary` thành hàng ngang. */}
        <XStack ai="center" gap={GAP_12} accessibilityLabel={t('profile.accountLabel')}>
          <Avatar name={profile.displayName} url={profile.avatarUrl ?? null} size={AVATAR_SIZE} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.lead} lh={30} fow={fontWeight.semibold}>
              {profile.displayName}
            </Text>
            {/* Nhãn danh tính đọc TUYẾN, không đọc bảng vai — cùng nguồn với menu. */}
            <Text col={colors.placeholder} fos={fontSize.body}>
              {identityLabel(user)}
            </Text>
          </YStack>
        </XStack>

        <YStack gap={GAP_12}>
          <ContactRow
            icon="mail-outline"
            label={t('profile.email')}
            value={profile.email}
            emptyLabel={t('noEmail')}
            verified={profile.emailVerified}
            {...(editable ? { onEdit: () => setEditingContact(CONTACT_CHANNEL.EMAIL) } : {})}
          />
          <ContactRow
            icon="call-outline"
            label={t('profile.phone')}
            value={profile.phone}
            emptyLabel={t('noPhone')}
            verified={profile.phoneVerified}
            {...(editable ? { onEdit: () => setEditingContact(CONTACT_CHANNEL.PHONE) } : {})}
          />
        </YStack>

        <XStack
          ai="flex-start"
          gap={GAP_12}
          p={space.md}
          br={radius.control}
          bg={colors.infoSurface}
        >
          <YStack pt={1}>
            <Ionicons name="shield-checkmark-outline" size={ICON_20} color={colors.infoStrong} />
          </YStack>
          <YStack f={1} minWidth={0} gap={space.xs}>
            <Text col={colors.infoStrong} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('profile.securityTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('profile.securityDescription')}
            </Text>
          </YStack>
        </XStack>

        {editable ? (
          <Button
            label={t('profile.update')}
            icon="create-outline"
            variant="secondary"
            onPress={() => setEditing(true)}
          />
        ) : null}
      </AccountPanel>

      {editable ? (
        <ProfileEditSheet profile={profile} open={editing} onClose={() => setEditing(false)} />
      ) : null}

      {/*
        `key` theo kênh: tấm trượt giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở email
        ngay sau khi vừa đóng SĐT phải là một component mới — như `key` của web.
      */}
      {editingContact ? (
        <ContactVerifySheet
          key={editingContact}
          channel={editingContact}
          open
          onClose={() => setEditingContact(null)}
          current={editingContact === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
        />
      ) : null}
    </>
  );
}

/**
 * Tấm "Cập nhật thông tin" — bản native của `AccountProfileEditModal` web: ảnh đại diện (chọn từ
 * máy → presign → R2, như mọi ảnh khác) + họ tên; chân tấm Huỷ · Xác nhận, Xác nhận chỉ bật khi
 * có thay đổi. Đang lưu thì không đóng ngang (kết quả về sau sẽ toast cho một tấm đã biến mất).
 */
function ProfileEditSheet({
  profile,
  open,
  onClose,
}: {
  profile: UserProfile;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  // Lỗi đọc theo MÃ (ADR 0012) như `use-account-profile-form` web — không hiện câu tiếng Việt của server.
  const errorMessage = useErrorMessage();
  const update = useUpdateMyProfile();
  const saving = update.isPending;

  const resolver = useValidationResolver<AccountProfileValues>(
    accountProfileSchema,
    'Account.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<AccountProfileValues>({
    resolver,
    defaultValues: { displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null },
  });

  // Mở lại tấm (hoặc hồ sơ vừa được refetch) ⇒ nạp lại đúng dữ liệu gốc, không giữ thứ gõ dở.
  useEffect(() => {
    if (open) reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [open, profile.displayName, profile.avatarUrl, reset]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submit = handleSubmit((values) => {
    if (saving) return;
    update.mutate(
      // `null` (không phải `undefined`) khi gỡ ảnh: `undefined` là "không đụng tới".
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? null },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('profile.update')}
      dismissable={!saving}
      footer={
        <XStack gap={space.sm}>
          <YStack f={1}>
            <Button
              label={tCommon('cancel')}
              variant="secondary"
              disabled={saving}
              onPress={close}
            />
          </YStack>
          <YStack f={1}>
            <Button
              label={tCommon('confirm')}
              variant="gradient"
              loading={saving}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      }
    >
      {/* `.form` của `AccountProfileEditModal` web: ô ảnh trên, ô họ tên dưới, khe `space-md`. */}
      <YStack gap={space.md}>
        <ProfileAvatarPicker
          control={control}
          fallbackName={profile.displayName}
          disabled={saving}
        />
        {/*
          Ô họ tên — `TextField` web (AntD Input large, nhãn TRÊN ô, tiền tố `UserOutlined`). Khung ô
          là `FieldShell` dùng chung của app: viền 1px `color-border-input`, bo `border-radius` (10,
          = `borderRadiusLG` của AntD), đổi MÀU viền khi focus/lỗi (không đổi độ dày).
        */}
        <TextField
          control={control}
          name="displayName"
          label={t('profileEdit.displayName')}
          placeholder={t('displayNamePlaceholder')}
          icon="person-outline"
          autoComplete="name"
          editable={!saving}
        />
      </YStack>
    </BottomSheet>
  );
}

/**
 * Một hàng liên lạc — `.detailRow` web ≤640px: nền `color-bg`, bo `control`, biểu tượng 20 xám,
 * nhãn trên giá trị, viên trạng thái xác minh cạnh giá trị, "Thay đổi"/"Thêm" chữ vàng sát phải.
 * Viên trạng thái luôn hiện khi ĐÃ có giá trị, kể cả chưa xác minh — đó là việc còn phải làm.
 */
function ContactRow({
  icon,
  label,
  value,
  emptyLabel,
  verified,
  onEdit,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
  onEdit?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Account');

  return (
    <XStack
      ai="flex-start"
      gap={GAP_12}
      py={GAP_12}
      px={space.md}
      br={radius.control}
      bg={colors.background}
    >
      <YStack pt={1}>
        <Ionicons name={icon} size={ICON_20} color={colors.textMuted} />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.placeholder} fos={fontSize.body}>
          {label}
        </Text>
        <XStack ai="center" flexWrap="wrap" columnGap={space.sm} rowGap={space.xs}>
          {value ? (
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.medium} flexShrink={1}>
              {value}
            </Text>
          ) : (
            <Text col={colors.placeholder} fos={fontSize.body} fontStyle="italic">
              {emptyLabel}
            </Text>
          )}
          {value ? <VerifyBadge verified={verified} /> : null}
        </XStack>
      </YStack>
      {onEdit ? (
        // `.detailAction` web: chữ vàng `color-primary`, cỡ body, đậm vừa — không viền, không nền.
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={
            value
              ? t('contact.changeAria', { field: label })
              : t('contact.addAria', { field: label })
          }
          hitSlop={space.sm}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        >
          <Text col={colors.primary} fos={fontSize.body} fow={fontWeight.semibold} py={space.xs}>
            {value ? t('contact.change') : t('contact.add')}
          </Text>
        </Pressable>
      ) : null}
    </XStack>
  );
}

/** Viên thuốc viền mảnh — đã xác minh: xanh; chưa: cam (`.badgeOk` / `.badgeTodo` web). */
function VerifyBadge({ verified }: { verified: boolean }) {
  const colors = useColors();
  const t = useTranslations('Account');

  return (
    <YStack
      px={space.sm}
      py={2}
      br={radius.pill}
      bw={1}
      bc={verified ? colors.successBorder : colors.warningBorder}
      bg={verified ? colors.successSurface : colors.warningSurface}
    >
      <Text
        col={verified ? colors.success : colors.warningStrong}
        fos={fontSize.body}
        fow={fontWeight.medium}
      >
        {verified ? t('verified') : t('profile.unverified')}
      </Text>
    </YStack>
  );
}

/** Ô ảnh vuông 100px — `.tile` của `ProfileAvatarPicker.module.css` web. */
const AVATAR_TILE = 100;
/** `--xp-border-radius-chip` (8) — bo của `.tile`. */
const TILE_RADIUS = toPx(XP_TOKENS['border-radius-chip']);
/** `line-height: 22px` của `.help` (body 14). */
const HELP_LINE_HEIGHT = 22;

/**
 * Ô ảnh đại diện của tấm "Cập nhật thông tin" — bản native của `ProfileAvatarPicker` web (Figma
 * `20063:65345`), bố cục `.root` hàng ngang, khe `space-md`:
 *
 *   - Ô ẢNH (`.tile`): vuông 100, viền 1px `color-border`, bo `border-radius-chip` (8), nền
 *     `color-primary-light`; chưa có ảnh thì chữ cái đầu `gold-deep` (`color-primary-active`) cỡ
 *     `font-size-h2` đậm bold. Chạm ô = chọn ảnh.
 *   - CỘT PHẢI (`.meta`, khe `space-sm`): có ảnh ⇒ "Ảnh hiện tại" (`.fileName`: body-lg semibold,
 *     `color-text-secondary`, một dòng) + nút xoá chữ đỏ chỉ có biểu tượng; chưa có ảnh ⇒ nút "Tải
 *     ảnh lên" viền mặc định có biểu tượng mây. Dưới đó là gợi ý định dạng (`.help`: body 14 / 22,
 *     nghiêng, `color-text-tertiary`, giữ xuống dòng) và lỗi trường (`.error`: body-sm, `color-error`).
 *
 * Luồng tải là `useImageUpload` dùng chung (presign → R2) — chỉ bố cục khác `ImageUploadField`, như
 * web tách khỏi `ImageUploadField` của nó. Web hiện TÊN FILE vừa chọn; ảnh chọn từ thư viện máy
 * không có tên file đọc được cho người dùng, nên app luôn ghi "Ảnh hiện tại".
 */
function ProfileAvatarPicker({
  control,
  fallbackName,
  disabled,
}: {
  control: Control<AccountProfileValues>;
  fallbackName: string;
  disabled: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Account.profileEdit');
  const tUpload = useTranslations('Common.components.imageUpload');
  const { field, fieldState } = useController({ control, name: 'avatarUrl' });
  const upload = useImageUpload({
    title: t('pick'),
    hint: t('avatarHelp', { max: AVATAR_MAX_MB }),
    presign: uploadsApi.avatar,
    onUploaded: (urls) => field.onChange(urls[0] ?? null),
  });
  const url = field.value || null;
  const locked = disabled || upload.busy;
  const initial = fallbackName.trim().charAt(0).toLocaleUpperCase() || '?';

  return (
    <XStack ai="center" gap={space.md}>
      <Pressable
        onPress={upload.open}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={t('pick')}
        accessibilityState={{ disabled: locked, busy: upload.busy }}
      >
        <YStack
          w={AVATAR_TILE}
          h={AVATAR_TILE}
          br={TILE_RADIUS}
          bw={1}
          bc={colors.border}
          bg={colors.primaryLight}
          ov="hidden"
          ai="center"
          jc="center"
        >
          {url ? (
            <Image
              source={{ uri: url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={tUpload('alt')}
            />
          ) : (
            <Text col={colors.primaryActive} fos={fontSize.h2} fow={fontWeight.bold}>
              {initial}
            </Text>
          )}
          {/*
            `.progress` web: lớp `color-bg-container` 80% đè lên ô trong lúc tải, để vòng tiến độ
            đọc được trên mọi ảnh. Lớp mờ và vòng quay là hai lớp riêng — `opacity` trên một lớp
            chung sẽ làm mờ luôn vòng quay.
          */}
          {upload.busy ? (
            <>
              <YStack style={StyleSheet.absoluteFill} bg={colors.surface} opacity={0.8} />
              <ActivityIndicator color={colors.primaryActive} />
            </>
          ) : null}
        </YStack>
      </Pressable>

      <YStack f={1} minWidth={0} gap={space.sm}>
        {url ? (
          <XStack ai="center" gap={GAP_12}>
            <Text
              f={1}
              col={colors.textMuted}
              fos={fontSize.bodyLg}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {t('currentPhoto')}
            </Text>
            {/* Nút `type="text" danger` chỉ có biểu tượng thùng rác của web. */}
            <Pressable
              onPress={() => field.onChange(null)}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel={t('remove')}
              hitSlop={space.sm}
            >
              <Ionicons name="trash-outline" size={iconSize.md} color={colors.danger} />
            </Pressable>
          </XStack>
        ) : (
          <XStack>
            <Button
              label={tUpload('upload')}
              icon="cloud-upload-outline"
              variant="secondary"
              size="sm"
              loading={upload.busy}
              disabled={locked}
              onPress={upload.open}
            />
          </XStack>
        )}
        <Text col={colors.placeholder} fos={fontSize.body} lh={HELP_LINE_HEIGHT} fontStyle="italic">
          {t('avatarHelp', { max: AVATAR_MAX_MB })}
        </Text>
        {fieldState.error?.message ? (
          <Text col={colors.danger} fos={fontSize.bodySm} accessibilityRole="alert">
            {fieldState.error.message}
          </Text>
        ) : null}
      </YStack>
      {upload.sheet}
    </XStack>
  );
}
