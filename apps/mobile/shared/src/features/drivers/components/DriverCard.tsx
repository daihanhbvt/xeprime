import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  STATUS_COLOR,
} from '@xeprime/types';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { IconLine } from '@/components/ui/IconLine';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { Driver } from '../api';
import { DriverLicenceDetail, DriverLicenceStateBadge } from './DriverLicenceStateBadge';

/** Ý định trên một liên kết — xác nhận (tạm khoá, kết thúc/thu hồi) nằm ở MÀN, không ở thẻ. */
export type DriverCardIntent = 'reinvite' | 'edit' | 'suspend' | 'resume' | 'end';

/**
 * MỘT liên kết tài xế (ADR 0063) — bản native của một hàng bảng `DriversPage` bên web.
 *
 * Vạch màu mép trái + TRẠNG THÁI LIÊN KẾT ở góc trên phải, cạnh tên: đó là thứ quyết định người
 * này gán vào chuyến được hay không. Dải nhãn bên dưới: loại tài xế (trung tính), trạng thái bằng
 * lái của tài khoản, số chuyến đang gán. Thao tác đúng luật ẩn của web: sửa/kết thúc chỉ khi liên
 * kết còn mở; tạm khoá khi đang liên kết; mở khoá khi đang tạm khoá; lời mời thì "thu hồi".
 */
function DriverCardImpl({
  driver,
  canManage,
  pending,
  onIntent,
}: {
  driver: Driver;
  canManage: boolean;
  /** Có mutation đang chạy trên CHÍNH liên kết này — cả thanh thao tác khoá lại. */
  pending: boolean;
  onIntent: (driver: Driver, intent: DriverCardIntent) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();

  const meta = DRIVER_LINK_STATUS_META[driver.linkStatus];
  const statusLabel = domainLabel('driverLinkStatus', driver.linkStatus, meta.label);
  const typeLabel = domainLabel('driverType', driver.driverType, driver.driverType);
  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus);
  const invited = driver.linkStatus === DRIVER_LINK_STATUS.INVITED;

  const badges: BadgeRowItem[] = [
    {
      key: 'type',
      label: typeLabel,
      node: <StatusBadge label={typeLabel} color={STATUS_COLOR.NEUTRAL} size="sm" />,
    },
    {
      key: 'licence',
      label: domainLabel('driverLicenceState', driver.licence.state),
      node: <DriverLicenceStateBadge state={driver.licence.state} />,
    },
    ...(driver.activeBookingCount > 0
      ? [
          {
            key: 'activeBookings',
            label: t('activeBookings', { count: driver.activeBookingCount }),
            node: (
              <StatusBadge
                label={t('activeBookings', { count: driver.activeBookingCount })}
                color={STATUS_COLOR.INFO}
                size="sm"
              />
            ),
          },
        ]
      : []),
  ];

  const icon = (name: string) => name as IconName;
  const actions: CardAction[] = canManage
    ? [
        // Mời lại: liên kết đã đóng (từ chối/kết thúc) và chưa có liên kết mở nào với cùng SĐT.
        ...(!open && !driver.currentOpenLinkStatus
          ? [
              {
                key: 'reinvite',
                label: t('actions.reinvite'),
                icon: icon('person-add-outline'),
                disabled: pending,
                onPress: () => onIntent(driver, 'reinvite'),
              },
            ]
          : []),
        ...(open
          ? [
              {
                key: 'edit',
                label: tActions('edit'),
                icon: icon('create-outline'),
                disabled: pending,
                onPress: () => onIntent(driver, 'edit'),
              },
            ]
          : []),
        ...(driver.linkStatus === DRIVER_LINK_STATUS.ACTIVE
          ? [
              {
                key: 'suspend',
                label: t('actions.suspend'),
                icon: icon('pause-circle-outline'),
                disabled: pending,
                onPress: () => onIntent(driver, 'suspend'),
              },
            ]
          : []),
        ...(driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED
          ? [
              {
                key: 'resume',
                label: t('actions.resume'),
                icon: icon('play-circle-outline'),
                disabled: pending,
                onPress: () => onIntent(driver, 'resume'),
              },
            ]
          : []),
        ...(open
          ? [
              {
                key: 'end',
                label: invited ? t('actions.revoke') : t('actions.end'),
                icon: icon(invited ? 'close-circle-outline' : 'person-remove-outline'),
                tone: 'danger' as const,
                disabled: pending,
                onPress: () => onIntent(driver, 'end'),
              },
            ]
          : []),
      ]
    : [];

  const accountName =
    driver.account.displayName && driver.account.displayName !== driver.name
      ? t('columns.accountName', { name: driver.account.displayName })
      : null;

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={meta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            <XStack ai="center" gap={space.xs}>
              <Text
                f={1}
                col={colors.text}
                fos={fontSize.body}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {driver.name}
              </Text>
              <StatusBadge label={statusLabel} color={meta.color} size="sm" />
            </XStack>

            {driver.linkStatus === DRIVER_LINK_STATUS.ENDED && driver.endedByParty ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
                  ? t('endedBy.driver')
                  : t('endedBy.employer')}
              </Text>
            ) : null}
            {driver.currentOpenLinkStatus ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {driver.currentOpenLinkStatus === DRIVER_LINK_STATUS.INVITED
                  ? t('reinvite.alreadyInvited')
                  : t('reinvite.alreadyLinked')}
              </Text>
            ) : null}

            <BadgeRows items={badges} />

            <IconLine icon="call-outline" iconTone={colors.success} strong>
              {driver.phone}
            </IconLine>
            {accountName ? <IconLine icon="person-outline">{accountName}</IconLine> : null}
            <DriverLicenceDetail licence={driver.licence} invitedName={driver.name} />
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}

/** `memo`: HÀNG trong một danh sách dài — màn chứa nó dựng lại vì đủ thứ không liên quan. */
export const DriverCard = memo(DriverCardImpl);
