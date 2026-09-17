import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { Card } from '@/components/ui/Card';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { uploadsApi } from '@/api/uploads/api';
import type { AccountTrackInput } from '@xeprime/types';
import { AccountIdentityHero } from './AccountIdentityHero';
import { ContactVerifySheet } from './ContactVerifySheet';
import { useUpdateMyProfile } from '../hooks/use-account';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../api';

/** Đường kính hình tròn dẫn đầu một dòng liên hệ — cùng cỡ với đĩa của `IconDisc`. */
const DISC = 32;

/**
 * THẺ HỒ SƠ CON NGƯỜI — khối nhận diện, tên/ảnh, và thông tin đăng nhập.
 *
 * Đọc từ trên xuống theo đúng ba câu hỏi người ta mở nó để hỏi: TÔI LÀ AI (khối nhận diện) → TÔI
 * SỬA ĐƯỢC GÌ (tên + ảnh) → TÔI ĐĂNG NHẬP BẰNG GÌ (email/SĐT).
 *
 * ## Một thẻ, hai chỗ gọi, và chỉ MỘT chỗ sửa được
 *
 * `editable` quyết định thẻ có mang thao tác hay không, chứ không đổi nội dung:
 *
 *   `/manage/account` — `editable`: đây là nơi DUY NHẤT sửa hồ sơ con người (người dùng chốt
 *                       16/09/2026). Tên, ảnh, email, SĐT đều đổi ở đây.
 *   `/account`        — chỉ xem: tab Tài khoản là bảng danh tính + mục lục lối đi, không phải
 *                       một biểu mẫu. Hai bề mặt cùng cho sửa một thứ là hai chỗ phải sửa mỗi
 *                       lần đổi luật, và người dùng không đoán được cái nào là "thật".
 *
 * Một component chứ không hai bản gần giống nhau: khác biệt giữa hai chỗ gọi đúng bằng mấy cái
 * nút, còn luật hiển thị (dấu đã xác thực, chữ "Chưa xác thực", chỗ trống nói rõ là chưa có) thì
 * giống hệt — và đó mới là phần dễ lệch.
 */
export function PersonalProfileCard({
  profile,
  subtitle,
  tenant,
  editable = false,
}: {
  profile: UserProfile;
  /** Dòng ngay dưới tên — vai trong gian hàng, hoặc "Tài khoản XePrime". */
  subtitle: string;
  tenant: AccountTrackInput | null | undefined;
  editable?: boolean;
}) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateMyProfile();

  const [isEditing, setIsEditing] = useState(false);
  /** Kênh liên lạc đang được đổi — `null` là không có tấm trượt nào mở. */
  const [editingContact, setEditingContact] = useState<ContactChannel | null>(null);

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
    <>
      <Card padded={false}>
        <AccountIdentityHero
          name={displayName || profile.displayName}
          avatarUrl={avatarUrl ?? null}
          subtitle={subtitle}
          tenant={tenant}
        />

        <YStack gap={space.md} p={space.md}>
          {/*
            Khối SỬA tên + ảnh. Chỉ dựng khi thẻ cho sửa: ở bản chỉ xem, một tiêu đề "Thông tin
            tài khoản" đứng trơ không nút nào là một khối không nói thêm được gì so với cái tên
            vừa đọc ở ngay trên nó.
          */}
          {editable ? (
            <>
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
            </>
          ) : null}

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
                {...(editable
                  ? { onEdit: () => setEditingContact(CONTACT_CHANNEL.EMAIL) }
                  : {})}
              />
              <YStack h={1} bg={colors.borderSubtle} />
              <ContactRow
                icon="call-outline"
                label={t('profile.phone')}
                value={profile.phone}
                emptyLabel={t('noPhone')}
                verified={profile.phoneVerified}
                {...(editable
                  ? { onEdit: () => setEditingContact(CONTACT_CHANNEL.PHONE) }
                  : {})}
              />
            </YStack>

            {/*
              Ghi chú giải thích vì sao đổi hai dòng trên lại cần một mã — `securityNote` của
              web, kể cả NỀN XANH (`--xp-color-info-bg`). Nền xám ở đây đọc ra như một ô bị vô
              hiệu hoá, chứ không phải một ghi chú.

              Khiên, không phải ổ khoá: từ 14/09 khối này không còn nói "hai trường bị khoá" mà
              nói "đổi được, nhưng cần mã xác thực". Ổ khoá mâu thuẫn với chính câu bên cạnh nó
              — web đổi icon cùng lúc với câu chữ.

              Chỉ ở bản CHO SỬA: câu đó nói về việc đổi, nên ở bản chỉ xem nó hứa một thao tác
              không có trên màn.
            */}
            {editable ? (
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
            ) : null}
          </YStack>
        </YStack>
      </Card>

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
    </>
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
 *
 * Không có `onEdit` là dòng CHỈ XEM: nút biến mất, phần còn lại giữ nguyên. Một nút "Đổi" mờ đi
 * vẫn là một lời hứa, và người dùng sẽ bấm nó.
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
  const t = useTranslations('Account');

  return (
    <YStack p={space.md} gap={space.xs}>
      {/*
        Lối vào để đổi nằm cùng hàng với NHÃN, không cùng hàng với giá trị.

        Nút cũ đứng cuối hàng giá trị và ăn ~96dp bề ngang, nên một email dài như
        `nguyenvanan.long@company.com.vn` bị cắt bằng dấu ba chấm — đúng thứ người ta mở màn này
        để ĐỌC. Nhãn chỉ hai chữ và luôn vừa, nên đó mới là hàng gánh được một thao tác.

        `InlineAction` chứ không `Button`: một nút cao 44dp đặt trên hàng nhãn cao 18dp thổi mỗi
        dòng liên hệ lên gần gấp đôi. Vùng chạm vẫn đủ nhờ `hitSlop` của chính nó.
      */}
      <XStack ai="center" gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.label} f={1} minWidth={0} numberOfLines={1}>
          {label}
        </Text>
        {onEdit ? <InlineAction label={value ? t('contact.change') : t('contact.add')} onPress={onEdit} /> : null}
      </XStack>

      {/*
        Hình tròn nằm TRONG hàng giá trị, không đứng lệch sang một cột riêng: nó chú thích
        email/SĐT chứ không chú thích chữ "Email", nên phải thẳng hàng với chính giá trị. Đặt nó
        thành một cột ôm cả hai dòng thì phải bù lề bằng một con số đoán, và con số đó sai ngay
        khi hàng mọc thêm viên "Chưa xác thực".
      */}
      <XStack ai="center" gap={space.sm}>
        <YStack
          w={DISC}
          h={DISC}
          br={radius.pill}
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.borderSubtle}
          ai="center"
          jc="center"
        >
          <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
        </YStack>

        <Text
          col={value ? colors.text : colors.placeholder}
          /*
            `bodySm`, không phải `body`: một email dài là chuỗi KHÔNG xuống dòng được, nên mỗi bậc
            chữ to thêm là vài ký tự nữa bị cắt bằng "…" ở máy 360dp. Giá trị vẫn nổi hơn nhãn nhờ
            màu chữ chính + nét đậm vừa, chứ không cần thêm cỡ.
          */
          fos={fontSize.bodySm}
          fow={fontWeight.medium}
          numberOfLines={1}
          f={1}
          minWidth={0}
        >
          {value ?? emptyLabel}
        </Text>

        {/*
          Đã xác thực = một dấu tích tròn NHỎ, không phải viên nhãn chữ: hàng này đã có một giá
          trị dài; thêm một viên "Đã xác thực" nữa thì giá trị — thứ người ta đọc — lại bị ép
          xuống còn vài ký tự ở 360dp. Chưa xác thực thì mới cần CHỮ, vì đó là việc cần làm.
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

      {/* Thụt đúng bằng hình tròn + khe: viên nhãn thuộc về GIÁ TRỊ phía trên, không về hàng nhãn. */}
      {value && !verified ? (
        <XStack paddingLeft={DISC + space.sm}>
          <StatusBadge label={t('profile.unverified')} color={STATUS_COLOR.WARNING} size="sm" />
        </XStack>
      ) : null}
    </YStack>
  );
}
