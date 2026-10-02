'use client';

/**
 * Các thẻ của tab TỔNG QUAN (và bảng của tab Thông số) trong Hồ sơ 360 — bố cục do
 * `Vehicle360Overview` quyết định, mỗi thẻ ở đây tự gác quyền/cờ gói của chính nó.
 */

import {
  BankOutlined,
  CheckCircleFilled,
  EditOutlined,
  ExclamationCircleFilled,
  FileProtectOutlined,
  InfoCircleFilled,
  PictureOutlined,
  PlusOutlined,
  RightOutlined,
  StarFilled,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Badge, Button, Card, Descriptions, Skeleton, Tag } from 'antd';
import type { DescriptionsProps } from 'antd';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_SERVICE_SETTING_SERVICES,
  VEHICLE_SOURCE_TYPE,
  topVehicleAlertSeverity,
  type VehicleAlertSeverity,
  type VehicleSourceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { VEHICLE_EDIT_TAB, VEHICLE_MANAGE_SECTION } from '@/constants/routes';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAvailableHref } from '@/features/tenant-support/support-session';
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
import { vehicleGalleryItems } from '../media';
import { discountedPriceVnd } from '../pricing';
import { vehiclePublicationTask } from '../publication';
import type { Vehicle360Summary, VehicleDetail } from '../types';
import { VehicleAlertList } from './VehicleAlerts';
import { VehiclePublicationTaskItem } from './VehiclePublicationTaskItem';
import styles from './Vehicle360Overview.module.css';

/**
 * Số ảnh HIỆN trong thẻ thư viện (3 × 2 ô); ảnh dư vẫn nằm trong nhóm xem trước (ẩn bằng CSS) nên
 * mũi tên của trình xem toàn màn hình vẫn lướt qua đủ mọi ảnh.
 */
const GALLERY_VISIBLE = 6;

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

/** Đã biết chắc không còn việc gì (danh sách tải xong và rỗng). */
const TODO_CLEAR = 'clear';
/** Chưa biết — tổng hợp đang tải hoặc tải hỏng. Không được trông giống "xong hết". */
const TODO_UNKNOWN = 'unknown';
type TodoTone = VehicleAlertSeverity | typeof TODO_CLEAR | typeof TODO_UNKNOWN;

const TODO_TONE_CLASS: Record<TodoTone, string | undefined> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: styles.todoCritical,
  [VEHICLE_ALERT_SEVERITY.WARNING]: styles.todoWarning,
  [VEHICLE_ALERT_SEVERITY.INFO]: styles.todoInfo,
  [TODO_CLEAR]: styles.todoClear,
  [TODO_UNKNOWN]: undefined,
};

const TODO_TONE_ICON: Record<TodoTone, ReactNode> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: <ExclamationCircleFilled />,
  [VEHICLE_ALERT_SEVERITY.WARNING]: <ExclamationCircleFilled />,
  [VEHICLE_ALERT_SEVERITY.INFO]: <InfoCircleFilled />,
  [TODO_CLEAR]: <CheckCircleFilled />,
  [TODO_UNKNOWN]: null,
};

/**
 * Việc cần làm — cảnh báo vận hành TỪ SERVER (`VehicleAlertsService`, cùng phép tính với thẻ xe
 * ở danh sách) cộng MỘT việc "đưa xe lên chợ" dựng tại chỗ từ bản ghi xe (ADR 0048).
 *
 * Hiện ở CẢ HAI khu (01/10/2026): xe bị trả về, xe nháp tạo từ app native, hay lượt gửi duyệt
 * thất bại của wizard — nút "Gửi duyệt" chỉ sống trong khối này.
 *
 * Thứ tự: việc lên chợ mức `critical`/`warning` lên ĐẦU (xe không bán được thì mọi việc khác là
 * thứ yếu); mức `info` — "xe đang tạm ẩn", "đang chờ duyệt" — xuống CUỐI.
 *
 * Nền thẻ đổi theo mức nặng nhất (02/10/2026) — thẻ đỏ là thứ đầu tiên mắt bắt được khi mở hồ sơ.
 * Màu không bao giờ là kênh duy nhất: từng việc vẫn nói mức nghiêm trọng bằng chữ.
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
  // Lọc theo năng lực + đổi đích về đúng khu TRƯỚC, rồi mới bỏ hai cảnh báo nói trùng với việc
  // "đưa xe lên chợ" dựng tại chỗ — hai phép lọc độc lập, thứ tự không đổi kết quả.
  const alerts = alertView(vehicle.id, summary?.alerts ?? []).filter(
    (alert) => !task || !PUBLICATION_ALERT_KINDS.includes(alert.kind),
  );
  const taskLeads = task !== null && task.tone !== VEHICLE_ALERT_SEVERITY.INFO;
  // Gợi ý không phải "việc cần làm" nên không vào số đếm — badge là số việc thật.
  const count = alerts.length + (taskLeads ? 1 : 0);
  const taskItem = task ? <VehiclePublicationTaskItem vehicle={vehicle} task={task} /> : null;
  const listReady = !loading && !failed && summary !== undefined;

  const shown = [...(listReady ? alerts : []), ...(task ? [{ severity: task.tone }] : [])];
  const tone: TodoTone = topVehicleAlertSeverity(shown) ?? (listReady ? TODO_CLEAR : TODO_UNKNOWN);
  /*
   * "Xử lý ngay" dẫn tới việc ĐẦU BẢNG của server (đã sắp theo ưu tiên) và đứng NGAY DƯỚI chính
   * việc đó (02/10/2026) — trước đó nó nằm cuối thẻ, sau cả lời nhắc "Xe đang tạm ẩn", và đọc như
   * nút của lời nhắc ấy. Chỉ dựng khi việc đầu bảng là việc phải làm (không phải lời nhắc `info`
   * như "đang bảo dưỡng"), có đích, và việc lên chợ không đứng trên nó (việc đó có nút riêng).
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
  const toneIcon = TODO_TONE_ICON[tone];

  return (
    <Card
      title={
        <span className={styles.todoTitle}>
          {toneIcon ? <span className={styles.todoIcon}>{decorativeIcon(toneIcon)}</span> : null}
          {t('todo.title')}
        </span>
      }
      extra={count > 0 ? <Badge count={count} /> : null}
      className={cx(styles.card, styles.todoCard, TODO_TONE_CLASS[tone])}
    >
      {taskLeads ? taskItem : null}
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !summary ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        // `showEmpty` tắt khi đã có việc lên chợ: "Không có việc cần làm" ngay dưới một việc
        // đang hiện là câu tự mâu thuẫn.
        <VehicleAlertList alerts={alerts} showEmpty={!task} leadAction={leadAction} />
      )}
      {/* Lời nhắc `info` (đang chờ duyệt, đang tạm ẩn) luôn xuống CUỐI, dưới mọi việc phải làm. */}
      {task && !taskLeads ? <div className={styles.todoNote}>{taskItem}</div> : null}
    </Card>
  );
}

/* ─── Giấy tờ ─────────────────────────────────────────────────────────────── */

/**
 * Tóm tắt giấy tờ (Wave 5) trên Hồ sơ 360.
 *
 * CỐ Ý chỉ hiện ĐẾM theo cảnh báo do server tính — không loại giấy tờ, không số hiệu, không
 * ngày hết hạn cụ thể. Những thứ đó nằm sau `documents.view_details` và thuộc về tab giấy tờ;
 * lặp lại chúng ở đây là mở một cửa sau vào dữ liệu PII.
 *
 * "Không có cảnh báo" vẫn là ô TRUNG TÍNH, không phải dấu xanh: tổng hợp không mang số giấy tờ,
 * nên một xe chưa tải lên giấy tờ nào cũng không có cảnh báo — vẽ nó thành "đã xác minh" là bịa.
 */
export function DocumentsCard({
  vehicleId,
  summary,
}: {
  vehicleId: string;
  summary: Vehicle360Summary | undefined;
}) {
  const t = useTranslations('Vehicles.overview');
  const { vehicles: vehiclePaths } = useWorkspace();
  const can = useVehicleCapabilities();
  // Giấy tờ CÓ ở cả hai khu (backend không gác cờ gói) — chỉ đích của link là khác nhau.
  const manageHref = useAvailableHref()(
    vehiclePaths.part(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS, VEHICLE_MANAGE_SECTION.DOCUMENTS),
  );
  if (!can.documents) return null;

  const alerts = summary?.alerts ?? [];
  const expired = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  const expiring = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);
  const toneClass = expired ? styles.toneError : expiring ? styles.toneWarning : styles.toneMuted;

  return (
    <Card
      title={t('documents.title')}
      extra={
        manageHref ? (
          <Link href={manageHref} className={styles.cardLink}>
            {t('documents.manageLink')}
          </Link>
        ) : null
      }
      className={styles.card}
    >
      <div className={styles.iconRow}>
        <span className={cx(styles.iconTile, toneClass)} aria-hidden="true">
          {expired || expiring ? <WarningOutlined /> : <FileProtectOutlined />}
        </span>
        {expired || expiring ? (
          <ul className={styles.todoList}>
            {expired ? (
              <li className={styles.todoItem}>
                <span className={cx(styles.todoDot, styles.error)} aria-hidden="true">
                  ●
                </span>
                <span>{t('documents.expired', { count: expired.count ?? 1 })}</span>
              </li>
            ) : null}
            {expiring ? (
              <li className={styles.todoItem}>
                <span className={cx(styles.todoDot, styles.warning)} aria-hidden="true">
                  ●
                </span>
                <span>{t('documents.expiring', { count: expiring.count ?? 1 })}</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className={styles.iconRowText}>
            {summary ? t('documents.clear') : t('documents.unknown')}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ─── Thư viện ảnh ────────────────────────────────────────────────────────── */

export function MediaCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const slotLabel = useImageSlotLabel();
  const { vehicles: vehiclePaths } = useWorkspace();
  // Đi qua cổng của phiên hỗ trợ như mọi link khác — màn không mở trong phiên thì không dựng link.
  const manageHref = useAvailableHref()(
    vehiclePaths.part(vehicle.id, VEHICLE_EDIT_TAB.MEDIA, VEHICLE_MANAGE_SECTION.IMAGES),
  );
  const items = vehicleGalleryItems(vehicle, slotLabel);
  const overflow = items.length - GALLERY_VISIBLE;

  return (
    <Card
      title={t('media.title')}
      extra={
        canEdit && manageHref ? (
          <Link href={manageHref} className={styles.cardLink}>
            {decorativeIcon(<PlusOutlined />)} {t('media.manageLink')}
          </Link>
        ) : null
      }
      className={styles.card}
    >
      {items.length === 0 ? (
        <div className={styles.iconRow}>
          <span className={cx(styles.iconTile, styles.toneMuted)} aria-hidden="true">
            <PictureOutlined />
          </span>
          <p className={styles.iconRowText}>{t('media.empty')}</p>
        </div>
      ) : (
        // Group: bấm ảnh nào cũng mở trình xem toàn màn hình chung, chuyển ảnh bằng mũi tên.
        <PreviewImageGroup>
          <ul className={styles.gallery} aria-label={t('media.title')}>
            {items.map((item, index) => (
              <li
                key={`${index}-${item.url}`}
                className={cx(styles.galleryItem, index >= GALLERY_VISIBLE && styles.galleryHidden)}
              >
                <PreviewImage
                  src={item.url}
                  alt={item.label ?? ''}
                  className={styles.galleryThumb}
                  loading="lazy"
                />
                {index === 0 && item.url === vehicle.mainImageUrl ? (
                  <span className={styles.coverBadge}>
                    {decorativeIcon(<StarFilled />)}
                    {t('media.cover')}
                  </span>
                ) : null}
                {item.label ? <span className={styles.galleryLabel}>{item.label}</span> : null}
                {index === GALLERY_VISIBLE - 1 && overflow > 0 ? (
                  <span className={styles.galleryMore}>{t('media.more', { count: overflow })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </PreviewImageGroup>
      )}
    </Card>
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
 * Những thông số khách hỏi đầu tiên — bản ĐẦY ĐỦ ở tab "Thông số kỹ thuật", nút "Xem đầy đủ" đổi
 * tab tại chỗ chứ không mở trang khác. Ô áp dụng mà chưa điền thì nói thiếu (`—`), để chủ xe thấy
 * còn phải điền gì.
 */
export function KeySpecsCard({
  vehicle,
  onViewAll,
}: {
  vehicle: VehicleDetail;
  onViewAll: () => void;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
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
    <Card
      title={t('keySpecs.title')}
      extra={
        <Button
          type="link"
          size="small"
          className={styles.cardLinkButton}
          onClick={onViewAll}
          aria-label={t('keySpecs.viewAllLabel')}
        >
          {t('keySpecs.viewAll')}
        </Button>
      }
      className={styles.card}
    >
      <dl className={styles.specGrid}>
        {tiles.map((tile) => (
          <div key={tile.key} className={styles.specTile}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ─── Giá & chính sách · Tối ưu nhận chuyến · Nguồn xe ────────────────────── */

export function PricingCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const { vehicles: vehiclePaths } = useWorkspace();
  // Phiên hỗ trợ không mở giá & chính sách của xe (ADR 0050) — link không có đích thì không dựng.
  const pricingHref = useAvailableHref()(vehiclePaths.pricing(vehicle.id));
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();

  const empty = tLabels('emptyValue');
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <Card
      title={t('pricing.title')}
      extra={
        canEdit && pricingHref ? (
          // Wave 2: giá & chính sách có workspace riêng (kế thừa/ghi đè) — không đi qua wizard.
          <Link href={pricingHref} className={styles.cardLink}>
            {decorativeIcon(<EditOutlined />)} {t('pricing.editLink')}
          </Link>
        ) : null
      }
      className={styles.card}
    >
      {/* Hai giá ngày là con số chủ xe nhìn nhiều nhất — đứng thành hai ô lớn trên cùng. */}
      <dl className={styles.priceTiles}>
        <div className={styles.priceTile}>
          <dt>{t('pricing.weekday')}</dt>
          <dd>{vehicle.weekdayPrice ? fmt.pricePerDay(vehicle.weekdayPrice) : empty}</dd>
        </div>
        <div className={styles.priceTile}>
          <dt>{t('pricing.weekend')}</dt>
          <dd>{vehicle.weekendPrice ? fmt.pricePerDay(vehicle.weekendPrice) : empty}</dd>
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
            <dd>{fmt.money(discounted)}</dd>
          </div>
        ) : null}
        {/*
          Yêu cầu bảo đảm KHÔNG còn là thuộc tính của xe (20/08) — nó thuộc chính sách thuê hiệu
          lực, kế thừa từ gian hàng hoặc ghi đè riêng. Chỗ đúng của nó là màn "Giá & chính sách".
        */}
        <div className={styles.kvRow}>
          <dt>{t('pricing.delivery')}</dt>
          <dd>{vehicle.deliveryEnabled ? t('pricing.deliveryOn') : t('pricing.deliveryOff')}</dd>
        </div>
      </dl>
    </Card>
  );
}

/**
 * TỐI ƯU NHẬN CHUYẾN — đường vào duy nhất tới thiết lập tự động nhận của xe gian hàng.
 *
 * Chỉ hiện khi xe phục vụ ít nhất một dịch vụ CÓ thiết lập riêng: thuê dài hạn luôn do gian
 * hàng chốt lịch tay (ADR 0011), nên với xe chỉ cho thuê dài hạn thì thẻ này không có gì để nói.
 */
export function AutomationCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const { vehicles: vehiclePaths } = useWorkspace();
  // Phiên hỗ trợ không mở thiết lập nhận chuyến — link không có đích thì không dựng (ADR 0050).
  const href = useAvailableHref()(vehiclePaths.optimization(vehicle.id));
  const hasConfigurableService = VEHICLE_SERVICE_SETTING_SERVICES.some((service) =>
    vehicle.serviceTypes.includes(service),
  );
  if (!hasConfigurableService) return null;

  return (
    <Card
      title={t('automation.title')}
      extra={
        canEdit && href ? (
          <Link href={href} className={styles.cardLink}>
            {t('automation.editLink')}
          </Link>
        ) : null
      }
      className={styles.card}
    >
      <div className={styles.iconRow}>
        <span className={cx(styles.iconTile, styles.toneBrand)} aria-hidden="true">
          <ThunderboltOutlined />
        </span>
        <p className={styles.iconRowText}>{t('automation.hint')}</p>
      </div>
    </Card>
  );
}

/**
 * Tóm tắt nguồn xe (Wave 4).
 *
 * HAI mức, và ranh giới giữa chúng là ranh giới hai tuyến:
 *  - **Hình thức** (Sở hữu · Thuê lại · Trả góp · Hợp tác) nằm sẵn trên bản ghi xe và không có
 *    cờ gói nào gác — nên nó luôn hiện.
 *  - **Con số và hồ sơ tài chính** là sổ sách của gian hàng, thuộc năng lực `finance`. Thiếu nó
 *    thì KHÔNG tải, và cũng không dựng đường dẫn sang màn nguồn xe.
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
  // Đích màn nguồn xe — chỉ dựng khi đọc được sổ và đã biết hồ sơ có hay chưa.
  const sourceLink = canViewFinance && !source.isLoading ? sourceHref : null;

  const summary = detail
    ? [
        detail.bankName,
        detail.ownerName,
        detail.monthlyTotal
          ? t('source.monthlyTotal', { amount: fmt.money(detail.monthlyTotal) })
          : null,
        detail.monthlyRent
          ? t('source.monthlyRent', { amount: fmt.money(detail.monthlyRent) })
          : null,
        detail.commissionPercent
          ? t('source.commission', { percent: detail.commissionPercent })
          : null,
        detail.paymentDay ? t('source.paymentDay', { day: detail.paymentDay }) : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';

  return (
    <Card
      title={t('source.title')}
      extra={
        sourceLink && detail ? (
          <Link href={sourceLink} className={styles.cardLink}>
            {t('source.viewLink')} {decorativeIcon(<RightOutlined />)}
          </Link>
        ) : null
      }
      className={cx(styles.card, styles.spanFull)}
    >
      <div className={styles.iconRow}>
        <span className={cx(styles.iconTile, styles.toneBrand)} aria-hidden="true">
          <BankOutlined />
        </span>
        <div className={styles.sourceBody}>
          <dl className={styles.sourceFacts}>
            <div>
              <dt>{t('source.kind')}</dt>
              <dd>
                <Tag color="gold">{domainLabel('vehicleSourceType', sourceType)}</Tag>
              </dd>
            </div>
            {detail && summary ? (
              <div>
                <dt>{t('source.summary')}</dt>
                <dd>{summary}</dd>
              </div>
            ) : null}
          </dl>
          {sourceLink && !detail ? (
            <p className={styles.muted}>
              {t('source.missing')} <Link href={sourceLink}>{t('source.missingLink')}</Link>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* ─── Tab thông số kỹ thuật ───────────────────────────────────────────────── */

export function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const { featureLabel } = useCatalogLabels();
  const specs = useVehicleSpecItems(vehicle);

  const empty = tLabels('emptyValue');
  const items: DescriptionsProps['items'] = [
    ...specs.map((item) => ({ key: item.key, label: item.label, children: item.value ?? empty })),
    { key: 'created', label: t('specs.createdAt'), children: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: t('specs.updatedAt'), children: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Card title={t('specs.title')} className={styles.card}>
      {/* `specsTable`: xem docblock ở CSS — antd cho ô nội dung bẻ giữa từ, phải chặn lại. */}
      <Descriptions
        bordered
        size="small"
        column={{ xs: 1, sm: 2 }}
        items={items}
        className={styles.specsTable}
      />

      {vehicle.features.length > 0 ? (
        <div className={styles.chips}>
          {vehicle.features.map((key) => (
            <Tag key={key}>{featureLabel(key)}</Tag>
          ))}
        </div>
      ) : null}

      {vehicle.description ? <p className={styles.description}>{vehicle.description}</p> : null}
    </Card>
  );
}
