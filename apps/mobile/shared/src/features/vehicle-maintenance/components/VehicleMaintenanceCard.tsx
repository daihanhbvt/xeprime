import { useTranslations } from 'use-intl';
import { Text, XStack, YStack } from 'tamagui';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  PERMISSION,
  type MaintenanceDueStatus,
} from '@xeprime/types';
import { BlockLink, BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { colors, fontSize, space } from '@/theme/tokens';
import { useMaintenanceProfile } from '../hooks/use-maintenance';

/**
 * Thẻ "Bảo dưỡng & Số KM" trên hồ sơ xe — bản native của `VehicleMaintenanceCard`.
 *
 * Chỉ là CẢNH BÁO + đường dẫn sang màn làm việc; mọi thao tác (ghi số KM, ghi lần bảo dưỡng,
 * sửa đồng hồ) nằm ở `VehicleMaintenanceScreen`. Thiếu quyền thì thẻ VẮNG MẶT hẳn thay vì hiện
 * một khung rỗng — cùng luật với web.
 *
 * Vì sao nó phải có mặt trên hồ sơ xe thay vì chỉ nằm sau một liên kết: "quá hạn bảo dưỡng" là
 * cảnh báo duy nhất trên màn này mà chủ xe không thấy được từ bất kỳ con số nào khác. Dải liên
 * kết có mục "Bảo dưỡng", nhưng một mục thì không nói được xe đang quá hạn bao nhiêu km.
 */
export function VehicleMaintenanceCard({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();

  const { has } = usePermissions();
  const canView = has(PERMISSION.VEHICLE_MAINTENANCE_VIEW);
  const profile = useMaintenanceProfile(vehicleId, canView);

  if (!canView) return null;

  const manage = (
    <BlockLink
      label={t('card.manage')}
      onPress={() =>
        navigateOnce(ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE))
      }
    />
  );

  if (profile.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <BlockTitle>{t('card.title')}</BlockTitle>
          <SkeletonText lines={3} />
        </YStack>
      </Card>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <BlockTitle>{t('card.title')}</BlockTitle>
          <Callout tone="danger">{t('card.loadError')}</Callout>
        </YStack>
      </Card>
    );
  }

  const data = profile.data;
  const dueStatus = data.dueStatus as MaintenanceDueStatus;
  const insufficient = tCommon('labels.insufficientData');

  /*
   * Ngày thay nhớt gần nhất về dạng `YYYY-MM-DD` (không có giờ) — ghép `T00:00:00.000Z` đúng
   * như web trước khi đưa vào bộ định dạng, nếu không `fmt.date` nhận một chuỗi nó không đọc được.
   */
  const lastService = data.lastServiceAt
    ? `${fmt.date(`${data.lastServiceAt}T00:00:00.000Z`)}${
        data.lastServiceKm != null ? ` · ${fmt.km(data.lastServiceKm)}` : ''
      }`
    : insufficient;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle action={manage}>{t('card.title')}</BlockTitle>

        {dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE ? (
          <Callout tone="danger">
            {t('card.overdue', { value: fmt.remainingKm(data.remainingKm) })}
          </Callout>
        ) : null}
        {dueStatus === MAINTENANCE_DUE_STATUS.DUE_SOON ? (
          <Callout tone="warning">
            {t('card.dueSoon', { value: fmt.remainingKm(data.remainingKm) })}
          </Callout>
        ) : null}
        {/*
          Chưa có số KM là một ca RIÊNG, không phải một tình trạng: không có số thì không mốc nào
          tính được, nên nó hiện song song với hai cảnh báo trên chứ không thay thế chúng.
        */}
        {data.currentOdometerKm == null ? (
          <Callout tone="warning" title={t('card.noOdometer')}>
            {t('card.noOdometerHint')}
          </Callout>
        ) : null}

        <DataRow labelWide label={t('card.currentKm')} value={fmt.km(data.currentOdometerKm)} />
        <DataRow
          labelWide
          label={t('card.nextDue')}
          value={data.nextMaintenanceKm != null ? fmt.km(data.nextMaintenanceKm) : insufficient}
        />
        <DataRow labelWide label={t('card.lastOilChange')} value={lastService} />
        {/*
          Tình trạng là một HUY HIỆU màu, không phải chữ trong cột giá trị — `DataRow` chỉ nhận
          `value: string`. Dựng bằng XStack đúng như `SourceCard` làm với chip hình thức nguồn xe.
        */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('card.condition')}
          </Text>
          <StatusBadge
            label={domainLabel(
              'maintenanceDueStatus',
              dueStatus,
              MAINTENANCE_DUE_STATUS_META[dueStatus].label,
            )}
            color={MAINTENANCE_DUE_STATUS_META[dueStatus].color}
            size="sm"
          />
        </XStack>
      </YStack>
    </Card>
  );
}
