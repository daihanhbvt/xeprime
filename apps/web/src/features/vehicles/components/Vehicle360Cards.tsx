'use client';

/**
 * Các thẻ của Hồ sơ xe (Figma Partner-XePrime section `23672:25621`, 03/11/2026) — bố cục do
 * `Vehicle360Overview` quyết định, mỗi thẻ ở đây tự gác quyền/cờ gói của chính nó.
 */

import {
  ArrowRightOutlined,
  CheckOutlined,
  DashboardOutlined,
  EditOutlined,
  ExclamationCircleFilled,
  InfoCircleFilled,
  PictureOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Badge, Button, Skeleton, Switch } from 'antd';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  SERVICE_TYPE,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_IMAGE_TYPE,
  VEHICLE_SOURCE_TYPE,
  requiredVehicleImageTypes,
  topVehicleAlertSeverity,
  type ServiceType,
  type VehicleAlertSeverity,
  type VehicleSourceType,
} from '@xeprime/types';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { VEHICLE_EDIT_TAB, VEHICLE_MANAGE_SECTION } from '@/constants/routes';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useAutoAcceptToggle } from '@/features/vehicle-manage/hooks/use-auto-accept-toggle';
import { useVehicleServiceSettings } from '@/features/vehicle-manage/hooks';
import type { VehicleServiceSetting } from '@/features/vehicle-manage/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useImageSlotLabel } from '../hooks/use-image-slot-label';
import { useVehicleAlertView } from '../hooks/use-vehicle-alert-view';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import { useVehicleSource } from '../hooks/use-vehicle-source';
import { useVehicleSpecItems, type VehicleSpecKey } from '../hooks/use-vehicle-spec-items';
import { discountedPriceVnd } from '../pricing';
import { vehiclePublicationTask } from '../publication';
import type { Vehicle360Summary, VehicleDetail } from '../types';
import { VehicleAlertList } from './VehicleAlerts';
import { VehiclePublicationTaskItem } from './VehiclePublicationTaskItem';
import styles from './Vehicle360Overview.module.css';

/* ─── Khung thẻ ───────────────────────────────────────────────────────────── */

/**
 * Khung thẻ của Hồ sơ xe — Figma "Nhóm thông tin" `23670:3504`: nền trắng, viền xám, bo 16, đệm 20,
 * tiêu đề 18/600 + liên kết vàng ở góc phải. Một khung cho mọi thẻ của trang để chúng không lệch
 * nhau từng px.
 */
export function Panel({
  title,
  subtitle,
  extra,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={cx(styles.panel, className)} aria-labelledby={headingId}>
      <div className={styles.panelHead}>
        <div className={styles.panelHeading}>
          <h3 id={headingId} className={styles.panelTitle}>
            {title}
          </h3>
          {subtitle ? <p className={styles.panelSubtitle}>{subtitle}</p> : null}
        </div>
        {extra ? <div className={styles.panelExtra}>{extra}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Liên kết vàng ở góc thẻ ("Xem đầy đủ →", "Chỉnh sửa giá"…). */
function PanelLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={styles.panelLink}>
      {icon ? decorativeIcon(icon) : null}
      {children}
    </Link>
  );
}

/* ─── Việc cần làm ────────────────────────────────────────────────────────── */

/**
 * Cảnh báo server nói TRÙNG với việc "đưa xe lên chợ" dựng ở client.
 *
 * `VehicleAlertsService` chỉ nhìn thấy `public_status` + ba trường bắt buộc, nên nó cho ra hai
 * dòng chữ không có nút. Trang chi tiết có trong tay cả bản ghi xe nên dựng được việc ĐẦY ĐỦ, có
 * checklist và có CTA — giữ cả hai là kể cùng một chuyện hai lần, lần thứ hai cụt hơn.
 *
 * Lọc ở ĐÂY chứ không ở server: thẻ xe ngoài danh sách vẫn cần hai cảnh báo đó, vì ở đó không
 * có chỗ cho một việc có nút.
 */
const PUBLICATION_ALERT_KINDS: readonly string[] = [
  VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED,
  VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO,
];

const TODO_TONE_CLASS: Record<VehicleAlertSeverity, string | undefined> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: styles.todoCritical,
  [VEHICLE_ALERT_SEVERITY.WARNING]: styles.todoWarning,
  [VEHICLE_ALERT_SEVERITY.INFO]: styles.todoInfo,
};

const TODO_TONE_ICON: Record<VehicleAlertSeverity, ReactNode> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: <ExclamationCircleFilled />,
  [VEHICLE_ALERT_SEVERITY.WARNING]: <ExclamationCircleFilled />,
  [VEHICLE_ALERT_SEVERITY.INFO]: <InfoCircleFilled />,
};

/**
 * Việc cần làm — cảnh báo vận hành TỪ SERVER (`VehicleAlertsService`, cùng phép tính với thẻ xe
 * ở danh sách và huy hiệu menu) cộng MỘT việc "đưa xe lên chợ" dựng tại chỗ từ bản ghi xe (ADR
 * 0048). Đây là lối DUY NHẤT gửi duyệt lại một chiếc xe bị trả về, nên nó ở lại dù design không vẽ
 * (chốt 03/11/2026) — nhưng CHỈ hiện khi có việc: không có gì để làm thì không dựng thẻ trống.
 *
 * Cảnh báo giấy tờ (quá hạn / sắp hạn) cũng đi qua đây, kèm đích xử lý — thẻ "Giấy tờ" riêng đã
 * gỡ (chốt 03/11).
 *
 * Thứ tự: việc lên chợ mức `critical`/`warning` lên ĐẦU; lời nhắc `info` ("đang chờ duyệt", "đang
 * tạm ẩn") xuống CUỐI. Nền thẻ đổi theo mức nặng nhất; màu không bao giờ là kênh duy nhất — từng
 * việc vẫn nói mức nghiêm trọng bằng chữ.
 */
export function TodoCard({
  vehicle,
  summary,
  loading,
  failed,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const alertView = useVehicleAlertView();
  const task = vehiclePublicationTask(vehicle);
  // Lọc theo năng lực + đổi đích về đúng tuyến TRƯỚC, rồi mới bỏ hai cảnh báo nói trùng với việc
  // "đưa xe lên chợ" dựng tại chỗ — hai phép lọc độc lập, thứ tự không đổi kết quả.
  const alerts = alertView(vehicle.id, summary?.alerts ?? []).filter(
    (alert) => !task || !PUBLICATION_ALERT_KINDS.includes(alert.kind),
  );
  const listReady = !loading && !failed && summary !== undefined;
  const taskLeads = task !== null && task.tone !== VEHICLE_ALERT_SEVERITY.INFO;

  /*
   * Không có việc thì không có thẻ. Đang tải mà chưa biết có việc gì: cũng không dựng — một khung
   * xương to ở đầu tab rồi biến mất làm cả trang nhảy. Tải hỏng thì NÓI (một dòng), vì "không thấy
   * việc nào" lúc đó không có nghĩa là "không có việc nào".
   */
  if (!task && (loading || (listReady && alerts.length === 0))) return null;

  // Gợi ý không phải "việc cần làm" nên không vào số đếm — huy hiệu là số việc thật.
  const count = (listReady ? alerts.length : 0) + (taskLeads ? 1 : 0);
  const taskItem = task ? <VehiclePublicationTaskItem vehicle={vehicle} task={task} /> : null;
  const shown = [...(listReady ? alerts : []), ...(task ? [{ severity: task.tone }] : [])];
  const tone = topVehicleAlertSeverity(shown);
  /*
   * "Xử lý ngay" dẫn tới việc ĐẦU BẢNG của server (đã sắp theo ưu tiên) và đứng NGAY DƯỚI chính
   * việc đó. Chỉ dựng khi việc đầu bảng là việc phải làm (không phải lời nhắc `info`), có đích, và
   * việc lên chợ không đứng trên nó (việc đó có nút riêng).
   */
  const lead = listReady && !taskLeads ? alerts[0] : undefined;
  const leadHref =
    lead && lead.severity !== VEHICLE_ALERT_SEVERITY.INFO ? (lead.href ?? null) : null;
  const leadAction = leadHref ? (
    <Link href={leadHref}>
      <Button type="primary" size="small" danger={tone === VEHICLE_ALERT_SEVERITY.CRITICAL}>
        {t('todo.handleNow')}
      </Button>
    </Link>
  ) : null;

  return (
    <Panel
      title={
        <span className={styles.todoTitle}>
          {tone ? (
            <span className={styles.todoIcon}>{decorativeIcon(TODO_TONE_ICON[tone])}</span>
          ) : null}
          {t('todo.title')}
        </span>
      }
      extra={count > 0 ? <Badge count={count} /> : null}
      className={cx(styles.todoCard, tone ? TODO_TONE_CLASS[tone] : undefined)}
    >
      {taskLeads ? taskItem : null}
      {failed ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : listReady ? (
        // `showEmpty` tắt: thẻ chỉ dựng khi có việc, câu "không có việc" ở đây là tự mâu thuẫn.
        <VehicleAlertList alerts={alerts} showEmpty={false} leadAction={leadAction} />
      ) : null}
      {/* Lời nhắc `info` (đang chờ duyệt, đang tạm ẩn) luôn xuống CUỐI, dưới mọi việc phải làm. */}
      {task && !taskLeads ? <div className={styles.todoNote}>{taskItem}</div> : null}
    </Panel>
  );
}

/* ─── Thông số chính ──────────────────────────────────────────────────────── */

/**
 * Lát cắt của thẻ "Thông số chính", theo thứ tự hiện. Ô nào ma trận `vehicleFieldPolicy` ẩn cho
 * xe này (số chỗ của xe máy, phân khúc của ô tô) tự vắng — `useVehicleSpecItems` đã bỏ nó.
 */
const KEY_SPECS: readonly VehicleSpecKey[] = [
  'year',
  'seats',
  'motorbikeCategory',
  'fuel',
  'transmission',
  'color',
];

/**
 * Thông số chính (Figma `23670:3504`) — sáu ô khách hỏi đầu tiên + số KM hiện tại. "Xem đầy đủ"
 * đổi sang tab Thông số kỹ thuật tại chỗ; "Nhập dữ liệu" mở tab Bảo dưỡng & số KM — nơi có hộp
 * điều chỉnh KM (bắt buộc lý do, gác quyền) — và vắng khi tuyến/quyền không có tab đó.
 *
 * Ô áp dụng mà chưa điền thì nói thiếu (`—`), để chủ xe thấy còn phải điền gì.
 */
export function KeySpecsCard({
  vehicle,
  summary,
  onViewAll,
  onOdometer,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  onViewAll: () => void;
  onOdometer?: () => void;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const specs = useVehicleSpecItems(vehicle);

  const empty = tLabels('emptyValue');
  const byKey = new Map(specs.map((item) => [item.key, item]));
  // Hãng + mẫu gộp một ô: "Toyota Vios" là cách người ta gọi chiếc xe, không phải hai thông số.
  const brandModel = [byKey.get('brand')?.value, byKey.get('model')?.value]
    .filter(Boolean)
    .join(' ');
  const tiles = [
    { key: 'brand-model', label: t('keySpecs.brandModel'), value: brandModel || empty },
    ...KEY_SPECS.flatMap((key) => {
      const item = byKey.get(key);
      return item ? [{ key, label: item.label, value: item.value ?? empty }] : [];
    }),
  ];

  return (
    <Panel
      title={t('keySpecs.title')}
      extra={
        <button
          type="button"
          className={styles.panelLink}
          onClick={onViewAll}
          aria-label={t('keySpecs.viewAllLabel')}
        >
          {t('keySpecs.viewAll')} {decorativeIcon(<ArrowRightOutlined />)}
        </button>
      }
    >
      <dl className={styles.specTiles}>
        {tiles.map((tile) => (
          <div key={tile.key} className={styles.specTile}>
            <dt title={tile.label}>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.odometerRow}>
        <p className={styles.odometerValue}>
          <span className={styles.odometerIcon}>{decorativeIcon(<DashboardOutlined />)}</span>
          <span className={styles.odometerLabel}>{t('keySpecs.odometer')}</span>
          <b>{summary ? fmt.km(summary.currentOdometerKm ?? null) : empty}</b>
        </p>
        {onOdometer ? (
          <button type="button" className={styles.panelLink} onClick={onOdometer}>
            {t('keySpecs.odometerInput')} {decorativeIcon(<ArrowRightOutlined />)}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

/* ─── Thư viện ảnh ────────────────────────────────────────────────────────── */

/**
 * Số ô HIỆN trong thẻ thư viện (hai hàng năm ô); ô cuối báo "+N". Ảnh dư vẫn nằm trong nhóm xem
 * trước (ẩn bằng CSS) nên mũi tên của trình xem toàn màn hình vẫn lướt qua đủ mọi ảnh.
 */
const GALLERY_VISIBLE = 10;

/**
 * Thư viện ảnh THEO GÓC (Figma `23670:3531`): mỗi góc bắt buộc của loại xe là một ô — có ảnh thì
 * ảnh + nhãn góc, chưa có thì ô trống có dấu + (bấm được khi người này sửa được ảnh). Ô trống là
 * thông tin: nó nói còn thiếu góc nào để lên chợ. Ảnh "Khác" đứng sau các góc.
 *
 * Mọi ảnh nằm trong MỘT nhóm xem trước: bấm ảnh nào cũng mở trình xem chung, lướt bằng mũi tên.
 */
export function MediaCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const slotLabel = useImageSlotLabel();
  const { vehicles: vehiclePaths } = useWorkspace();
  // Đi qua cổng của phiên hỗ trợ như mọi link khác — màn không mở trong phiên thì không dựng link.
  const manageHref = useAvailableHref()(
    vehiclePaths.part(vehicle.id, VEHICLE_EDIT_TAB.MEDIA, VEHICLE_MANAGE_SECTION.IMAGES),
  );
  const editHref = canEdit ? manageHref : null;
  const media = vehicle.media ?? [];
  const inMedia = (url: string) => media.some((item) => item.url === url);
  /*
   * Dữ liệu CŨ: ảnh bìa là một cột riêng có thể không nằm trong thư viện. Nó là ảnh mặt trước của
   * xe (từ 07/10/2026 bìa SUY từ ô mặt trước), nên lấp vào ô đó thay vì để ô trống.
   */
  const legacyCover =
    vehicle.mainImageUrl && !inMedia(vehicle.mainImageUrl) ? vehicle.mainImageUrl : null;
  const slots = requiredVehicleImageTypes(vehicle.vehicleType).map((type) => ({
    key: type,
    type,
    url:
      media.find((item) => item.type === type)?.url ??
      (type === VEHICLE_IMAGE_TYPE.FRONT ? legacyCover : null),
  }));
  const slotTypes = new Set<string>(slots.map((slot) => slot.type));
  // Ảnh ngoài các góc bắt buộc ("Khác", hoặc ảnh cũ chỉ có URL) đứng sau, không có ô trống.
  const extras =
    media.length > 0
      ? media
          .filter((item) => !slotTypes.has(item.type ?? ''))
          .map((item, index) => ({ key: `extra-${index}`, type: item.type, url: item.url }))
      : vehicle.images
          .filter((url) => url !== legacyCover)
          .map((url, index) => ({ key: `legacy-${index}`, type: null, url }));
  const tiles = [...slots, ...extras];
  const overflow = tiles.length - GALLERY_VISIBLE;

  return (
    <Panel
      title={t('media.title')}
      extra={
        editHref ? (
          <PanelLink href={editHref} icon={<PlusOutlined />}>
            {t('media.manageLink')}
          </PanelLink>
        ) : null
      }
    >
      <PreviewImageGroup>
        <ul className={styles.gallery} aria-label={t('media.title')}>
          {tiles.map((item, index) => {
            const label = item.type ? slotLabel(item.type) : null;
            const isCover = item.type === VEHICLE_IMAGE_TYPE.FRONT && item.url !== null;
            return (
              <li
                key={item.key}
                className={cx(styles.galleryItem, index >= GALLERY_VISIBLE && styles.galleryHidden)}
              >
                {item.url ? (
                  <PreviewImage
                    src={item.url}
                    alt={label ?? ''}
                    className={styles.galleryThumb}
                    loading="lazy"
                  />
                ) : editHref ? (
                  <Link
                    href={editHref}
                    className={styles.galleryEmpty}
                    aria-label={t('media.addSlot', { slot: label ?? '' })}
                  >
                    <EmptySlotIcon />
                  </Link>
                ) : (
                  <span className={styles.galleryEmpty}>
                    <EmptySlotIcon />
                  </span>
                )}
                {index === GALLERY_VISIBLE - 1 && overflow > 0 ? (
                  <span className={styles.galleryMore}>{t('media.more', { count: overflow })}</span>
                ) : null}
                {label ? (
                  <span className={styles.galleryLabel}>
                    {label}
                    {isCover ? <span className={styles.coverBadge}>{t('media.cover')}</span> : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </PreviewImageGroup>
    </Panel>
  );
}

function EmptySlotIcon() {
  return (
    <span className={styles.emptySlotIcon} aria-hidden="true">
      <PictureOutlined />
      <span className={styles.emptySlotPlus}>
        <PlusOutlined />
      </span>
    </span>
  );
}

/* ─── Nguồn xe & tài chính ────────────────────────────────────────────────── */

/**
 * Nguồn xe & Tài chính (Figma `23670:3113`).
 *
 * HAI mức, và ranh giới giữa chúng là ranh giới hai tuyến:
 *  - **Hình thức** (Sở hữu · Trả góp · Thuê lại · Hợp tác) nằm sẵn trên bản ghi xe — luôn hiện.
 *  - **Con số** là sổ sách của gian hàng, thuộc năng lực `finance`. Thiếu nó thì KHÔNG tải, và
 *    cũng không dựng đường dẫn "Xem hồ sơ".
 *
 * Con số đổi theo hình thức: sở hữu — ngày mua · giá trị xe; trả góp — ngân hàng · phải đóng mỗi
 * tháng; thuê lại — chủ xe · tiền thuê; hợp tác — chủ xe · % chia. Ô chưa khai thì không dựng.
 */
export function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { vehicles: vehiclePaths } = useWorkspace();

  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const can = useVehicleCapabilities();
  const sourceHref = useAvailableHref()(
    vehiclePaths.part(vehicle.id, VEHICLE_EDIT_TAB.SOURCE, null),
  );
  const canViewFinance = can.source && sourceHref !== null;
  const source = useVehicleSource(vehicle.id, canViewFinance);
  const detail = source.data?.detail ?? null;

  const rows: { key: string; label: string; value: string }[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    if (value) rows.push({ key, label, value });
  };
  if (detail) {
    switch (sourceType) {
      case VEHICLE_SOURCE_TYPE.FINANCED:
        push('bank', t('source.bank'), detail.bankName);
        push(
          'monthly',
          t('source.monthlyPayment'),
          detail.monthlyTotal ? fmt.money(detail.monthlyTotal) : null,
        );
        break;
      case VEHICLE_SOURCE_TYPE.RENTED:
        push('owner', t('source.owner'), detail.ownerName);
        push('rent', t('source.rent'), detail.monthlyRent ? fmt.money(detail.monthlyRent) : null);
        break;
      case VEHICLE_SOURCE_TYPE.PARTNERSHIP:
        push('owner', t('source.owner'), detail.ownerName);
        push(
          'share',
          t('source.share'),
          detail.commissionPercent
            ? t('source.sharePercent', { percent: detail.commissionPercent })
            : null,
        );
        break;
      default:
        push(
          'purchaseDate',
          t('source.purchaseDate'),
          detail.purchaseDate ? fmt.date(detail.purchaseDate) : null,
        );
        push(
          'purchasePrice',
          t('source.purchasePrice'),
          detail.purchasePrice ? fmt.money(detail.purchasePrice) : null,
        );
    }
  }

  return (
    <Panel
      title={t('source.title')}
      className={styles.pairItem}
      extra={
        canViewFinance && !source.isLoading && sourceHref ? (
          <PanelLink href={sourceHref}>
            {detail ? t('source.viewLink') : t('source.addLink')}{' '}
            {decorativeIcon(<ArrowRightOutlined />)}
          </PanelLink>
        ) : null
      }
    >
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>{t('source.kind')}</dt>
          <dd>
            <span className={styles.sourceTag}>{domainLabel('vehicleSourceType', sourceType)}</span>
          </dd>
        </div>
        {source.isLoading ? (
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
        ) : (
          rows.map((row) => (
            <div key={row.key} className={styles.kvRow}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))
        )}
      </dl>
      {canViewFinance && !source.isLoading && !source.isError && !detail ? (
        <p className={styles.muted}>{t('source.missing')}</p>
      ) : null}
    </Panel>
  );
}

/* ─── Tối ưu nhận chuyến ──────────────────────────────────────────────────── */

/**
 * Tối ưu nhận chuyến (Figma `23670:3122`) — công tắc "Tự động đồng ý nhận chuyến" NGAY trên thẻ,
 * lưu tức thì; cùng hook (`useAutoAcceptToggle`) với mục dịch vụ của màn sửa. Chỉ TỰ LÁI có công
 * tắc: có tài xế luôn chờ chủ xe duyệt (19/11/2026), thuê dài hạn gian hàng luôn tự chốt lịch
 * (ADR 0011) — nên xe không cho thuê tự lái không có thẻ này.
 */
export function AutomationCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const selfDrive = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE);
  const settings = useVehicleServiceSettings(selfDrive ? vehicle.id : undefined);
  if (!selfDrive) return null;
  const setting = settings.data?.find((item) => item.serviceType === SERVICE_TYPE.SELF_DRIVE);

  return (
    <Panel title={t('automation.title')} className={styles.pairItem}>
      {settings.isLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : settings.isError || !settings.data ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        <div className={styles.toggleList}>
          {setting ? (
            <AutoAcceptRow vehicleId={vehicle.id} setting={setting} canEdit={canEdit} />
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function AutoAcceptRow({
  vehicleId,
  setting,
  canEdit,
}: {
  vehicleId: string;
  setting: VehicleServiceSetting;
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const toggle = useAutoAcceptToggle({ vehicleId, setting, canEdit });
  const labelId = useId();

  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleText}>
        <p id={labelId} className={styles.toggleLabel}>
          {t('automation.toggle')}
        </p>
        <p className={styles.toggleHint}>{t('automation.toggleHint')}</p>
      </div>
      <Switch
        checked={toggle.enabled}
        loading={toggle.pending}
        disabled={toggle.disabled}
        onChange={(next) => void toggle.change(next)}
        aria-labelledby={labelId}
      />
    </div>
  );
}

/* ─── Giá thuê & Chính sách (cột phải) ────────────────────────────────────── */

/**
 * Giá thuê & Chính sách (Figma cột phải `23672:25630`): hai ô giá ngày lớn trên cùng, rồi các dòng.
 * Dòng chỉ có khi xe có giá đó — giá có tài xế, giá tháng (theo DỊCH VỤ xe phục vụ), khuyến mãi
 * tự lái và giá hiển thị sàn sau giảm (chốt 03/11: thêm vào design để không mất).
 */
export function PricingCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const { vehicles: vehiclePaths } = useWorkspace();
  // Phiên hỗ trợ không mở giá & chính sách của xe (ADR 0050) — link không có đích thì không dựng.
  const pricingHref = useAvailableHref()(vehiclePaths.pricing(vehicle.id));
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();

  const empty = tLabels('emptyValue');
  const serves = (service: ServiceType) => vehicle.serviceTypes.includes(service);
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);
  const unit = t('pricing.perDay');

  return (
    <Panel
      title={t('pricing.title')}
      extra={
        canEdit && pricingHref ? (
          <PanelLink href={pricingHref} icon={<EditOutlined />}>
            {t('pricing.editLink')}
          </PanelLink>
        ) : null
      }
    >
      <dl className={styles.priceTiles}>
        <div className={styles.priceTile}>
          <dt>{t('pricing.weekday')}</dt>
          <dd>{vehicle.weekdayPrice ? fmt.money(vehicle.weekdayPrice) : empty}</dd>
          <span className={styles.priceUnit}>{unit}</span>
        </div>
        <div className={styles.priceTile}>
          <dt>{t('pricing.weekend')}</dt>
          <dd>{vehicle.weekendPrice ? fmt.money(vehicle.weekendPrice) : empty}</dd>
          <span className={styles.priceUnit}>{unit}</span>
        </div>
      </dl>
      <dl className={styles.kvList}>
        {vehicle.hourlyPrice ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.hourly')}</dt>
            <dd>{fmt.pricePerHour(vehicle.hourlyPrice)}</dd>
          </div>
        ) : null}
        {vehicle.discountPercent ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.discount')}</dt>
            <dd>
              <DiscountTag percent={vehicle.discountPercent} />
            </dd>
          </div>
        ) : null}
        {discounted != null ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.publicPrice')}</dt>
            <dd>{fmt.pricePerDay(discounted)}</dd>
          </div>
        ) : null}
        {serves(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.withDriver')}</dt>
            <dd>{fmt.pricePerDay(vehicle.withDriverDailyPrice)}</dd>
          </div>
        ) : null}
        {serves(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.monthly')}</dt>
            <dd>{t('pricing.perMonth', { price: fmt.money(vehicle.monthlyPrice) })}</dd>
          </div>
        ) : null}
        {/*
          Yêu cầu bảo đảm KHÔNG phải thuộc tính của xe (20/08) — nó thuộc chính sách thuê hiệu lực,
          kế thừa từ gian hàng hoặc ghi đè riêng; chỗ của nó là màn "Giá & chính sách".
        */}
        <div className={styles.kvRow}>
          <dt>{t('pricing.delivery')}</dt>
          <dd className={vehicle.deliveryEnabled ? styles.deliveryOn : undefined}>
            {vehicle.deliveryEnabled ? (
              <>
                {decorativeIcon(<CheckOutlined />)} {t('pricing.deliveryOn')}
              </>
            ) : (
              t('pricing.deliveryOff')
            )}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/* ─── Tab thông số kỹ thuật ───────────────────────────────────────────────── */

/**
 * Bảng thông số (Figma `23672:4043`): lưới bốn cột nhãn | giá trị | nhãn | giá trị, viền mảnh;
 * màn hẹp gập về hai cột. Mỗi cặp là một hàng `<dl>` để trình đọc màn hình đọc đúng cặp.
 */
export function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const specs = useVehicleSpecItems(vehicle);

  const empty = tLabels('emptyValue');
  const items = [
    ...specs.map((item) => ({ key: item.key, label: item.label, value: item.value ?? empty })),
    { key: 'created', label: t('specs.createdAt'), value: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: t('specs.updatedAt'), value: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Panel title={t('specs.title')}>
      <dl className={styles.specsTable}>
        {items.map((item) => (
          <div key={item.key} className={styles.specsCell}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ─── Tab tiện ích xe ─────────────────────────────────────────────────────── */

/**
 * Tiện ích trên xe (Figma `23672:4810`) — danh sách PHẲNG hai cột (chốt 03/11/2026: danh mục tiện
 * ích chưa có trường nhóm, nên chưa chia bốn nhóm như design). Nhãn đọc từ danh mục do admin quản
 * lý, theo ngôn ngữ đang xem. Mô tả xe đứng ở thẻ thứ hai của cùng tab.
 */
export function FeaturesCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const { featureLabel } = useCatalogLabels();

  return (
    <div className={styles.stack}>
      <Panel title={t('features.title')} subtitle={t('features.subtitle')}>
        {vehicle.features.length > 0 ? (
          <ul className={styles.featureList}>
            {vehicle.features.map((key) => (
              <li key={key} className={styles.featureItem}>
                <span className={styles.featureCheck}>{decorativeIcon(<CheckOutlined />)}</span>
                {featureLabel(key)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t('features.empty')}</p>
        )}
      </Panel>
      <Panel title={t('features.descriptionTitle')}>
        {vehicle.description ? (
          <p className={styles.description}>{vehicle.description}</p>
        ) : (
          <p className={styles.muted}>{t('features.descriptionEmpty')}</p>
        )}
      </Panel>
    </div>
  );
}
