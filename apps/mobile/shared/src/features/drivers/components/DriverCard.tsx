import { memo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  STATUS_COLOR,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { ActionMenuRow } from '@/components/ui/ActionMenuRow';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, sizing, space, typeScale } from '@/theme/tokens';
import type { Driver } from '../api';
import { DriverStatusLine } from './DriverStatusLine';

/** Ý định trên một liên kết — xác nhận (tạm khoá, kết thúc/thu hồi) nằm ở MÀN, không ở thẻ. */
export type DriverCardIntent =
  'view' | 'trips' | 'reinvite' | 'edit' | 'suspend' | 'resume' | 'end';

/** Figma "Vehicle Card" của Quản lý tài xế (`24612:138244`): đệm 16, các khối cách 16. */
const CARD_GAP = 16;
const AVATAR = 48;
const KEBAB_SLOP = Math.ceil((sizing.touchTarget - iconSize.lg) / 2);

/**
 * Thẻ tài xế — Figma Partner-XePrime "MB — Vehice / Driver" (`24512:115071`): ảnh + tên + SĐT và
 * nút "⋮"; viên hình thức + trạng thái liên kết; MỘT dòng trạng thái (bằng lái / lời mời); dòng
 * "Chuyến đang gán". Chạm thẻ mở chi tiết (không còn hàng nút). Menu "⋮" theo trạng thái và quyền:
 * Chỉnh sửa · Tạm khoá / Mở khoá · Mời lại · Thu hồi lời mời / Ngừng hợp tác - cùng các mục của web.
 */
function DriverCardImpl({
  driver,
  canManage,
  pending,
  onIntent,
}: {
  driver: Driver;
  canManage: boolean;
  /** Có mutation đang chạy trên CHÍNH liên kết này — các mục menu khoá lại. */
  pending: boolean;
  onIntent: (driver: Driver, intent: DriverCardIntent) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tCard = useTranslations('Drivers.card');
  const tApp = useTranslations('Drivers.app');
  const domainLabel = useDomainLabel();
  const [menuOpen, setMenuOpen] = useState(false);

  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);
  const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const canReinvite = canManage && !open && !driver.currentOpenLinkStatus;

  const historyNotes = [
    driver.linkStatus === DRIVER_LINK_STATUS.ENDED && driver.endedByParty
      ? driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
        ? t('endedBy.driver')
        : t('endedBy.employer')
      : null,
    driver.currentOpenLinkStatus
      ? driver.currentOpenLinkStatus === DRIVER_LINK_STATUS.INVITED
        ? t('reinvite.alreadyInvited')
        : t('reinvite.alreadyLinked')
      : null,
  ].filter(Boolean);

  const menu = [
    { key: 'edit' as const, icon: 'edit' as const, label: tCard('editInfo'), show: canManage && open, danger: false },
    {
      key: 'suspend' as const,
      icon: 'lock' as const,
      label: t('actions.suspend'),
      show: canManage && driver.linkStatus === DRIVER_LINK_STATUS.ACTIVE,
      danger: false,
    },
    {
      key: 'resume' as const,
      icon: 'lock-1' as const,
      label: t('actions.resume'),
      show: canManage && driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED,
      danger: false,
    },
    { key: 'reinvite' as const, icon: 'rotate-right' as const, label: t('actions.reinvite'), show: canReinvite, danger: false },
    {
      key: 'end' as const,
      icon: invited ? ('rotate-left' as const) : ('doc-fail' as const),
      label: invited ? t('actions.revoke') : t('actions.end'),
      show: canManage && open,
      danger: !invited,
    },
  ].filter((item) => item.show);

  return (
    <Card padded={false} lift="flat">
      <Pressable
        onPress={() => onIntent(driver, 'view')}
        accessibilityRole="button"
        accessibilityLabel={tCard('openDetail', { name: driver.name })}
      >
        <YStack p={space.md} gap={CARD_GAP}>
          <XStack ai="center" gap={12}>
            <Avatar name={driver.name} url={driver.account.avatarUrl ?? null} size={AVATAR} />
            <YStack f={1} minWidth={0} gap={space.xs}>
              <Text
                col={colors.text}
                fos={typeScale.title.fontSize}
                lh={typeScale.title.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {driver.name}
              </Text>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={22} numberOfLines={1}>
                {driver.phone}
              </Text>
            </YStack>
            {menu.length > 0 ? (
              <Pressable
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={tCard('menu', { name: driver.name })}
                hitSlop={KEBAB_SLOP}
                style={{ alignSelf: 'flex-start' }}
              >
                <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </XStack>

          <YStack gap={12}>
            <YStack gap={space.xs}>
              <XStack flexWrap="wrap" ai="center" gap={12}>
                {/* Hình thức hợp tác: viên xám KHÔNG viền (Figma "Trạng thái" `24612:138254`). */}
                <YStack px={space.sm} py={2} br={radius.card} bg={colors.background}>
                  <Text
                    col={colors.textMuted}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {domainLabel('driverType', driver.driverType, driver.driverType)}
                  </Text>
                </YStack>
                <Pill
                  label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
                  tone={
                    invited
                      ? 'info'
                      : pillToneOfStatusColor(
                          driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED
                            ? STATUS_COLOR.DANGER
                            : meta.color,
                        )
                  }
                />
              </XStack>
              {historyNotes.length > 0 ? (
                <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                  {historyNotes.join(LIST_SEPARATOR)}
                </Text>
              ) : null}
            </YStack>

            {open ? <DriverStatusLine driver={driver} /> : null}

            <XStack jc="space-between" ai="center" gap={space.sm}>
              <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {tCard('activeTrips')}
              </Text>
              {driver.activeBookingCount > 0 ? (
                <Text
                  col={colors.brandLink}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                  textDecorationLine="underline"
                  numberOfLines={1}
                >
                  {t('activeBookings', { count: driver.activeBookingCount })}
                </Text>
              ) : (
                <Text
                  col={colors.textDisabled}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                >
                  {tApp('noTrips')}
                </Text>
              )}
            </XStack>
          </YStack>
        </YStack>
      </Pressable>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={driver.name} chrome="v2" headerDivider padded={false}>
        <YStack pb={space.sm}>
          {menu.map((item) => (
            <ActionMenuRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              danger={item.danger}
              disabled={pending}
              onPress={() => {
                setMenuOpen(false);
                onIntent(driver, item.key);
              }}
            />
          ))}
        </YStack>
      </BottomSheet>
    </Card>
  );
}

/** `memo`: HÀNG trong một danh sách dài — màn chứa nó dựng lại vì đủ thứ không liên quan. */
export const DriverCard = memo(DriverCardImpl);
