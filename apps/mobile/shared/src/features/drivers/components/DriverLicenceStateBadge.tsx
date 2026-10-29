import { useTranslations } from 'use-intl';
import { Text, YStack } from 'tamagui';
import {
  DRIVER_LICENCE_STATE,
  STATUS_COLOR,
  type DriverLicenceState,
  type StatusColor,
} from '@xeprime/types';
import { holderNameDiffers, LIST_SEPARATOR } from '@xeprime/domain';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/tokens';
import type { DriverLicenceSummary } from '../api';

const COLOR: Readonly<Record<DriverLicenceState, StatusColor>> = {
  [DRIVER_LICENCE_STATE.VERIFIED]: STATUS_COLOR.SUCCESS,
  [DRIVER_LICENCE_STATE.PENDING]: STATUS_COLOR.WARNING,
  [DRIVER_LICENCE_STATE.NONE]: STATUS_COLOR.NEUTRAL,
};

/**
 * Bằng lái của tài xế nhìn từ phía bên thuê — CHỈ ba mức (ADR 0063): không ảnh, không số bằng.
 * Bản native của `DriverLicenceStateTag` (web). Dùng chung cho thẻ tài xế và bộ chọn gán đơn.
 */
export function DriverLicenceStateBadge({ state }: { state: DriverLicenceState }) {
  const domainLabel = useDomainLabel();
  return (
    <StatusBadge
      label={domainLabel('driverLicenceState', state)}
      color={COLOR[state] ?? STATUS_COLOR.NEUTRAL}
      size="sm"
    />
  );
}

/** Dòng hạng + hạn khi bằng ĐÃ xác thực — `null` ở hai mức còn lại. */
export function DriverLicenceDetail({
  licence,
  invitedName,
}: {
  licence: DriverLicenceSummary;
  /** Tên bên thuê nhập khi mời — lệch với tên trên bằng thì cảnh báo. */
  invitedName?: string;
}) {
  const colors = useColors();
  const domainLabel = useDomainLabel();
  const t = useTranslations('Drivers');
  const fmt = useAppFormat();
  if (licence.state !== DRIVER_LICENCE_STATE.VERIFIED) return null;

  // `expiresOn` là NGÀY LỊCH `YYYY-MM-DD` — `dateKey` không mượn nửa đêm theo máy.
  const expiry = licence.expiresOn
    ? t('licence.validUntil', { date: fmt.dateKey(licence.expiresOn) })
    : t('licence.noExpiry');
  const text = [
    licence.classes.length > 0
      ? t('licence.classes', { classes: licence.classes.join(', ') })
      : null,
    expiry,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <YStack>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {text}
      </Text>
      {licence.fullName ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {[
            t('licence.holder', { name: licence.fullName }),
            licence.kind
              ? t('licence.kind', { kind: domainLabel('driverLicenceKind', licence.kind) })
              : null,
          ]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
        </Text>
      ) : null}
      {invitedName && holderNameDiffers(licence.fullName, invitedName) ? (
        <Text col={colors.warning} fos={fontSize.label}>
          {t('licence.nameMismatch')}
        </Text>
      ) : null}
    </YStack>
  );
}
