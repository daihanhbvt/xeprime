import { memo } from 'react';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_LINK_END_PARTY, DRIVER_LINK_STATUS, DRIVER_LINK_STATUS_META } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { InlineAction } from '@/components/ui/InlineAction';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { MyDriverLink } from '../api';

/** Ý định trên một liên kết — xác nhận (từ chối, ngừng) nằm ở MÀN, không ở thẻ. */
export type DriverLinkIntent = 'accept' | 'decline' | 'leave';

/**
 * MỘT lời mời / liên kết tài xế của tài khoản này — bản native của `DriverLinkCard` (web). Vạch
 * màu mép trái + trạng thái liên kết ở góc phải. Lời mời: đồng ý / từ chối; đang lái (kể cả bị
 * tạm khoá): ngừng làm tài xế; đã kết thúc: chỉ đọc.
 */
function DriverLinkCardImpl({
  link,
  pending,
  onIntent,
  onViewTrips,
}: {
  link: MyDriverLink;
  /** Có thao tác đang chạy trên CHÍNH liên kết này. */
  pending: boolean;
  onIntent: (link: MyDriverLink, intent: DriverLinkIntent) => void;
  onViewTrips: () => void;
}) {
  const t = useTranslations('Driving.links');
  const tDialog = useTranslations('Driving.linkDialog');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const meta = DRIVER_LINK_STATUS_META[link.linkStatus];
  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const working =
    link.linkStatus === DRIVER_LINK_STATUS.ACTIVE ||
    link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED;
  const closed = !invited && !working;

  const timeline = [
    closed && link.endedAt
      ? t('endedAt', { time: fmt.dateTime(link.endedAt) })
      : t('invitedAt', { time: fmt.dateTime(link.invitedAt) }),
    closed && link.endedByParty
      ? link.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
        ? t('endedByDriver')
        : t('endedByEmployer')
      : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const icon = (name: string) => name as IconName;
  const phone = link.employer.phone;
  const actions: CardAction[] = [
    ...(phone
      ? [
          {
            key: 'call',
            label: t('callEmployer', { phone }),
            icon: icon('call-outline'),
            onPress: () => void Linking.openURL(`tel:${phone}`),
          },
        ]
      : []),
    ...(invited
      ? [
          {
            key: 'decline',
            label: t('decline'),
            icon: icon('close-circle-outline'),
            tone: 'danger' as const,
            disabled: pending,
            onPress: () => onIntent(link, 'decline'),
          },
          {
            key: 'accept',
            label: t('accept'),
            icon: icon('checkmark-circle-outline'),
            disabled: pending,
            onPress: () => onIntent(link, 'accept'),
          },
        ]
      : []),
    ...(working
      ? [
          {
            key: 'leave',
            label: t('leave'),
            icon: icon('exit-outline'),
            tone: 'danger' as const,
            disabled: pending,
            onPress: () => onIntent(link, 'leave'),
          },
        ]
      : []),
  ];

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
                {link.employer.name}
              </Text>
              <StatusBadge
                label={domainLabel('driverLinkStatus', link.linkStatus, meta.label)}
                color={meta.color}
                size="sm"
              />
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {[
                domainLabel('driverEmployerKind', link.employer.kind),
                domainLabel('driverType', link.driverType),
              ].join(LIST_SEPARATOR)}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {timeline}
            </Text>
            {/* Liên hệ mở rộng + số chuyến (Figma popup `21788:71387`) — đủ thông tin như web. */}
            {[
              link.employerContact.representativeName
                ? `${tDialog('representative')}: ${link.employerContact.representativeName}`
                : null,
              link.employerContact.email,
              link.employerContact.areaName,
            ].some(Boolean) ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {[
                  link.employerContact.representativeName
                    ? `${tDialog('representative')}: ${link.employerContact.representativeName}`
                    : null,
                  link.employerContact.email,
                  link.employerContact.areaName,
                ]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              </Text>
            ) : null}
            {working ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {`${tDialog('completedTrips')}: ${fmt.count(link.completedTripCount)}`}
              </Text>
            ) : null}
            {link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? (
              <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {t('suspendedHint')}
              </Text>
            ) : null}
            {working && link.activeTripCount > 0 ? (
              <InlineAction
                label={t('activeTrips', { count: link.activeTripCount })}
                onPress={onViewTrips}
              />
            ) : null}
          </YStack>
          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}

/** `memo`: HÀNG của một danh sách cuộn. */
export const DriverLinkCard = memo(DriverLinkCardImpl);
