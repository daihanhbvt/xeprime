import { useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_SOURCE,
  holdRemainingMs,
  longClockText,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { BookingDetail } from '../api';

type BookingDriver = NonNullable<BookingDetail['driver']>;

/** Nhịp của đồng hồ hạn nhận chuyến - hiện cả giây (Figma "30:15"). */
const CLOCK_TICK_MS = 1_000;
/** Dưới mốc này đồng hồ đổi sắc thái khẩn (web `RESPOND_URGENT_MS`). */
const RESPOND_URGENT_MS = 5 * 60_000;

/**
 * Góc phải hàng tài xế (web `SourceBadge`, Figma `23807:73143`): bằng lái của tài xế liên kết (viên
 * xanh nhạt + dấu tích khi đã xác thực, đỏ khi chưa) hoặc nhãn nguồn xám (nội bộ / ngoài hệ thống).
 */
export function DriverSourceBadge({ driver }: { driver: BookingDriver }) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking');
  const tCard = useTranslations('Drivers.booking.card');
  if (driver.source === DRIVER_SOURCE.INTERNAL || driver.source === DRIVER_SOURCE.EXTERNAL) {
    return (
      <Pill bg={colors.background} fg={colors.textMuted}>
        {t(driver.source === DRIVER_SOURCE.INTERNAL ? 'internalTag' : 'externalTag')}
      </Pill>
    );
  }
  const licence = driver.licence;
  if (!licence) return null;
  if (licence.state === DRIVER_LICENCE_STATE.VERIFIED) {
    return (
      <Pill bg={colors.successSurface} fg={colors.success} tick>
        {licence.classes.length > 0
          ? tCard('licence', { classes: licence.classes.join(', ') })
          : tCard('licenceVerified')}
      </Pill>
    );
  }
  return (
    <Pill bg={colors.dangerSurface} fg={colors.danger}>
      {tCard('licenceUnverified')}
    </Pill>
  );
}

function Pill({
  bg,
  fg,
  tick = false,
  children,
}: {
  bg: string;
  fg: string;
  tick?: boolean;
  children: string;
}) {
  return (
    <XStack ai="center" gap={space.xs} px={space.sm} py={2} br={radius.pill} bg={bg} flexShrink={0}>
      {tick ? <LineIcon name="tick" size={12} color={fg} /> : null}
      <Text col={fg} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Khung "Chờ tài xế nhận chuyến" (web `.pendingBox`, ADR 0066): nền vàng nhạt, đồng hồ đếm ngược tới
 * hạn trả lời ở bên phải. Mốc do server chốt - đây chỉ đếm.
 */
export function DriverPendingBox({ driver }: { driver: BookingDriver }) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking');
  const tCard = useTranslations('Drivers.booking.card');
  const fmt = useAppFormat();
  return (
    <XStack
      ai="center"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.md}
      bg={colors.warningSurface}
    >
      <LineIcon name="time-circle" size={18} color={colors.warningStrong} />
      <YStack f={1} minWidth={0}>
        <Text
          col={colors.warningStrong}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {tCard('pendingTitle')}
        </Text>
        <Text col={colors.warningStrong} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {driver.respondBy
            ? tCard('pendingTime', {
                assigned: fmt.time(driver.assignedAt),
                deadline: fmt.shortDateTime(driver.respondBy),
              })
            : t('assignedAt', { time: fmt.dateTime(driver.assignedAt) })}
        </Text>
      </YStack>
      {driver.respondBy ? <RespondClock deadline={driver.respondBy} /> : null}
    </XStack>
  );
}

/** Đồng hồ "30:15" tới hạn tài xế trả lời (web `RespondClock`). */
function RespondClock({ deadline }: { deadline: string }) {
  const colors = useColors();
  const tCard = useTranslations('Drivers.booking.card');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (holdRemainingMs(deadline) <= 0) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (holdRemainingMs(deadline) <= 0) clearInterval(timer);
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);
  const remaining = holdRemainingMs(deadline, new Date(now));
  if (remaining <= 0) return null;
  const clock = longClockText(remaining);
  return (
    <Text
      col={remaining < RESPOND_URGENT_MS ? colors.danger : colors.warningStrong}
      fos={typeScale.title.fontSize}
      lh={typeScale.title.lineHeight}
      fow={fontWeight.semibold}
      fontVariant={TABULAR}
      accessibilityLabel={tCard('countdown', { time: clock })}
    >
      {clock}
    </Text>
  );
}

const TABULAR: ('tabular-nums')[] = ['tabular-nums'];
