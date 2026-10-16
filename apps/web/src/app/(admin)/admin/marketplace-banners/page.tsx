'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { App, Button, Tabs, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BANNER_PLACEMENT,
  STATUS_COLOR,
  isBannerPlacement,
  type BannerPlacement,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import {
  BANNER_SLOTS,
  PROMO_BANNER_SLOTS,
  formatBannerSize,
} from '@/features/banners/banner-media';
import { BannerFormModal } from '@/features/banners/components/BannerFormModal';
import {
  MAX_CONCURRENT_VISIBLE_BANNERS,
  useAdminBanners,
  useBannerSaveErrorMessage,
  useDeleteBanner,
  useReorderBanners,
  useUpdateBanner,
} from '@/features/banners/use-admin-banners';
import type { AdminBanner } from '@/features/banners/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from './banners-page.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const MIN_TABLE_WIDTH = 960;

/** Tham số URL của tab vị trí — F5/chia sẻ link giữ đúng tab. */
const PLACEMENT_PARAM = 'placement';

/**
 * Quản lý banner trang chủ — nơi DUY NHẤT tạo/sửa banner công khai, cho cả HAI vị trí: dải banner
 * đầu trang và banner khuyến mãi giữa trang (`placement`). Mỗi tab một danh sách, một thứ tự và
 * một trần hiển thị riêng; vị trí của banner đặt lúc tạo theo tab đang mở.
 *
 * Trang chủ lấy toàn bộ banner "đang hiển thị" theo thứ tự; cột "Trạng thái" phân biệt
 * rõ đã tắt / chờ tới lịch / hết lịch để admin không phải tự nhẩm.
 */
export default function AdminBannersPage() {
  const t = useTranslations('AdminBanners');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const saveErrorMessage = useBannerSaveErrorMessage();

  const { filters, setFilters } = useUrlFilters<{ placement: BannerPlacement }>((sp) => {
    const placement = sp.get(PLACEMENT_PARAM);
    return { placement: isBannerPlacement(placement) ? placement : BANNER_PLACEMENT.HERO };
  });
  const placement = filters.placement;
  const isPromo = placement === BANNER_PLACEMENT.PROMO;

  const { message } = App.useApp();
  const { data, isError, refetch, isFetching } = useAdminBanners(placement);
  const update = useUpdateBanner();
  const remove = useDeleteBanner();
  const reorder = useReorderBanners(placement);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [formSession, setFormSession] = useState(0);

  const items = data ?? [];

  function openCreate() {
    setEditing(null);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  }

  function openEdit(banner: AdminBanner) {
    setEditing(banner);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  }

  /** Đổi chỗ với mục liền kề rồi gửi TRỌN thứ tự — nút mũi tên dùng được bàn phím, khỏi kéo-thả. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onError: (err) => message.error(errorMessage(err)) });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      {t('page.create')}
    </Button>
  );

  const columns: DataTableColumn<AdminBanner>[] = [
    {
      title: t('columns.preview'),
      key: 'preview',
      width: 150,
      render: (_, b) => <PreviewImage src={b.imageUrl} alt={b.altText} className={styles.thumb} />,
    },
    {
      title: t('columns.banner'),
      key: 'title',
      width: 300,
      render: (_, b) => (
        <div>
          <div className={styles.title}>{b.title}</div>
          <div className={styles.alt}>{b.altText}</div>
          {b.linkUrl ? <div className={styles.link}>{b.linkUrl}</div> : null}
        </div>
      ),
    },
    {
      title: t('columns.schedule'),
      key: 'schedule',
      width: 210,
      render: (_, b) =>
        b.startsAt || b.endsAt ? (
          <div className={styles.schedule}>
            <div>{b.startsAt ? fmt.dateTime(b.startsAt) : t('schedule.startNow')}</div>
            <div>→ {b.endsAt ? fmt.dateTime(b.endsAt) : t('schedule.endNever')}</div>
          </div>
        ) : (
          t('schedule.unlimited')
        ),
    },
    {
      title: tCommon('labels.status'),
      key: 'status',
      width: 140,
      render: (_, b) => {
        if (!b.active) return <Tag color={STATUS_COLOR.NEUTRAL}>{t('status.off')}</Tag>;
        if (b.visibleNow) return <Tag color={STATUS_COLOR.SUCCESS}>{t('status.live')}</Tag>;
        // active nhưng ngoài khung lịch — nói rõ vì sao không thấy ngoài trang chủ.
        const upcoming = b.startsAt && new Date(b.startsAt).getTime() > Date.now();
        return upcoming ? (
          <Tag color={STATUS_COLOR.WAITING}>{t('status.upcoming')}</Tag>
        ) : (
          <Tag color={STATUS_COLOR.WARNING}>{t('status.ended')}</Tag>
        );
      },
    },
    actionColumn<AdminBanner>(
      (b) => {
        const index = items.findIndex((i) => i.id === b.id);
        return [
          {
            key: 'edit',
            label: tCommon('actions.edit'),
            icon: <EditOutlined />,
            onClick: () => openEdit(b),
          },
          {
            key: 'up',
            label: t('actions.moveUp'),
            icon: <ArrowUpOutlined />,
            disabled: index <= 0 || reorder.isPending,
            onClick: () => move(index, -1),
          },
          {
            key: 'down',
            label: t('actions.moveDown'),
            icon: <ArrowDownOutlined />,
            disabled: index >= items.length - 1 || reorder.isPending,
            onClick: () => move(index, 1),
          },
          {
            key: 'toggle',
            label: b.active ? t('actions.disable') : t('actions.enable'),
            loading: update.isPending && update.variables?.id === b.id,
            onClick: () =>
              update.mutate(
                { id: b.id, active: !b.active },
                {
                  onSuccess: () =>
                    message.success(b.active ? t('toast.disabled') : t('toast.enabled')),
                  onError: (err) => message.error(saveErrorMessage(err)),
                },
              ),
          },
          {
            key: 'delete',
            label: tCommon('actions.delete'),
            icon: <DeleteOutlined />,
            danger: true,
            loading: remove.isPending && remove.variables === b.id,
            confirm: {
              title: t('actions.deleteConfirm'),
              okText: tCommon('actions.delete'),
              cancelText: tCommon('actions.close'),
            },
            onClick: () =>
              remove.mutate(b.id, {
                onSuccess: () => message.success(t('toast.deleted')),
                onError: (err) => message.error(errorMessage(err)),
              }),
          },
        ];
      },
      { width: 190 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader title={t('page.title')} />
      <Tabs
        activeKey={placement}
        onChange={(key) => {
          if (isBannerPlacement(key)) setFilters({ placement: key }, { resetPage: false });
        }}
        aria-label={t('tabs.label')}
        items={[
          { key: BANNER_PLACEMENT.HERO, label: t('tabs.hero') },
          { key: BANNER_PLACEMENT.PROMO, label: t('tabs.promo') },
        ]}
      />
      {isPromo ? (
        <>
          <p className={styles.hint}>
            {t('page.promoHint', {
              max: MAX_CONCURRENT_VISIBLE_BANNERS,
              desktop: formatBannerSize(PROMO_BANNER_SLOTS.desktop),
              mobile: formatBannerSize(PROMO_BANNER_SLOTS.mobile),
            })}
          </p>
          <p className={styles.hint}>{t('page.promoComposition')}</p>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            {t('page.hint', {
              max: MAX_CONCURRENT_VISIBLE_BANNERS,
              desktop: formatBannerSize(BANNER_SLOTS.desktop),
              tablet: formatBannerSize(BANNER_SLOTS.tablet),
              mobile: formatBannerSize(BANNER_SLOTS.mobile),
            })}
          </p>
          <p className={styles.hint}>
            {t('page.composition', { desktop: formatBannerSize(BANNER_SLOTS.desktop) })}
          </p>
        </>
      )}
      <div className={styles.toolbar}>{createButton}</div>

      <DataTable<AdminBanner>
        label={t('page.title')}
        columns={columns}
        items={items}
        onRowClick={openEdit}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null
        }
        empty={{
          title: isPromo ? t('page.emptyPromo') : t('page.empty'),
          action: createButton,
        }}
      />

      <BannerFormModal
        key={`${placement}-${editing?.id ?? 'new'}-${formSession}`}
        open={formOpen}
        placement={placement}
        banner={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
