import { memo, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, holderNameDiffers } from '@xeprime/domain';
import { DRIVER_LICENCE_STATE, DRIVER_LINK_STATUS } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { Driver } from '../api';

type Tone = 'success' | 'info' | 'danger' | 'warning';

/** Ô tròn dấu tích 20 (Figma "Check icon" `24612:138257`: nền success-100, dấu 12). */
const CHECK_DISC = 20;

/**
 * Dòng trạng thái MỘT dòng của tài xế (Figma Quản lý tài xế `24512:121404`), thay khối bằng lái
 * nhiều dòng. Thứ tự ưu tiên: lời mời đang chờ → bằng lái chưa có / đang đọc → tên trên bằng lệch
 * (cam, cần đối chiếu) → đã xác thực. Bên thuê chỉ thấy TRẠNG THÁI bằng lái (ADR 0063), không ảnh.
 *
 * - `card`: thẻ danh sách - chữ 14, icon 20, nền theo sắc, hạng bằng căn phải khi đã xác thực.
 * - `detail`: đầu Chi tiết tài xế - nền xám bo 8, khiên 16, chữ 12 "HẠNG B2 · Đã xác thực · HSD …".
 */
export const DriverStatusLine = memo(function DriverStatusLine({
  driver,
  variant = 'card',
}: {
  driver: Driver;
  variant?: 'card' | 'detail';
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.app.licence');
  const fmt = useAppFormat();
  const licence = driver.licence;
  const classes = (licence.classes ?? []).join(', ');

  let tone: Tone;
  let text: string;
  let trailing: string | null = null;
  if (driver.linkStatus === DRIVER_LINK_STATUS.INVITED) {
    tone = 'info';
    text = t('invited');
  } else if (licence.state === DRIVER_LICENCE_STATE.PENDING) {
    tone = 'info';
    text = t('pending');
  } else if (licence.state !== DRIVER_LICENCE_STATE.VERIFIED) {
    tone = 'danger';
    text = t('none');
  } else if (holderNameDiffers(licence.fullName, driver.name)) {
    tone = 'warning';
    text = t('mismatch');
    trailing = classes ? t('classes', { classes }) : null;
  } else {
    tone = 'success';
    text = t('verified');
    trailing = classes ? t('classes', { classes }) : null;
  }

  const fg: Record<Tone, string> = {
    success: colors.success,
    info: colors.infoStrong,
    danger: colors.danger,
    warning: colors.warningStrong,
  };

  if (variant === 'detail') {
    const line =
      tone === 'success'
        ? [
            classes ? t('classesUpper', { classes: classes.toUpperCase() }) : null,
            t('verifiedShort'),
            licence.expiresOn ? t('expiry', { date: fmt.dateKey(licence.expiresOn) }) : t('noExpiry'),
          ]
            .filter(Boolean)
            .join(LIST_SEPARATOR)
        : text;
    return (
      <XStack
        ai="center"
        gap={6}
        px={12}
        py={space.sm}
        br={radius.thumb}
        bg={colors.background}
        alignSelf="stretch"
      >
        <LineIcon name="shield-sm" size={iconSize.sm} color={fg[tone]} />
        <Text
          f={1}
          col={fg[tone]}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          numberOfLines={1}
        >
          {line}
        </Text>
      </XStack>
    );
  }

  const bg: Record<Tone, string> = {
    success: colors.successWash,
    info: colors.infoLow,
    danger: colors.dangerSurface,
    warning: colors.warningSurface,
  };
  // Figma: dòng xanh/xanh dương bo tròn hẳn, dòng đỏ bo 12.
  const pill = tone === 'success' || tone === 'info';

  let icon: ReactNode;
  if (tone === 'success') {
    icon = (
      <YStack w={CHECK_DISC} h={CHECK_DISC} br={CHECK_DISC / 2} bg={colors.successTint} ai="center" jc="center">
        <LineIcon name="check-xs" size={12} color={colors.success} />
      </YStack>
    );
  } else if (tone === 'info') {
    icon = <LineIcon name="loading" size={iconSize.lg} color={fg.info} />;
  } else {
    icon = <LineIcon name="danger-circle" size={iconSize.lg} color={fg[tone]} />;
  }

  return (
    <XStack
      ai="center"
      gap={6}
      px={12}
      py={space.sm}
      br={pill ? radius.pill : radius.control}
      bg={bg[tone]}
      alignSelf="stretch"
    >
      {icon}
      <Text
        f={1}
        col={fg[tone]}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        numberOfLines={1}
      >
        {text}
      </Text>
      {trailing ? (
        <Text
          col={fg[tone]}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {trailing}
        </Text>
      ) : null}
    </XStack>
  );
});
