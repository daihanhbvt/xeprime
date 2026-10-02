import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image } from 'expo-image';
import { useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ownerProfileSchema, type OwnerProfileValues } from '@xeprime/validators';
import { OWNER_PERSONAL_CAR_RATIO, images } from '@/assets';
import { AddressFields } from '@/components/form/AddressFields';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { IconDisc } from '@/components/ui/IconDisc';
import { InlineAction } from '@/components/ui/InlineAction';
import { TextField } from '@/components/ui/TextField';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ContactVerifySheet } from '@/features/account/components/ContactVerifySheet';
import { CONTACT_CHANNEL } from '@/api/account/api';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Giới thiệu ngắn — khớp `max(200)` của schema, hiện thành bộ đếm ký tự. */
const BIO_MAX = 200;

/** Bề ngang do thẻ quyết định; chiều cao suy từ `aspectRatio` của ảnh. */
const styles = StyleSheet.create({ art: { width: '100%' } });

/**
 * Bước HỒ SƠ CHỦ XE của wizard đăng xe nhanh — bản native của `QuickVehicleOwnerStep`.
 *
 * Đây là chỗ người CHƯA có hồ sơ chủ xe mở được một hồ sơ, NGAY TRONG luồng đăng xe. Đường cũ
 * của app đẩy họ sang `/manage/vehicles/new` — một màn sau `ScopeGuard` đòi phải có gian hàng —
 * nên chủ xe cá nhân bấm "Đăng xe đầu tiên" là ăn ngay "Bạn không còn quyền truy cập gian hàng
 * này". Sai cả QUYỀN lẫn TUYẾN: theo ADR 0028 chủ xe tuyến hoa hồng đăng xe từ khu khách và
 * không bao giờ bước vào cổng quản lý.
 *
 * Thứ tự ô theo ĐÚNG web: họ tên · số điện thoại · email · giới thiệu · địa chỉ nhận xe. Địa chỉ
 * đi qua `AddressFields` dùng chung (tỉnh → xã/phường → số nhà + ghim toạ độ), không tự ghép hai
 * `SelectField`: ghim toạ độ quyết định phí giao xe và chỗ khách tới lấy xe.
 *
 * Số điện thoại KHÔNG phải một ô chữ trong form: nó lấy từ chính tài khoản và phải qua OTP. Một
 * ô gõ tự do ở đây tạo ra số thứ hai không ai kiểm chứng, ngay cạnh số đã xác thực của cùng
 * người đó — và khách sẽ gọi vào đúng cái số không ai kiểm chứng.
 *
 * ## ⚠️ BƯỚC NÀY KHÔNG GỌI API (17/09/2026)
 *
 * Trước đây nó gọi thẳng `POST /tenants` khi người dùng bấm "Tiếp tục", và đó là một lỗi thật:
 * chỉ cần điền xong màn này rồi thoát ra là tài khoản ĐÃ thành chủ xe — có gian hàng, có chi
 * nhánh mặc định, có gói hoa hồng, và menu tài khoản đổi hẳn sang menu chủ xe — dù họ chưa khai
 * một chiếc xe nào. Một cú bấm nhầm đẻ ra một pháp nhân.
 *
 * Giờ bước này chỉ THU THẬP: giá trị đi lên wizard và `POST /tenants` chạy ở CHÍNH lần lưu chiếc
 * xe (`useQuickVehicleRegistration`). Bỏ dở giữa chừng không để lại gì trên server.
 *
 * Gian hàng vẫn mở bằng `POST /tenants` như mọi tuyến: theo ADR 0014/0024, cái phân biệt hai
 * tuyến là GÓI đang có hiệu lực, không phải một loại tenant riêng. Chủ xe cá nhân = tenant chưa
 * có gói.
 */
export function QuickVehicleOwnerStep({
  defaultValues,
  onCompleted,
  onCancel,
  submitLabel,
}: {
  /** Giá trị đã khai ở lần trước — quay lại sửa địa chỉ thì không phải gõ lại từ đầu. */
  defaultValues?: OwnerProfileValues | null;
  /** Khai xong — nơi gọi GIỮ giá trị này và chuyển sang bước "Thông tin xe". */
  onCompleted: (values: OwnerProfileValues) => void;
  onCancel: () => void;
  /** Nhãn nút chính: lần đầu là "Tiếp tục", lúc quay lại sửa thì là "Lưu". */
  submitLabel?: string;
}) {
  const t = useTranslations('ListYourVehicle.ownerProfile');
  const tCommon = useTranslations('Common.actions');
  const { data: user } = useCurrentUser();
  const [verifyOpen, setVerifyOpen] = useState(false);

  const phone = user?.phone ?? null;
  const phoneVerified = Boolean(phone && user?.phoneVerified);

  const resolver = useValidationResolver<OwnerProfileValues>(
    ownerProfileSchema,
    'ListYourVehicle.ownerProfile.validation',
  );
  const { control, handleSubmit } = useForm<OwnerProfileValues>({
    resolver,
    defaultValues: defaultValues ?? {
      name: user?.displayName ?? '',
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      email: user?.email ?? '',
      bio: '',
    },
  });

  const submit = handleSubmit((values) => {
    // Nút đã bị khoá khi chưa xác thực; chặn lần hai ở đây vì Enter trong ô nhập cũng submit.
    if (!phoneVerified || !phone) return;
    onCompleted(values);
  });

  return (
    <>
      <YStack gap={space.md}>
        <Card>
          <YStack gap={space.sm}>
            <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
              {t('pageTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('pageSubtitle')}
            </Text>
            <Image
              source={images.ownerPersonalCar}
              style={[styles.art, { aspectRatio: OWNER_PERSONAL_CAR_RATIO }]}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('tagline')}
            </Text>
          </YStack>
        </Card>

        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {t('heading')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('intro')}
          </Text>
        </YStack>

        <XStack ai="flex-start" gap={space.xs}>
          <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {t('publicNote')}
          </Text>
        </XStack>

        <Card>
          <YStack gap={space.md}>
            <TextField
              control={control}
              name="name"
              label={t('fields.name.label')}
              placeholder={t('fields.name.placeholder')}
              hint={t('fields.name.help')}
              icon="person-outline"
              required
            />

            {/*
              SỐ LIÊN HỆ là dòng ĐỌC, không phải ô nhập: nó đến từ tài khoản đã qua OTP. Ba trạng
              thái tách rời nhau, đúng web — đã xác thực (kèm lối đổi số), có số mà chưa xác thực,
              và chưa có số nào. Gộp hai ca sau lại là bảo một người "xác thực số của bạn" khi họ
              chưa hề có số.
            */}
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.label} fow={fontWeight.medium}>
                {t('fields.phone.label')}
              </Text>
              {phoneVerified ? (
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {phone}
                  </Text>
                  <Text col={colors.success} fos={fontSize.label}>
                    {t('fields.phone.verified')}
                  </Text>
                  <InlineAction
                    label={t('fields.phone.change')}
                    onPress={() => setVerifyOpen(true)}
                  />
                </XStack>
              ) : (
                <Callout
                  tone="warning"
                  title={phone ? t('fields.phone.unverifiedTitle') : t('fields.phone.missingTitle')}
                >
                  <YStack gap={space.sm}>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {phone ? t('fields.phone.unverifiedBody') : t('fields.phone.missingBody')}
                    </Text>
                    <Button
                      label={phone ? t('fields.phone.verifyCta') : t('fields.phone.addCta')}
                      icon="call-outline"
                      variant="secondary"
                      size="sm"
                      onPress={() => setVerifyOpen(true)}
                    />
                  </YStack>
                </Callout>
              )}
            </YStack>

            <TextField
              control={control}
              name="email"
              label={t('fields.email.label')}
              placeholder={t('fields.email.placeholder')}
              hint={t('fields.email.help')}
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextField
              control={control}
              name="bio"
              label={t('fields.bio.label')}
              placeholder={t('fields.bio.placeholder')}
              hint={t('fields.bio.help')}
              multiline
              rows={4}
              maxLength={BIO_MAX}
            />

            <AddressFields
              control={control}
              names={{
                provinceCode: 'provinceCode',
                wardCode: 'wardCode',
                addressLine: 'addressLine',
              }}
              pin={{
                placeId: 'placeId',
                latitude: 'latitude',
                longitude: 'longitude',
                locationSource: 'locationSource',
              }}
              title={t('fields.address.title')}
              required
              prefillRememberedProvince
            />
          </YStack>
        </Card>

        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('editableLater')}
        </Text>

        <OwnerReassurance />

        <YStack gap={space.sm}>
          <Button
            label={submitLabel ?? tCommon('next')}
            disabled={!phoneVerified}
            onPress={() => void submit()}
          />
          <Button label={tCommon('cancel')} variant="ghost" icon="arrow-back" onPress={onCancel} />
        </YStack>
      </YStack>

      {/* `key` theo kênh: mỗi lần mở là một lượt xác thực mới, không giữ mã của lần trước. */}
      {verifyOpen ? (
        <ContactVerifySheet
          key={CONTACT_CHANNEL.PHONE}
          channel={CONTACT_CHANNEL.PHONE}
          open
          onClose={() => setVerifyOpen(false)}
          current={phone}
        />
      ) : null}
    </>
  );
}

/**
 * Ba lý do nên khai đủ + lối ra hỗ trợ — cột phụ của web, xếp DƯỚI form trên native.
 *
 * Đây là chỗ TRẤN AN, không phải chỗ nhập liệu: người lần đầu giao tên, số điện thoại và địa chỉ
 * nhà mình cho một nền tảng cần biết vì sao. Trên màn hẹp nó phải đứng sau form — đặt trước thì
 * người dùng phải cuộn qua ba đoạn quảng cáo mới tới ô đầu tiên.
 */
function OwnerReassurance() {
  const t = useTranslations('ListYourVehicle.ownerProfile.aside');
  const navigateOnce = useNavigateOnce();

  // Khoá viết THẲNG, không ghép chuỗi: bộ kiểm tra chỉ soát được key khi nó là literal.
  const points: ReadonlyArray<{ key: string; icon: IconName; title: string; desc: string }> = [
    {
      key: 'trust',
      icon: 'shield-checkmark-outline',
      title: t('trust.title'),
      desc: t('trust.desc'),
    },
    { key: 'reach', icon: 'people-outline', title: t('reach.title'), desc: t('reach.desc') },
    { key: 'manage', icon: 'settings-outline', title: t('manage.title'), desc: t('manage.desc') },
  ];

  return (
    <YStack gap={space.md}>
      <Card tone="muted" lift="flat">
        <YStack gap={space.md}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          {points.map((point) => (
            <XStack key={point.key} ai="flex-start" gap={space.sm}>
              <IconDisc icon={point.icon} tone={colors.primaryActive} size={32} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {point.title}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {point.desc}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </Card>

      <Card tone="muted" lift="flat">
        <YStack gap={space.sm}>
          <XStack ai="flex-start" gap={space.sm}>
            <IconDisc icon="headset-outline" tone={colors.primaryActive} size={32} />
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('support.title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('support.desc')}
              </Text>
            </YStack>
          </XStack>
          <Button
            label={t('support.cta')}
            variant="secondary"
            size="sm"
            onPress={() => navigateOnce(ROUTES.account.support())}
          />
        </YStack>
      </Card>
    </YStack>
  );
}
