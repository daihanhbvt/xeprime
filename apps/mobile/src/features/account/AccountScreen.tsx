import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ShopEntryCard } from '@/features/shell/ShopEntryCard';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { uploadsApi } from '@/api/uploads/api';
import { AccountNav } from './components/AccountNav';
import { ContactVerifySheet } from './components/ContactVerifySheet';
import { useMyProfile, useUpdateMyProfile } from './hooks/use-account';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from './api';

/**
 * Tab "Tài khoản" (CUS-04) — bản native của trang `/account` bên web.
 *
 * THỨ TỰ KHỐI:
 *
 *  1. thẻ hồ sơ (`ProfileForm` = `AccountView.ProfileForm`);
 *  2. điều hướng tài khoản (`AccountNav` = `AccountSidebar`, kèm Đăng xuất ở cuối) — web ở
 *     ≤900px xếp menu LÊN TRÊN, app cố ý để DƯỚI thẻ hồ sơ (người dùng chốt 15/09/2026): mở tab
 *     Tài khoản là muốn thấy mình là ai trước, rồi mới tới danh sách lối đi;
 *  3. thẻ cửa vào gian hàng (`ShopEntryCard`).
 *
 * KHÔNG có bộ đổi ngôn ngữ ở cuối màn (gỡ 15/09/2026): `LocaleSwitcher` đã nằm ngay trên thanh
 * đầu màn (`HeaderActions`), nên thẻ ở chân trang là lối vào THỨ HAI cho cùng một công tắc —
 * người dùng phải đọc hết màn mới biết hai chỗ đó là một.
 *
 * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: hai endpoint trả hai thứ khác nhau, và chỉ
 * cái đầu có `phone` + `phoneVerified` — hai trường màn này phải hiện.
 *
 * Cổng phiên nằm ở `app/(tabs)/account.tsx` (`RequireSession`). Phiên chết GIỮA LÚC màn đang mở
 * cũng được cổng đó bắt.
 */
export function AccountScreen() {
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
    />
  );
}

function AccountBody({
  profile,
  refreshing,
  refetch,
}: {
  profile: UserProfile;
  refreshing: boolean;
  refetch: () => void;
}) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateMyProfile();

  const [isEditing, setIsEditing] = useState(false);
  /** Kênh liên lạc đang được đổi — `null` là không có tấm trượt nào mở. */
  const [editingContact, setEditingContact] = useState<ContactChannel | null>(null);

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

  const submit = handleSubmit((values) => {
    update.mutate(
      // `null` (không phải `undefined`) khi người dùng gỡ ảnh: `undefined` nghĩa là "không đụng
      // tới", nên gửi nó đi thì nút Xoá ảnh im lặng không làm gì.
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? null },
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
        {/*
          THẺ HỒ SƠ — đọc từ trên xuống theo đúng ba câu hỏi người ta mở tab này để hỏi: TÔI LÀ
          AI (khối nhận diện) → TÔI SỬA ĐƯỢC GÌ (tên + ảnh) → TÔI ĐĂNG NHẬP BẰNG GÌ (email/SĐT).

          Bản trước mở đầu bằng ba dòng tiêu đề và một nút chiếm trọn bề ngang, nên ảnh đại diện —
          thứ trả lời câu hỏi đầu tiên — bị đẩy xuống quá nửa màn hình đầu.
        */}
        <Card padded={false}>
          {/*
            Khối nhận diện nằm trên NỀN NHẠT chạy hết bề ngang thẻ: nó là phần "hero" của màn, và
            một nền riêng tách nó khỏi phần thao tác bên dưới mà không tốn thêm một nét kẻ.
          */}
          <YStack ai="center" gap={space.sm} px={space.md} py={space.lg} bg={colors.surfaceMuted}>
            <XStack
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={2}
              br={radius.pill}
              bg={colors.surface}
              bw={1}
              bc={colors.borderSubtle}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={iconSize.sm}
                color={colors.primaryActive}
              />
              <Text
                col={colors.primaryActive}
                fos={fontSize.label}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {t('profile.eyebrow')}
              </Text>
            </XStack>

            <Avatar name={displayName || profile.displayName} url={avatarUrl ?? null} size={96} />

            <YStack ai="center" gap={2}>
              <Text
                col={colors.text}
                fos={fontSize.h3}
                fow={fontWeight.bold}
                ta="center"
                numberOfLines={2}
              >
                {displayName || profile.displayName}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                {t('profile.accountLabel')}
              </Text>
            </YStack>
          </YStack>

          <YStack gap={space.md} p={space.md}>
            {/*
              Tiêu đề + mô tả đứng NGAY TRÊN nút sửa chứ không ở đỉnh thẻ nữa: hai câu đó nói về
              việc sửa tên và ảnh, nên chúng thuộc khối thao tác, không thuộc khối nhận diện.

              Đang sửa thì cả cụm nhường chỗ cho bảng sửa — bảng đó mang lại đúng tiêu đề và mô tả
              ấy, nên hiện hai lần là thừa.
            */}
            {!isEditing ? (
              <YStack gap={space.sm}>
                <YStack gap={2}>
                  <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                    {t('profile.title')}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('profile.description')}
                  </Text>
                </YStack>
                <Button
                  label={t('profile.edit')}
                  variant="secondary"
                  size="sm"
                  icon="create-outline"
                  disabled={update.isPending}
                  onPress={() => setIsEditing(true)}
                />
              </YStack>
            ) : (
              <YStack
                gap={space.md}
                p={space.md}
                br={radius.md}
                bg={colors.surfaceMuted}
                bw={1}
                bc={colors.borderSubtle}
              >
                <YStack gap={2}>
                  <XStack ai="center" gap={space.xs}>
                    <Ionicons name="create-outline" size={iconSize.sm} color={colors.primary} />
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                      {t('profile.title')}
                    </Text>
                  </XStack>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('profile.description')}
                  </Text>
                </YStack>
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
                {/*
                  Ảnh đại diện đi ĐÚNG đường của mọi ảnh khác trong sản phẩm: chọn từ máy →
                  presign → PUT thẳng lên R2 → field nhận URL công khai. Ô dán URL trước đây bắt
                  người dùng tự tìm một chỗ host ảnh, thứ gần như không ai làm — nên trên thực tế
                  ảnh đại diện là một trường chết.
                */}
                <ImageUploadField
                  control={control}
                  name="avatarUrl"
                  label={t('avatarUrl')}
                  presign={uploadsApi.avatar}
                  hint={t('avatarHelp')}
                  disabled={update.isPending}
                />
                <XStack gap={space.sm}>
                  <YStack flexShrink={0}>
                    <Button
                      label={tCommon('cancel')}
                      variant="ghost"
                      size="sm"
                      disabled={update.isPending}
                      onPress={cancelEditing}
                    />
                  </YStack>
                  <YStack f={1}>
                    <Button
                      label={tCommon('saveChanges')}
                      icon="checkmark-outline"
                      size="sm"
                      loading={update.isPending}
                      disabled={!formState.isDirty && !update.isPending}
                      onPress={() => void submit()}
                    />
                  </YStack>
                </XStack>
              </YStack>
            )}

            <YStack h={1} bg={colors.borderSubtle} />

            {/*
              Email và SĐT KHÔNG nằm trong form hồ sơ: chúng là định danh ĐĂNG NHẬP, nên đổi phải
              đi qua mã 6 số gửi tới địa chỉ/số MỚI (`ContactVerifySheet`). Đưa chúng vào cùng nút
              "Lưu thay đổi" là ghi một chuỗi mà không ai chứng minh được nó thuộc về người dùng.

              `securityTitle` nay là TIÊU ĐỀ của chính nhóm này — cùng kiểu tiêu đề nhóm mà
              `AccountNav` dùng — nên ghi chú màu xanh bên dưới không lặp lại câu đó lần thứ hai.
            */}
            <YStack gap={space.sm}>
              <Text
                col={colors.placeholder}
                fos={fontSize.meta}
                fow={fontWeight.semibold}
                letterSpacing={0.8}
              >
                {t('profile.securityTitle')}
              </Text>

              <YStack br={radius.md} bw={1} bc={colors.borderSubtle} ov="hidden">
                <ContactRow
                  icon="mail-outline"
                  label={t('profile.email')}
                  value={profile.email}
                  emptyLabel={t('noEmail')}
                  verified={profile.emailVerified}
                  onEdit={() => setEditingContact(CONTACT_CHANNEL.EMAIL)}
                />
                <YStack h={1} bg={colors.borderSubtle} />
                <ContactRow
                  icon="call-outline"
                  label={t('profile.phone')}
                  value={profile.phone}
                  emptyLabel={t('noPhone')}
                  verified={profile.phoneVerified}
                  onEdit={() => setEditingContact(CONTACT_CHANNEL.PHONE)}
                />
              </YStack>

              {/*
                Ghi chú giải thích vì sao đổi hai dòng trên lại cần một mã — `securityNote` của
                web, kể cả NỀN XANH (`--xp-color-info-bg`). Nền xám ở đây đọc ra như một ô bị vô
                hiệu hoá, chứ không phải một ghi chú.

                Khiên, không phải ổ khoá: từ 14/09 khối này không còn nói "hai trường bị khoá" mà
                nói "đổi được, nhưng cần mã xác thực". Ổ khoá mâu thuẫn với chính câu bên cạnh nó
                — web đổi icon cùng lúc với câu chữ.
              */}
              <XStack
                ai="flex-start"
                gap={space.sm}
                p={space.md}
                br={radius.md}
                bg={colors.infoSurface}
              >
                <YStack pt={1}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={iconSize.md}
                    color={colors.info}
                  />
                </YStack>
                <YStack f={1} minWidth={0}>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('profile.securityDescription')}
                  </Text>
                </YStack>
              </XStack>
            </YStack>
          </YStack>
        </Card>

        <AccountNav />

        <ShopEntryCard />
      </YStack>

      {/*
        `key` theo kênh: tấm trượt giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở
        email ngay sau khi vừa đóng SĐT phải là một component MỚI chứ không phải cùng một cái đổi
        prop — nếu không, bộ đếm gửi lại của lượt trước chạy tiếp sang lượt sau.
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
    </Screen>
  );
}

/**
 * Một dòng liên hệ: hình tròn + nhãn NẰM TRÊN giá trị, rồi tình trạng xác thực và lối vào để đổi.
 *
 * Không dùng bố cục nhãn-trái/giá-trị-phải của `DataRow`: cột nhãn hẹp (30%) làm "Số điện thoại"
 * vỡ xuống hai dòng và đẩy lệch cả hàng. Nhãn xếp trên giá trị thì không còn cột nào phải co lại.
 *
 * Tình trạng xác thực luôn hiện khi ĐÃ có giá trị, kể cả khi CHƯA xác thực: một tài khoản tạo
 * bằng email/mật khẩu có email nhưng chưa ai chứng minh hộp thư đó tồn tại, và người dùng cần
 * thấy khoảng cách đó để biết còn việc phải làm — không thấy thì họ tưởng mình đã xong.
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
  onEdit: () => void;
}) {
  const t = useTranslations('Account');

  return (
    <XStack ai="center" gap={space.sm} p={space.md}>
      <YStack w={32} h={32} br={radius.pill} bg={colors.surfaceMuted} ai="center" jc="center">
        <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
      </YStack>

      <YStack f={1} minWidth={0} gap={1}>
        <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
          {label}
        </Text>
        <XStack ai="center" gap={space.xs}>
          <Text
            col={value ? colors.text : colors.placeholder}
            fos={fontSize.bodySm}
            fow={fontWeight.medium}
            numberOfLines={1}
            flexShrink={1}
          >
            {value ?? emptyLabel}
          </Text>
          {/*
            Đã xác thực = một dấu tích tròn NHỎ, không phải viên nhãn chữ: hàng này đã có nhãn,
            giá trị và một nút; thêm một viên "Đã xác thực" nữa thì giá trị — thứ người ta đọc —
            bị ép xuống còn vài ký tự ở 360dp. Chưa xác thực thì mới cần CHỮ, vì đó là việc cần làm.
          */}
          {value && verified ? (
            <YStack
              w={16}
              h={16}
              br={radius.pill}
              bg={colors.success}
              ai="center"
              jc="center"
              accessibilityRole="image"
              accessibilityLabel={t('verified')}
            >
              <Ionicons name="checkmark" size={11} color={colors.textInverse} />
            </YStack>
          ) : null}
        </XStack>
        {value && !verified ? (
          <StatusBadge label={t('profile.unverified')} color={STATUS_COLOR.WARNING} size="sm" />
        ) : null}
      </YStack>

      <Button
        label={value ? t('contact.change') : t('contact.add')}
        variant="ghost"
        size="sm"
        block={false}
        icon={value ? 'create-outline' : 'add'}
        onPress={onEdit}
      />
    </XStack>
  );
}
