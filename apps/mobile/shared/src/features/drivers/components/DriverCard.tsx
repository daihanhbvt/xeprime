import FileSearchOutlined from '@ant-design/icons-svg/es/asn/FileSearchOutlined';
import LoadingOutlined from '@ant-design/icons-svg/es/asn/LoadingOutlined';
import { AntIcon } from '@/components/icons/AntIcon';
import { memo, useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { holderNameDiffers, LIST_SEPARATOR } from '@xeprime/domain';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  STATUS_COLOR,
} from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { Driver } from '../api';

/** Ý định trên một liên kết — xác nhận (tạm khoá, kết thúc/thu hồi) nằm ở MÀN, không ở thẻ. */
export type DriverCardIntent =
  'view' | 'trips' | 'reinvite' | 'edit' | 'suspend' | 'resume' | 'end';

/** Khuôn thẻ danh sách Partner (Đơn thuê / Danh sách xe): đệm 16, các khối cách 12. */
const CARD_PAD = 16;
const BLOCK_GAP = 12;
const AVATAR = 48;
const EMPTY_ICON = 48;

/**
 * Thẻ tài xế — bản native của `DriverCard` web (Figma Partner-XePrime `23737:43826`, sổ redesign
 * §3.7): đầu thẻ ảnh + tên + SĐT | tài khoản và nút "…"; viên hình thức + trạng thái liên kết; khối
 * BẰNG LÁI nền xám; hai dòng số (chuyến đang gán, tiền công tháng); ghi chú rút chuyến; hàng nút
 * dồn đáy (Chỉnh sửa thông tin · Mời lại · Xem chuyến). Menu "…" giữ đúng bốn mục của web: xem,
 * tạm khoá, mở khoá, kết thúc / thu hồi — mở thành tấm trượt vì native không có dropdown.
 */
function DriverCardImpl({
  driver,
  monthLabel,
  canManage,
  pending,
  onIntent,
}: {
  driver: Driver;
  /** "11/2026" — tháng của bộ chọn tháng, dạng số như web (`CARD_MONTH_FORMAT`). */
  monthLabel: string;
  canManage: boolean;
  /** Có mutation đang chạy trên CHÍNH liên kết này — các nút khoá lại. */
  pending: boolean;
  onIntent: (driver: Driver, intent: DriverCardIntent) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tCard = useTranslations('Drivers.card');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const [menuOpen, setMenuOpen] = useState(false);

  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);
  const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const canReinvite = canManage && !open && !driver.currentOpenLinkStatus;
  const hasMonthWage = driver.monthCompletedTrips > 0 || Number(driver.monthWageTotal) > 0;
  const accountName =
    driver.account.displayName && driver.account.displayName !== driver.name
      ? driver.account.displayName
      : null;

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

  const dropParts = [
    driver.dropCount > 0 ? tCard('drops', { count: driver.dropCount }) : null,
    driver.criticalDropCount > 0
      ? tCard('dropsCritical', { count: driver.criticalDropCount })
      : null,
    driver.autoAssignCooldownUntil
      ? t('drops.cooldownUntil', { time: fmt.dateTime(driver.autoAssignCooldownUntil) })
      : null,
  ].filter(Boolean);

  const menu = [
    { key: 'view' as const, label: t('actions.view'), show: true, danger: false },
    {
      key: 'suspend' as const,
      label: t('actions.suspend'),
      show: canManage && driver.linkStatus === DRIVER_LINK_STATUS.ACTIVE,
      danger: false,
    },
    {
      key: 'resume' as const,
      label: t('actions.resume'),
      show: canManage && driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED,
      danger: false,
    },
    {
      key: 'end' as const,
      label: invited ? t('actions.revoke') : t('actions.end'),
      show: canManage && open,
      danger: true,
    },
  ].filter((item) => item.show);

  const footerActions = [
    ...(open && canManage
      ? [
          {
            key: 'edit',
            icon: 'create-outline' as const,
            label: tCard('edit'),
            disabled: pending,
            onPress: () => onIntent(driver, 'edit'),
          },
        ]
      : []),
    ...(canReinvite
      ? [
          {
            key: 'reinvite',
            icon: 'refresh-outline' as const,
            label: t('actions.reinvite'),
            disabled: pending,
            onPress: () => onIntent(driver, 'reinvite'),
          },
        ]
      : []),
    {
      key: 'trips',
      icon: 'car-outline' as const,
      label: tCard('viewTrips'),
      disabled: false,
      onPress: () => onIntent(driver, 'trips'),
    },
  ];

  const factLink = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={space.xs}>
      <Text
        col={colors.primaryHover}
        fos={fontSize.body}
        fow={fontWeight.medium}
        textDecorationLine="underline"
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
  const none = (
    <Text col={colors.textDisabled} fos={fontSize.body}>
      {tCard('noTrips')}
    </Text>
  );

  return (
    <Card padded={false} lift="flat">
      <YStack p={CARD_PAD} gap={BLOCK_GAP} f={1}>
        {/* Đầu thẻ: ảnh + tên + SĐT là MỘT vùng bấm mở chi tiết; "…" bên phải. */}
        <XStack ai="flex-start" gap={space.sm}>
          <Pressable
            style={{ flex: 1, minWidth: 0 }}
            onPress={() => onIntent(driver, 'view')}
            accessibilityRole="button"
            accessibilityLabel={tCard('openDetail', { name: driver.name })}
          >
            <XStack ai="center" gap={space.sm}>
              <Avatar name={driver.name} url={driver.account.avatarUrl ?? null} size={AVATAR} />
              <YStack f={1} minWidth={0} gap={space.xs}>
                <Text
                  col={colors.text}
                  fos={fontSize.bodyLg}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {driver.name}
                </Text>
                <XStack ai="center" gap={space.sm} minWidth={0}>
                  <Text col={colors.textMuted} fos={fontSize.body}>
                    {driver.phone}
                  </Text>
                  {accountName ? (
                    <>
                      <Text col={colors.textDisabled} fos={fontSize.body} aria-hidden>
                        |
                      </Text>
                      <Text f={1} col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
                        {tCard('accountName', { name: accountName })}
                      </Text>
                    </>
                  ) : null}
                </XStack>
              </YStack>
            </XStack>
          </Pressable>
          <IconButton
            icon="ellipsis-horizontal"
            label={tCard('menu', { name: driver.name })}
            onPress={() => setMenuOpen(true)}
          />
        </XStack>

        {/* Hình thức hợp tác (viên xám) + trạng thái liên kết. */}
        <YStack gap={space.xs}>
          <XStack flexWrap="wrap" ai="center" gap={space.sm}>
            <Pill
              label={domainLabel('driverType', driver.driverType, driver.driverType)}
              tone="neutral"
             
            />
            <Pill
              label={domainLabel('driverLinkStatus', driver.linkStatus, meta.label)}
              tone={pillToneOfStatusColor(
                driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED
                  ? STATUS_COLOR.DANGER
                  : meta.color,
              )}
             
            />
          </XStack>
          {historyNotes.length > 0 ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {historyNotes.join(LIST_SEPARATOR)}
            </Text>
          ) : null}
        </YStack>

        <LicenceBox driver={driver} />

        <YStack gap={space.sm}>
          <XStack jc="space-between" ai="baseline" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {tCard('activeTrips')}
            </Text>
            {driver.activeBookingCount > 0
              ? factLink(t('activeBookings', { count: driver.activeBookingCount }), () =>
                  onIntent(driver, 'view'),
                )
              : none}
          </XStack>
          <XStack jc="space-between" ai="baseline" gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {tCard('monthWage', { month: monthLabel })}
            </Text>
            {hasMonthWage
              ? factLink(
                  tCard('monthWageValue', {
                    amount: fmt.money(driver.monthWageTotal),
                    count: driver.monthCompletedTrips,
                  }),
                  () => onIntent(driver, 'trips'),
                )
              : none}
          </XStack>
        </YStack>

        {dropParts.length > 0 ? (
          <XStack ai="flex-start" gap={space.xs}>
            <Ionicons name="warning" size={fontSize.body} color={colors.warningStrong} />
            <Text f={1} col={colors.warningStrong} fos={fontSize.bodySm}>
              {dropParts.join(LIST_SEPARATOR)}
            </Text>
          </XStack>
        ) : null}

        {/* Hàng nút compact tràn ngang như thẻ Đơn thuê: nút CUỐI là nút chính (dải vàng). */}
        <XStack gap={space.sm} mt="auto">
          {footerActions.map((action, index) => (
            <YStack key={action.key} f={1} minWidth={0}>
              <Button
                label={action.label}
                icon={action.icon}
                variant="gradient"
                size="compact"
                disabled={action.disabled}
                onPress={action.onPress}
              />
            </YStack>
          ))}
        </XStack>
      </YStack>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={driver.name}>
        <YStack gap={space.sm}>
          {menu.map((item) => (
            <Button
              key={item.key}
              label={item.label}
              variant={item.danger ? 'dangerOutline' : 'outline'}
              disabled={pending && item.key !== 'view'}
              onPress={() => {
                setMenuOpen(false);
                onIntent(driver, item.key);
              }}
            />
          ))}
          <Button
            label={tCommon('actions.close')}
            variant="ghost"
            onPress={() => setMenuOpen(false)}
          />
        </YStack>
      </BottomSheet>
    </Card>
  );
}

/** Khối bằng lái — nền xám bo 12, như `LicenceBox` web. */
function LicenceBox({ driver }: { driver: Driver }) {
  const colors = useColors();
  const t = useTranslations('Drivers.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const licence = driver.licence;

  const head = (extra?: ReactNode) => (
    <XStack
      ai="center"
      gap={space.sm}
      pb={space.sm}
      borderBottomWidth={1}
      borderBottomColor={colors.borderSubtle}
    >
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
        {t('licence')}
      </Text>
      {extra}
    </XStack>
  );

  if (licence.state !== DRIVER_LICENCE_STATE.VERIFIED) {
    const pending = licence.state === DRIVER_LICENCE_STATE.PENDING;
    return (
      <YStack p={space.md} br={radius.control} bg={colors.background} gap={space.sm}>
        {head()}
        <XStack ai="center" gap={space.md}>
          <YStack
            w={EMPTY_ICON}
            h={EMPTY_ICON}
            br={radius.pill}
            bg={colors.surface}
            ai="center"
            jc="center"
          >
            {/* Web: `LoadingOutlined` khi đang gửi lại, `FileSearchOutlined` khi chưa có bằng. */}
            <AntIcon
              icon={pending ? LoadingOutlined : FileSearchOutlined}
              size={fontSize.bodyLg}
              color={colors.textMuted}
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={space.xs}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
              {pending ? t('pendingTitle') : t('noneTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {pending ? t('pendingHint') : t('noneHint')}
            </Text>
          </YStack>
        </XStack>
      </YStack>
    );
  }

  const mismatch = holderNameDiffers(licence.fullName, driver.name);
  const classes = licence.classes ?? [];
  const row = (label: string, value: string, upper = false) => (
    <XStack jc="space-between" ai="baseline" gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.body}>
        {label}
      </Text>
      <Text
        f={1}
        ta="right"
        col={colors.text}
        fos={fontSize.body}
        fow={fontWeight.medium}
        numberOfLines={1}
        {...(upper ? { textTransform: 'uppercase' as const } : {})}
      >
        {value}
      </Text>
    </XStack>
  );

  return (
    <YStack p={space.md} br={radius.control} bg={colors.background} gap={space.sm}>
      {head(
        <>
          <XStack ai="center" gap={space.xs}>
            <Ionicons
              name={mismatch ? 'warning' : 'checkmark-circle'}
              size={fontSize.bodyLg}
              color={mismatch ? colors.warningStrong : colors.success}
            />
            <Text col={mismatch ? colors.warningStrong : colors.success} fos={fontSize.body}>
              {mismatch ? t('needsCheck') : t('verified')}
            </Text>
          </XStack>
          {classes.length > 0 ? (
            <Text
              marginLeft="auto"
              col={colors.text}
              fos={fontSize.body}
              fow={fontWeight.semibold}
              textTransform="uppercase"
            >
              {t('classes', { classes: classes.join(', ') })}
            </Text>
          ) : null}
        </>,
      )}
      <YStack gap={space.xs}>
        {row(t('holder'), licence.fullName ?? '-', true)}
        {row(t('expiry'), licence.expiresOn ? fmt.dateKey(licence.expiresOn) : t('noExpiry'))}
        {row(t('kind'), licence.kind ? domainLabel('driverLicenceKind', licence.kind) : '-')}
      </YStack>
      {mismatch ? (
        <Text col={colors.warningStrong} fos={fontSize.bodySm}>
          {t('nameMismatch')}
        </Text>
      ) : null}
    </YStack>
  );
}

/** `memo`: HÀNG trong một danh sách dài — màn chứa nó dựng lại vì đủ thứ không liên quan. */
export const DriverCard = memo(DriverCardImpl);
