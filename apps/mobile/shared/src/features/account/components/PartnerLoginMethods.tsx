import { memo, useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../api';
import { ContactVerifySheet } from './ContactVerifySheet';

interface OpenSheet {
  channel: ContactChannel;
  verifyCurrent: boolean;
}

/** Figma `24231:108477` "Card": ô icon 48 (đệm 12, icon 24), viên trạng thái đệm 8/2. */
const ICON_TILE_PAD = 12;
const ICON = 24;
const GAP_12 = 12;
const BADGE_PAD_Y = 2;

/**
 * "Thông tin đăng nhập" của app Partner - Figma `24231:108083`, bản native của web `LoginMethods`.
 *
 * Mỗi kênh một thẻ: icon · nhãn + viên "Đã xác minh / Chưa xác minh" · giá trị · câu dùng vào việc
 * gì · nút. "Thay đổi" (hoặc "Thêm" khi chưa có) mở tấm đổi qua mã OTP; kênh đã có mà CHƯA xác minh
 * thì thêm "Xác minh" - gửi mã ngay tới chính định danh đó (`verifyCurrent`, như web).
 */
export function PartnerLoginMethods({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const [open, setOpen] = useState<OpenSheet | null>(null);
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      <MethodCard
        icon="calling"
        label={t('profile.phone')}
        value={profile.phone}
        emptyLabel={t('noPhone')}
        verified={profile.phoneVerified}
        description={t('securityPage.login.phoneBody')}
        onChange={() => setOpen({ channel: CONTACT_CHANNEL.PHONE, verifyCurrent: false })}
        onVerify={() => setOpen({ channel: CONTACT_CHANNEL.PHONE, verifyCurrent: true })}
      />
      <MethodCard
        icon="mail"
        label={t('profile.email')}
        value={profile.email}
        emptyLabel={t('noEmail')}
        verified={profile.emailVerified}
        description={t('securityPage.login.emailBody')}
        onChange={() => setOpen({ channel: CONTACT_CHANNEL.EMAIL, verifyCurrent: false })}
        onVerify={() => setOpen({ channel: CONTACT_CHANNEL.EMAIL, verifyCurrent: true })}
      />

      {/*
        `key` theo kênh + lối: tấm giữ state riêng (bước, mã đã gửi, đếm ngược), nên mở email ngay
        sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {open ? (
        <ContactVerifySheet
          key={`${open.channel}-${open.verifyCurrent ? 'verify' : 'change'}`}
          channel={open.channel}
          open
          onClose={close}
          current={open.channel === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
          verifyCurrent={open.verifyCurrent}
        />
      ) : null}
    </>
  );
}

const MethodCard = memo(function MethodCard({
  icon,
  label,
  value,
  emptyLabel,
  verified,
  description,
  onChange,
  onVerify,
}: {
  icon: LineIconName;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
  description: string;
  onChange: () => void;
  onVerify: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Account');

  return (
    <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.card} p={space.md} gap={GAP_12}>
      <XStack ai="center" gap={GAP_12}>
        <YStack p={ICON_TILE_PAD} br={radius.control} bg={colors.brandLow}>
          <LineIcon name={icon} size={ICON} color={colors.brandShape} />
        </YStack>
        <YStack f={1} minWidth={0} gap={2} jc="center">
          <XStack ai="center" gap={space.sm}>
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1}>
              {label}
            </Text>
            {/* Chữ chứ không chỉ một màu: đọc được bằng trình đọc màn hình và bởi người mù màu. */}
            {value ? (
              <XStack
                px={space.sm}
                py={BADGE_PAD_Y}
                br={radius.card}
                bg={verified ? colors.successSurface : colors.orangeLow}
              >
                <Text
                  col={verified ? colors.success : colors.orangeHigh}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {verified ? t('verified') : t('profile.unverified')}
                </Text>
              </XStack>
            ) : null}
          </XStack>
          <Text
            col={value ? colors.text : colors.textPlaceholder}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {value ?? emptyLabel}
          </Text>
        </YStack>
      </XStack>

      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {description}
      </Text>

      <XStack gap={GAP_12}>
        <YStack f={1}>
          <Button
            label={value ? t('contact.change') : t('contact.add')}
            accessibilityLabel={
              value ? t('contact.changeAria', { field: label }) : t('contact.addAria', { field: label })
            }
            variant="neutral"
            size="sm"
            onPress={onChange}
          />
        </YStack>
        {value && !verified ? (
          <YStack f={1}>
            <Button
              label={t('contact.verify')}
              accessibilityLabel={t('contact.verifyAria', { field: label })}
              size="sm"
              onPress={onVerify}
            />
          </YStack>
        ) : null}
      </XStack>
    </YStack>
  );
});
