'use client';

import {
  CarOutlined,
  DollarOutlined,
  KeyOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { PLATFORM_TRIP_QUEUE, type PlatformTripQueue } from '@xeprime/types';
import { QueueRail } from '@/components/navigation/QueueRail';
import { TRIP_QUEUE_GROUPS, type TripQueueGroupKey } from '../trip-queues';
import type { TripSummary } from '../types';

export const TRIP_QUEUE_ICON: Readonly<
  Record<PlatformTripQueue, ComponentType<{ className?: string }>>
> = {
  [PLATFORM_TRIP_QUEUE.PENDING_APPROVAL]: UserSwitchOutlined,
  [PLATFORM_TRIP_QUEUE.AWAITING_HOLD]: DollarOutlined,
  [PLATFORM_TRIP_QUEUE.PICKUP_SOON]: KeyOutlined,
  [PLATFORM_TRIP_QUEUE.ACTIVE]: CarOutlined,
};

/** Nhãn hàng đợi — dùng chung cho cột hàng đợi, thẻ đếm và tiêu đề vùng nội dung. */
export function useTripQueueLabel() {
  const t = useTranslations('AdminTrips.queues');
  return (queue: PlatformTripQueue) => t(queue);
}

export function TripQueueRail({
  activeQueue,
  summary,
  onSelect,
}: {
  activeQueue: PlatformTripQueue;
  summary: TripSummary | undefined;
  onSelect: (queue: PlatformTripQueue) => void;
}) {
  const t = useTranslations('AdminTrips.queues');
  const label = useTripQueueLabel();
  const groupLabel: Record<TripQueueGroupKey, string> = {
    before: t('groups.before'),
    during: t('groups.during'),
  };

  return (
    <QueueRail<PlatformTripQueue>
      title={t('railTitle')}
      label={t('railLabel')}
      active={activeQueue}
      onSelect={onSelect}
      groups={TRIP_QUEUE_GROUPS.map((group) => ({
        key: group.key,
        label: groupLabel[group.key],
        items: group.queues.map((queue) => ({
          value: queue,
          label: label(queue),
          icon: TRIP_QUEUE_ICON[queue],
          count: summary ? summary.queues[queue].count : null,
        })),
      }))}
    />
  );
}
