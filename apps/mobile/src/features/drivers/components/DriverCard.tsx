import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_STATUS, DRIVER_STATUS_META, STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { LIST_SEPARATOR, nowInAppTz, startOfAppDay } from '@xeprime/domain';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { IconLine } from '@/components/ui/IconLine';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { Driver } from '../api';

/** Ngưỡng nhắc GPLX sắp hết hạn (ngày) — đủ thời gian đi gia hạn, không nhắc quá sớm. */
const LICENSE_WARN_DAYS = 30;

/**
 * Hạn GPLX ở dạng ĐỌC ĐƯỢC: hết hạn, sắp hết hạn, hay còn hạn dài.
 *
 * Trả về `null` khi chưa khai hạn — không bịa ra một nhãn "chưa rõ", vì tài xế chưa khai GPLX
 * không phải tài xế có GPLX hỏng.
 *
 * `licenseExpiresAt` là NGÀY LỊCH `YYYY-MM-DD` (cột `@db.Date`), không phải mốc thời gian. Đưa
 * nó qua `dayjs(value)` là mượn nửa đêm THEO MÁY rồi in lại theo giờ VN — trên máy đặt ở UTC,
 * hạn 03/09 hiện thành 04/09. Ranh giới "hết hạn" thì phải là mốc thật: hết ngày đó theo giờ VN.
 */
function useLicenseState(licenseExpiresAt: string | null): {
  /** Đang là VẤN ĐỀ (hết hạn hoặc sắp) ⇒ lên dải nhãn; còn hạn dài thì nằm ở dòng giấy tờ. */
  urgent: boolean;
  label: string;
  color: StatusColor;
} | null {
  const t = useTranslations('Drivers');
  const fmt = useAppFormat();
  if (!licenseExpiresAt) return null;

  const daysLeft = startOfAppDay(licenseExpiresAt).endOf('day').diff(nowInAppTz(), 'day');
  const date = fmt.dateKey(licenseExpiresAt);

  if (daysLeft < 0) {
    return { urgent: true, label: t('license.expired', { date }), color: STATUS_COLOR.DANGER };
  }
  if (daysLeft <= LICENSE_WARN_DAYS) {
    return { urgent: true, label: t('license.expired', { date }), color: STATUS_COLOR.WARNING };
  }
  return { urgent: false, label: t('license.validUntil', { date }), color: STATUS_COLOR.NEUTRAL };
}

/**
 * MỘT tài xế trong danh sách — bản native của một hàng `DataTable` bên web.
 *
 * **Thẻ CHẬT, đúng nhịp của `VehicleCard`: đệm 8, khe 4.** Bản trước dùng đệm 16 / khe 8 cùng
 * một đĩa 32pt, cao hơn 220pt để nói đúng năm mẩu chữ — trên một danh sách nhân sự dài thì đó là
 * mất gần một nửa số người thấy được mỗi màn.
 *
 * **TRẠNG THÁI ở góc trên phải, cạnh tên.** Đó là thứ quyết định người này còn gán vào đơn được
 * hay không, tức câu hỏi đầu tiên của người đang mở danh sách nhân sự ra để phân xe — ở cuối hàng
 * tên thì nó đọc được cùng lúc với cái tên, không phải rơi xuống dòng sau. Trước đó chỗ này là
 * LOẠI tài xế: một thông tin phân loại, không chặn việc gì, mà lại chiếm đúng vị trí đắt nhất thẻ.
 *
 * Loại tài xế xuống dải nhãn bên dưới, viên TRUNG TÍNH. Nó từng bị đẩy khỏi dải đó vì đứng cạnh
 * viên trạng thái có màu thì làm loãng dải — nhưng trạng thái nay không còn ở đấy nữa, nên phản
 * đối cũ hết hiệu lực: dải giờ đọc thành "người này thuộc loại gì, và đang vướng gì".
 *
 * Màu để dành cho hai chỗ mang tin: VẠCH trạng thái ở mép trái và dải viên nhãn.
 *
 * Nhãn hạn GPLX theo đúng ba nhánh của web: hết hạn (đỏ — server chặn gán vào đơn mới), sắp hết
 * hạn ≤30 ngày (vàng), còn hạn dài thì chỉ in ngày ở dòng giấy tờ. Chưa khai hạn thì KHÔNG bịa
 * nhãn nào.
 */
export function DriverCard({
  driver,
  canManage,
  readOnly = false,
  pending,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  driver: Driver;
  canManage: boolean;
  /** Gói hết hạn (ADR 0027 điều 3) — thao tác vẫn HIỆN, chỉ khoá lại, không ẩn đi. */
  readOnly?: boolean;
  /** Có mutation đang chạy trên CHÍNH tài xế này — cả thanh thao tác khoá lại. */
  pending: boolean;
  onEdit: (driver: Driver) => void;
  onToggleStatus: (driver: Driver) => void;
  onDelete: (driver: Driver) => void;
}) {
  const t = useTranslations('Drivers');
  const tActions = useTranslations('Common.actions');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  const isActive = driver.status === DRIVER_STATUS.ACTIVE;
  const meta = DRIVER_STATUS_META[driver.status];
  const statusLabel = domainLabel('driverStatus', driver.status, meta.label);
  const license = useLicenseState(driver.licenseExpiresAt ?? null);

  const typeLabel = domainLabel('driverType', driver.driverType, driver.driverType);

  /* Cột `papers` của web, cộng hạn GPLX khi hạn còn dài — cả ba là "giấy tờ của người này". */
  const papers =
    [driver.licenseNo, driver.idNo, license?.urgent === false ? license.label : null]
      .filter(Boolean)
      .join(LIST_SEPARATOR) || tCommon('emptyValue');

  const badges: BadgeRowItem[] = [
    {
      key: 'type',
      label: typeLabel,
      node: <StatusBadge label={typeLabel} color={STATUS_COLOR.NEUTRAL} size="sm" />,
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
    ...(license?.urgent
      ? [
          {
            key: 'license',
            label: license.label,
            node: <StatusBadge label={license.label} color={license.color} size="sm" />,
          },
        ]
      : []),
  ];

  /*
   * ĐÚNG ba thao tác của web, cùng thứ tự và cùng luật ẩn. Xác nhận cho "Ngừng hoạt động" và
   * "Xoá" nằm ở MÀN (`AlertDialog`), không ở đây — thẻ chỉ báo ý định.
   */
  const actionsDisabled = pending || readOnly;
  const actions: CardAction[] = canManage
    ? [
        {
          key: 'edit',
          label: tActions('edit'),
          icon: 'create-outline' as IconName,
          disabled: actionsDisabled,
          onPress: () => onEdit(driver),
        },
        {
          key: 'toggle',
          label: isActive ? t('actions.deactivate') : t('actions.activate'),
          icon: (isActive ? 'pause-circle-outline' : 'play-circle-outline') as IconName,
          disabled: actionsDisabled,
          onPress: () => onToggleStatus(driver),
        },
        {
          key: 'delete',
          label: tActions('delete'),
          icon: 'trash-outline' as IconName,
          tone: 'danger' as const,
          disabled: actionsDisabled,
          onPress: () => onDelete(driver),
        },
      ]
    : [];

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={meta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            {/* Tên và TRẠNG THÁI chung một hàng, hai đầu — cùng khuôn với thẻ chi nhánh. */}
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

            {/* Dải nhãn dưới tên: loại tài xế, rồi những gì đang vướng (đơn đang chạy, hạn GPLX). */}
            <BadgeRows items={badges} />

            {/* Số điện thoại là mẩu người ta mở màn này ra để LẤY — chữ đậm, hình xanh lá như nút gọi. */}
            <IconLine icon="call-outline" iconTone={colors.success} strong>
              {driver.phone}
            </IconLine>

            <IconLine icon="card-outline">{papers}</IconLine>
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}
