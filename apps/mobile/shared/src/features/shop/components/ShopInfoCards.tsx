import CloseOutlined from '@ant-design/icons-svg/es/asn/CloseOutlined';
import PictureOutlined from '@ant-design/icons-svg/es/asn/PictureOutlined';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useController, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { guessAddressLine } from '@xeprime/domain';
import { STOREFRONT_KIND, toLocalVnPhone, type StorefrontKind } from '@xeprime/types';
import type { ShopProfileWithContactValues } from '@xeprime/validators';
import { AddressFields } from '@/components/form/AddressFields';
import { AntIcon } from '@/components/icons/AntIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DashedDivider } from '@/components/ui/DashedDivider';
import { InfoCard, InfoRow, InfoRows } from '@/components/ui/InfoCard';
import { InlineAction } from '@/components/ui/InlineAction';
import { RichText } from '@/components/ui/RichText';
import { TextField } from '@/components/ui/TextField';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, space } from '@/theme/tokens';
import { uploadsApi, type MyShop } from '../api';

const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

const BIO_MAX_LENGTH = 2000;

/** Ảnh bìa trong thẻ cao 136 bo 12 (`.cover` của `ShopDisplayCard.module.css`). */
const DISPLAY_COVER_HEIGHT = 136;
/** Logo 54 chồng lên mép dưới ảnh bìa 24, cách lề trái 20 (`.logoRow`/`.logo`). */
const DISPLAY_LOGO = 54;
const DISPLAY_LOGO_OVERLAP = 24;
/** Vệt vàng góc trên của thẻ - `.glow` cao 160. */
const DISPLAY_GLOW_HEIGHT = 160;
/** Nút gỡ ảnh: 22 trên ảnh bìa, 18 trên logo (`.remove`). */
const REMOVE_COVER = 22;
const REMOVE_LOGO = 18;
/** Cột nút "Hủy" của cặp nút lưu ảnh - `grid-template-columns: 100px 1fr`. */
const MEDIA_CANCEL_WIDTH = 100;

/**
 * Thẻ "Thông tin hiển thị" — bản native của `ShopDisplayCard` web (design `23999:111472`, cột phải;
 * ở màn hẹp nó lên ĐẦU trang vì đó là thứ khách thấy).
 *
 * Bố cục theo đúng `ShopDisplayCard.module.css`: viền vàng + vệt vàng góc trên, ảnh bìa 136 bo 12,
 * logo vuông 54 chồng lên mép dưới ảnh bìa kèm chú thích nghiêng, hai nút đổi ảnh chia đôi hàng,
 * vạch nét đứt, bốn dòng nhãn (14 đậm vừa, xám) trên giá trị (14 thường), nút viền "Chỉnh sửa
 * thông tin" rộng hết thẻ.
 *
 * Ảnh bìa + logo đọc từ FORM (xem trước ngay khi đổi), cặp "Hủy · Lưu thay đổi" chỉ hiện khi có ảnh
 * chưa lưu — đúng luật S4/S5 của sổ redesign; gỡ ảnh bằng nút ✕ nhỏ trên ảnh. Bốn dòng tên · SĐT ·
 * email · giới thiệu đọc từ bản ĐÃ LƯU; sửa chúng qua tấm "Chỉnh sửa thông tin".
 */
export function ShopDisplayCard({
  shop,
  control,
  canEdit,
  mediaDirty,
  saving,
  onEdit,
  onMediaCancel,
  onMediaSave,
  onLogoPickerReady,
}: {
  shop: MyShop;
  control: Control<ShopProfileWithContactValues>;
  canEdit: boolean;
  mediaDirty: boolean;
  saving: boolean;
  onEdit: () => void;
  onMediaCancel: () => void;
  onMediaSave: () => void;
  /**
   * Trao cho trang hàm MỞ bộ chọn logo - dải chào "Tải logo" gọi nó, đúng như web bấm hộ nút
   * `SHOP_LOGO_TRIGGER_ID`.
   */
  onLogoPickerReady?: (open: () => void) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.info.display');
  const tShop = useTranslations('Shop.form.display');
  const tCommon = useTranslations('Common');
  const empty = tCommon('labels.notAvailable');
  const cover = useController({ control, name: 'coverUrl' });
  const logo = useController({ control, name: 'logoUrl' });
  const coverUrl = cover.field.value ?? null;
  const logoUrl = logo.field.value ?? null;

  const coverUpload = useImageUpload({
    title: tShop('cover.label'),
    hint: tShop('cover.hint'),
    presign: uploadsApi.shopMedia,
    onUploaded: ([url]) => cover.field.onChange(url ?? null),
  });
  const logoUpload = useImageUpload({
    title: tShop('logo.label'),
    hint: tShop('logo.hint'),
    presign: uploadsApi.shopMedia,
    onUploaded: ([url]) => logo.field.onChange(url ?? null),
  });
  const openLogo = logoUpload.open;
  useEffect(() => {
    if (canEdit) onLogoPickerReady?.(openLogo);
  }, [canEdit, onLogoPickerReady, openLogo]);
  const profile = shop.profile;

  return (
    <YStack gap={20}>
      <YStack
        gap={space.md}
        p={layout.cardPad}
        br={radius.card}
        bw={1}
        bc={colors.primaryGlow}
        bg={colors.surface}
        ov="hidden"
      >
        <LinearGradient
          colors={[colors.primarySubtle, colors.surface]}
          style={[StyleSheet.absoluteFill, styles.glow]}
          pointerEvents="none"
        />
        <YStack gap={2}>
          <Text
            col={colors.text}
            fos={fontSize.h3}
            lineHeight={28}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {t('title')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
            {t('hint')}
          </Text>
        </YStack>

        <YStack>
          <YStack h={DISPLAY_COVER_HEIGHT} br={radius.control} ov="hidden" bg={colors.surfaceMuted}>
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={tShop('cover.label')}
              />
            ) : (
              <YStack f={1} ai="center" jc="center">
                <AntIcon icon={PictureOutlined} size={32} color={colors.placeholder} />
              </YStack>
            )}
            {canEdit && coverUrl ? (
              <RemoveMediaButton
                size={REMOVE_COVER}
                inset={6}
                label={t('removeCover')}
                disabled={saving}
                onPress={() => cover.field.onChange(null)}
              />
            ) : null}
          </YStack>
          <XStack ai="flex-end" gap={10} mt={-DISPLAY_LOGO_OVERLAP} px={20}>
            <YStack
              w={DISPLAY_LOGO}
              h={DISPLAY_LOGO}
              br={radius.control}
              bw={1}
              bc={colors.border}
              bg={logoUrl ? colors.surface : colors.primaryLight}
              ov="hidden"
              ai="center"
              jc="center"
              style={elevation.xs}
            >
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessibilityLabel={tShop('logo.label')}
                />
              ) : (
                <Text col={colors.primaryStrong} fos={fontSize.lead} fow={fontWeight.semibold}>
                  {shop.name.trim().charAt(0).toLocaleUpperCase() || '?'}
                </Text>
              )}
              {canEdit && logoUrl ? (
                <RemoveMediaButton
                  size={REMOVE_LOGO}
                  inset={2}
                  label={t('removeLogo')}
                  disabled={saving}
                  onPress={() => logo.field.onChange(null)}
                />
              ) : null}
            </YStack>
            <Text f={1} col={colors.placeholder} fos={fontSize.bodySm} lineHeight={18} fontStyle="italic">
              {t('mediaHint')}
            </Text>
          </XStack>
        </YStack>

        {canEdit ? (
          <XStack gap={12}>
            <YStack f={1}>
              <Button
                label={t('changeLogo')}
                icon="storefront-outline"
                variant="secondary"
                shape="square"
                loading={logoUpload.busy}
                disabled={saving}
                onPress={logoUpload.open}
              />
            </YStack>
            <YStack f={1}>
              <Button
                label={t('changeCover')}
                icon="image-outline"
                variant="secondary"
                shape="square"
                loading={coverUpload.busy}
                disabled={saving}
                onPress={coverUpload.open}
              />
            </YStack>
          </XStack>
        ) : null}

        <DashedDivider color={colors.border} />

        <YStack gap={space.md}>
          <Fact label={t('displayName')} value={shop.name} empty={empty} />
          <Fact
            label={t('phone')}
            value={shop.phone ? toLocalVnPhone(shop.phone) : null}
            empty={empty}
          />
          <Fact label={t('email')} value={shop.email} empty={empty} />
          <YStack gap={4}>
            <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20} fow={fontWeight.semibold}>
              {t('bio')}
            </Text>
            {profile.bioHtml || profile.bio ? (
              <RichText
                html={profile.bioHtml ?? null}
                text={profile.bio ?? null}
                color={colors.text}
                fontSize={fontSize.body}
                gap={space.xs}
              />
            ) : (
              <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
                {empty}
              </Text>
            )}
          </YStack>
        </YStack>

        {canEdit ? (
          <Button
            label={t('edit')}
            icon="create-outline"
            variant="secondary"
            shape="square"
            onPress={onEdit}
          />
        ) : null}
      </YStack>

      {/* Chỉ hiện khi đổi ảnh mà chưa lưu - cột "Hủy" 100, "Lưu thay đổi" phần còn lại (`.actions`). */}
      {canEdit && mediaDirty ? (
        <XStack gap={12}>
          <YStack w={MEDIA_CANCEL_WIDTH}>
            <Button
              label={tCommon('actions.cancel')}
              variant="secondary"
              shape="square"
              disabled={saving}
              onPress={onMediaCancel}
            />
          </YStack>
          <YStack f={1}>
            <Button
              label={tCommon('actions.saveChanges')}
              shape="square"
              loading={saving}
              onPress={onMediaSave}
            />
          </YStack>
        </XStack>
      ) : null}

      {coverUpload.sheet}
      {logoUpload.sheet}
    </YStack>
  );
}

/** Nút ✕ tròn trên ảnh - nền phủ xám, góc trên phải (`.remove`). */
function RemoveMediaButton({
  size,
  inset,
  label,
  disabled,
  onPress,
}: {
  size: number;
  inset: number;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={[styles.remove, { top: inset, right: inset }]}
    >
      <YStack w={size} h={size} br={size / 2} bg={colors.overlay} ai="center" jc="center">
        <AntIcon icon={CloseOutlined} size={size === REMOVE_COVER ? 10 : 8} color={market.onDark} />
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  remove: { position: 'absolute' },
  glow: { height: DISPLAY_GLOW_HEIGHT, bottom: undefined },
});

/** Một dòng nhãn trên giá trị - nhãn 14 đậm vừa xám, giá trị 14 thường (`.fact`). */
function Fact({ label, value, empty }: { label: string; value: string | null | undefined; empty: string }) {
  const colors = useColors();
  return (
    <YStack gap={4}>
      <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20} fow={fontWeight.semibold}>
        {label}
      </Text>
      <Text col={value ? colors.text : colors.placeholder} fos={fontSize.body} lineHeight={20}>
        {value || empty}
      </Text>
    </YStack>
  );
}

/**
 * Thẻ "Địa chỉ & pháp lý" (gian hàng) / "Địa chỉ nhận xe" (mặt tiền cá nhân) — `ShopLegalCard` web:
 * tỉnh · xã · địa chỉ · số giấy phép KD đọc từ chi nhánh mặc định trước, hồ sơ sau.
 */
export function ShopLegalCard({
  shop,
  kind = STOREFRONT_KIND.SHOP,
  onEdit,
  onManageBranches,
}: {
  shop: MyShop;
  kind?: StorefrontKind;
  onEdit?: () => void;
  /** Ghi chú "Theo thông tin chi nhánh mặc định · Quản lý" — chỉ gian hàng có Chi nhánh. */
  onManageBranches?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.info.legal');
  const tOwner = useTranslations('Account.ownerHub.sections');
  const tCommon = useTranslations('Common');
  const personal = kind === STOREFRONT_KIND.PERSONAL;
  const branch = shop.defaultBranch;
  const profile = shop.profile;
  const empty = tCommon('labels.notAvailable');

  return (
    <InfoCard
      title={personal ? tOwner('address') : t('title')}
      hint={personal ? tOwner('addressHint') : t('hint')}
      editLabel={t('edit')}
      {...(onEdit ? { onEdit } : {})}
      footer={
        personal ? undefined : (
          <XStack flexWrap="wrap" ai="center" gap={4}>
            <Text col={colors.textPlaceholder} fos={fontSize.bodySm} fontStyle="italic">
              {t('defaultBranchNote')}
            </Text>
            {onManageBranches ? (
              <InlineAction label={t('manageBranches')} onPress={onManageBranches} />
            ) : null}
          </XStack>
        )
      }
    >
      <InfoRows>
        <InfoRow
          label={t('province')}
          value={branch?.provinceName ?? profile.provinceName ?? null}
          emptyLabel={empty}
        />
        <InfoRow
          label={t('ward')}
          value={branch?.wardName ?? profile.wardName ?? null}
          emptyLabel={empty}
        />
        <InfoRow
          label={t('address')}
          value={guessAddressLine(branch?.address ?? profile.address) || null}
          emptyLabel={empty}
        />
        {personal ? null : (
          <InfoRow
            label={t('businessLicenseNo')}
            value={profile.businessLicenseNo ?? null}
            emptyLabel={empty}
          />
        )}
      </InfoRows>
    </InfoCard>
  );
}

/** Chân chung của hai tấm sửa: "Hủy · Cập nhật" — đúng `okText`/`cancelText` của hộp web. */
function SheetFooter({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const tCommon = useTranslations('Common');
  return (
    <XStack gap={space.sm}>
      <YStack f={1}>
        <Button
          label={tCommon('actions.cancel')}
          variant="secondary"
          disabled={saving}
          onPress={onCancel}
        />
      </YStack>
      <YStack f={1}>
        <Button label={tCommon('actions.update')} loading={saving} onPress={onSubmit} />
      </YStack>
    </XStack>
  );
}

/**
 * Tấm "Chỉnh sửa thông tin hiển thị" — `ShopDisplayDialog` web. "Cập nhật" lưu NGAY đúng nhóm này.
 *
 * Giới thiệu trên app là CHỮ THUẦN (app không có editor định dạng): khi gian hàng đã soạn bản có định
 * dạng ở web thì nói rõ là sửa ở đây sẽ thành chữ thuần — nơi gọi chỉ gửi `bio` khi ô này thật sự đổi.
 */
export function ShopDisplaySheet({
  open,
  control,
  saving,
  hasFormattedBio,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  control: Control<ShopProfileWithContactValues>;
  saving: boolean;
  hasFormattedBio: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.info.display');
  const tShop = useTranslations('Shop.form.display');
  return (
    <BottomSheet
      open={open}
      onClose={onCancel}
      title={t('dialogTitle')}
      footer={<SheetFooter saving={saving} onCancel={onCancel} onSubmit={onSubmit} />}
    >
      <YStack gap={space.md}>
        <TextField
          control={control}
          name="displayName"
          label={t('displayName')}
          placeholder={tShop('displayName.placeholder')}
          required
          editable={!saving}
        />
        <TextField
          control={control}
          name="phone"
          label={t('phoneField')}
          placeholder={tShop('phone.placeholder')}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!saving}
        />
        <TextField
          control={control}
          name="email"
          label={t('email')}
          placeholder={tShop('email.placeholder')}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          editable={!saving}
        />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tShop('contactHint')}
        </Text>
        <TextField
          control={control}
          name="bio"
          label={t('bio')}
          placeholder={t('bioPlaceholder')}
          multiline
          rows={5}
          maxLength={BIO_MAX_LENGTH}
          editable={!saving}
        />
        {hasFormattedBio ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {t('bioPlainNote')}
          </Text>
        ) : null}
      </YStack>
    </BottomSheet>
  );
}

/** Tấm sửa "Địa chỉ & pháp lý" — `ShopLegalDialog` web (bộ chọn hành chính + gợi ý bản đồ, ADR 0077). */
export function ShopLegalSheet({
  open,
  control,
  saving,
  kind = STOREFRONT_KIND.SHOP,
  onCancel,
  onSubmit,
  onManageBranches,
}: {
  open: boolean;
  control: Control<ShopProfileWithContactValues>;
  saving: boolean;
  kind?: StorefrontKind;
  onCancel: () => void;
  onSubmit: () => void;
  /**
   * Lối "Quản lý chi nhánh" sau câu gợi ý tỉnh (web `ShopLegalFields`) - chỉ gian hàng thấy được thẻ
   * Chi nhánh mới truyền; chủ xe cá nhân chỉ có chi nhánh mặc định, chính là địa chỉ đang sửa.
   */
  onManageBranches?: () => void;
}) {
  const t = useTranslations('Shop.info.legal');
  const tOwner = useTranslations('Account.ownerHub.sections');
  const colors = useColors();
  const tShop = useTranslations('Shop.form.address');
  const tPersonal = useTranslations('Shop.personal');
  const personal = kind === STOREFRONT_KIND.PERSONAL;
  return (
    <BottomSheet
      open={open}
      onClose={onCancel}
      title={personal ? tOwner('address') : t('title')}
      subtitle={personal ? tOwner('addressHint') : t('dialogHint')}
      footer={<SheetFooter saving={saving} onCancel={onCancel} onSubmit={onSubmit} />}
    >
      <YStack gap={space.md}>
        <AddressFields
          control={control}
          names={ADDRESS_FIELD_NAMES}
          pin={ADDRESS_PIN_NAMES}
          required
          wardRequired={false}
          addressLineRequired={false}
          disabled={saving}
        />
        {personal ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {tPersonal('provinceHelp')}
          </Text>
        ) : (
          <YStack gap={space.xs}>
            {/* Địa chỉ ở đây là của CHI NHÁNH MẶC ĐỊNH - đổi nó là dời vị trí công khai của xe (web). */}
            <Text col={colors.textMuted} fos={fontSize.label}>
              {tShop('province.help')}
            </Text>
            {onManageBranches ? (
              <XStack>
                <InlineAction label={tShop('province.branchLink')} onPress={onManageBranches} />
              </XStack>
            ) : null}
          </YStack>
        )}
        {personal ? null : (
          <TextField
            control={control}
            name="businessLicenseNo"
            label={tShop('businessLicenseNo.label')}
            placeholder={tShop('businessLicenseNo.placeholder')}
            editable={!saving}
          />
        )}
      </YStack>
    </BottomSheet>
  );
}
