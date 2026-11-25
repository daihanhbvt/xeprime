import { memo, type ReactNode } from 'react';
import { Linking, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { telHref, zaloHref } from '@xeprime/domain';
import { images } from '@/assets';
import { LineIcon } from '@/components/icons/LineIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { HEADER_SHADOW, IS_PARTNER_APP } from '@/lib/app-kind';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Figma "Customer Hero Card" `24486:106613`: ảnh 40, nút chép 16, nút liên hệ cao 36, ô số bo 10. */
const AVATAR_SIZE = 40;
const COPY_ICON = 16;
const BUTTON_ICON = 20;
const ZALO_LOGO = { width: 18, height: 18 } as const;
const HERO_GAP = 12;
const STAT_RADIUS = 10;

export interface HeroStat {
  key: string;
  value: string;
  label: string;
  /** Màu chữ số - bỏ trống thì mực thường; "Đang chạy" xanh, "Còn nợ" đỏ (Figma). */
  tone?: string | undefined;
}

/**
 * Khối đầu hồ sơ khách (Figma Partner-XePrime "Users / Details" `24486:59789`): dùng chung cho cả
 * bốn tab. Trắng, bóng xs, đệm 16 trên / 16 hai bên. Từ trên xuống: danh tính (ảnh · tên · nhãn,
 * SĐT xanh + nút chép, email cùng kiểu - người dùng 25/11/2026), hàng nút Gọi · Zalo có chữ, bốn ô số
 * liệu, rồi dải tab (nhận qua `tabs`).
 *
 * Không có nút "Nhắn tin": web không có nó ở hồ sơ khách vì hội thoại gắn với MỘT yêu cầu đặt xe
 * (ADR 0073) - người dùng chốt bỏ 25/11/2026. Gọi/Zalo chỉ hiện khi có SĐT (cổng lộ liên hệ ADR 0056).
 */
function CustomerHeroCardImpl({
  fullName,
  avatarUrl,
  statusLabel,
  statusTone,
  phone,
  email,
  sourceLabel,
  stats,
  tabs,
  onCopy,
}: {
  fullName: string;
  avatarUrl: string | null;
  statusLabel: string;
  statusTone: PillTone;
  phone: string;
  email: string | null | undefined;
  sourceLabel: string;
  stats: readonly HeroStat[];
  tabs: ReactNode;
  onCopy: (value: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers');
  const tContact = useTranslations('BookingRequests.actions');
  const tel = telHref(phone);
  const zalo = zaloHref(phone);

  return (
    <YStack
      bg={colors.surface}
      pt={space.lg}
      px={space.lg}
      gap={HERO_GAP}
      style={IS_PARTNER_APP ? HEADER_SHADOW : elevation.xs}
    >
      <XStack ai="center" gap={HERO_GAP}>
        <Avatar name={fullName} url={avatarUrl} size={AVATAR_SIZE} />
        <YStack f={1} minWidth={0} gap={2}>
          <XStack ai="center" gap={space.sm}>
            <Text
              flexShrink={1}
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {fullName}
            </Text>
            <Pill label={statusLabel} tone={statusTone} />
          </XStack>
          <ContactLine
            value={phone}
            suffix={`· ${sourceLabel}`}
            copyLabel={t('detail.copyPhone')}
            onCopy={onCopy}
          />
          {email ? (
            <ContactLine value={email} copyLabel={t('detail.copyEmail')} onCopy={onCopy} />
          ) : null}
        </YStack>
      </XStack>

      {tel || zalo ? (
        <XStack gap={HERO_GAP} flexWrap="wrap">
          {tel ? (
            <ContactButton
              label={tContact('call')}
              a11y={tContact('callAria', { name: fullName, phone })}
              onPress={() => void Linking.openURL(tel)}
            >
              <LineIcon name="calling" size={BUTTON_ICON} color={colors.textMuted} />
            </ContactButton>
          ) : null}
          {zalo ? (
            <ContactButton
              label={tContact('zalo')}
              a11y={tContact('zaloAria', { name: fullName, phone })}
              tone="zalo"
              onPress={() => void Linking.openURL(zalo)}
            >
              {/* Logo Zalo thật như web, không vẽ lại bằng icon chung. */}
              <Image source={images.zaloLogo} style={ZALO_LOGO} contentFit="contain" />
            </ContactButton>
          ) : null}
        </XStack>
      ) : null}

      <XStack gap={space.sm}>
        {stats.map((stat) => (
          <YStack
            key={stat.key}
            f={1}
            flexBasis={0}
            minWidth={0}
            ai="center"
            gap={2}
            py={space.sm}
            br={STAT_RADIUS}
            bg={colors.background}
            accessible
            accessibilityLabel={`${stat.label}: ${stat.value}`}
          >
            <Text
              col={stat.tone ?? colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {stat.value}
            </Text>
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              numberOfLines={1}
            >
              {stat.label}
            </Text>
          </YStack>
        ))}
      </XStack>

      {tabs}
    </YStack>
  );
}

export const CustomerHeroCard = memo(CustomerHeroCardImpl);

/** SĐT / email xanh 12 medium + nút chép 16 màu `text/gray/very-low` (+ hậu tố "· Marketplace"). */
function ContactLine({
  value,
  suffix,
  copyLabel,
  onCopy,
}: {
  value: string;
  suffix?: string;
  copyLabel: string;
  onCopy: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.sm}>
      <Text
        flexShrink={1}
        col={colors.infoStrong}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Pressable
        onPress={() => onCopy(value)}
        accessibilityRole="button"
        accessibilityLabel={copyLabel}
        hitSlop={8}
      >
        <LineIcon name="copy" size={COPY_ICON} color={colors.textPlaceholder} />
      </Pressable>
      {suffix ? (
        <Text
          flexShrink={0}
          col={colors.placeholder}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          numberOfLines={1}
        >
          {suffix}
        </Text>
      ) : null}
    </XStack>
  );
}

/** Nút liên hệ có chữ: đệm 14/8, bo 12, icon 20 + chữ 14 đậm; `zalo` nền `information-low` viền `information-300`. */
function ContactButton({
  label,
  a11y,
  tone = 'outline',
  onPress,
  children,
}: {
  label: string;
  a11y: string;
  tone?: 'outline' | 'zalo';
  onPress: () => void;
  children: ReactNode;
}) {
  const colors = useColors();
  const zalo = tone === 'zalo';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => (pressed ? PRESSED : null)}
    >
      <XStack
        ai="center"
        jc="center"
        gap={6}
        px={14}
        py={space.sm}
        br={radius.control}
        bw={1}
        bc={zalo ? colors.infoBorder : colors.borderInput}
        bg={zalo ? colors.infoLow : colors.surface}
      >
        {children}
        <Text
          col={zalo ? colors.infoStrong : colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

const PRESSED = { opacity: 0.7 } as const;
