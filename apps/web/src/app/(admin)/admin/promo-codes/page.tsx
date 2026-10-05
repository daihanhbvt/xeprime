'use client';

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { App, Button, DatePicker, Input, Select, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PROMO_CODE_STATE_META,
  PROMO_CODE_STATE_VALUES,
  PROMO_DISCOUNT_TYPE,
  PROMO_DISCOUNT_TYPE_VALUES,
  PROMO_ENDING_SOON_DAYS,
  PROMO_VEHICLE_SCOPE,
  STATUS_COLOR,
  type PromoCodeState,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { toAppTz } from '@/lib/datetime';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { PromoCodeFormModal } from '@/features/promo-codes/components/PromoCodeFormModal';
import { PromoRedemptionsDialog } from '@/features/promo-codes/components/PromoRedemptionsDialog';
import {
  useAdminPromoCodes,
  useAdminPromoFilters,
  useDeletePromoCode,
  useDuplicatePromoCode,
  useTogglePromoCode,
} from '@/features/promo-codes/hooks/use-promo-codes';
import type { AdminPromoCode } from '@/features/promo-codes/types';
import styles from './promo-codes-page.module.css';

const MIN_TABLE_WIDTH = 1180;

/**
 * QUẢN TRỊ MÃ KHUYẾN MÃI NỀN TẢNG — ADR 0046.
 *
 * Chỉ nhân sự nền tảng có `platform.promo_codes.manage` tới được đây; menu ẩn với người khác và
 * **backend chặn thật** (`@PlatformOnly()` — ADR 0027 điều 4). Gian hàng không có trang tương ứng
 * ở khu Manage, và đó là chủ đích: mã ở đây do XePrime tài trợ, không phải tiền của họ.
 *
 * Lọc/tìm/sắp/phân trang Ở SERVER (ADR 0004); trang chỉ giữ bộ lọc trên URL.
 *
 * ## Khu vực áp dụng chưa có ô chọn ở đợt này
 *
 * `provinceCodes` đã có ở dữ liệu, API và phép kiểm — nhưng form chưa dựng ô chọn tỉnh, nên mọi
 * mã tạo từ giao diện là TOÀN QUỐC. Nói ra ở đây thay vì để một ô chọn nửa vời: một bộ chọn 34
 * tỉnh cần chính ô `AddressField` của khu đăng xe, và kéo nó vào một modal hai cột là việc của
 * đợt sau. Cột "Điều kiện" vẫn hiện đúng phạm vi của mã seed/mã tạo qua API.
 */
export default function AdminPromoCodesPage() {
  const t = useTranslations('PromoCodes');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message, modal } = App.useApp();

  const { filters, setFilters } = useAdminPromoFilters();
  const { data, isError, isFetching, refetch } = useAdminPromoCodes(filters);
  const toggle = useTogglePromoCode();
  const duplicate = useDuplicatePromoCode();
  const remove = useDeletePromoCode();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPromoCode | null>(null);
  const [redemptionsFor, setRedemptionsFor] = useState<AdminPromoCode | null>(null);

  const items = data?.data ?? [];
  const stats = data?.stats;
  const hasFilters = Boolean(
    filters.q || filters.discountType !== 'all' || filters.state !== 'all' || filters.dateFrom,
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(promo: AdminPromoCode) {
    setEditing(promo);
    setFormOpen(true);
  }

  /**
   * Bật/tắt — CÓ xác nhận, vì nó tác động ngay tới khách đang đặt xe.
   *
   * Câu xác nhận nói rõ điều dễ bị hiểu sai nhất: tắt mã KHÔNG thu hồi những lượt đang giữ
   * (ADR 0046 điều 7 — lượt đã giữ được tôn trọng tới khi yêu cầu kết thúc).
   */
  function confirmToggle(promo: AdminPromoCode) {
    const next = !promo.isActive;
    modal.confirm({
      title: next
        ? t('admin.confirm.enableTitle', { code: promo.code })
        : t('admin.confirm.disableTitle', { code: promo.code }),
      content: next ? t('admin.confirm.enableBody') : t('admin.confirm.disableBody'),
      okText: t('admin.confirm.ok'),
      cancelText: t('admin.confirm.cancel'),
      onOk: () =>
        new Promise<void>((resolve) => {
          toggle.mutate(
            { id: promo.id, isActive: next },
            {
              onSuccess: () => {
                message.success(
                  next
                    ? t('admin.toast.enabled', { code: promo.code })
                    : t('admin.toast.disabled', { code: promo.code }),
                );
                resolve();
              },
              onError: (err) => {
                message.error(errorMessage(err));
                resolve();
              },
            },
          );
        }),
    });
  }

  function confirmDelete(promo: AdminPromoCode) {
    modal.confirm({
      title: t('admin.confirm.deleteTitle', { code: promo.code }),
      content: t('admin.confirm.deleteBody'),
      okText: t('admin.confirm.ok'),
      cancelText: t('admin.confirm.cancel'),
      okButtonProps: { danger: true },
      onOk: () =>
        new Promise<void>((resolve) => {
          remove.mutate(promo.id, {
            onSuccess: () => {
              message.success(t('admin.toast.deleted', { code: promo.code }));
              resolve();
            },
            onError: (err) => {
              message.error(errorMessage(err));
              resolve();
            },
          });
        }),
    });
  }

  function handleDuplicate(promo: AdminPromoCode) {
    duplicate.mutate(promo.id, {
      onSuccess: (copy) => message.success(t('admin.toast.duplicated', { code: copy.code })),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      {t('admin.create')}
    </Button>
  );

  const columns: DataTableColumn<AdminPromoCode>[] = [
    {
      title: t('admin.column.code'),
      key: 'code',
      width: 170,
      render: (_, p) => (
        <span className={styles.codeCell}>
          <span className={styles.code}>{p.code}</span>
          <CopyButton value={p.code} label={tCommon('actions.copy')} />
        </span>
      ),
    },
    {
      title: t('admin.column.name'),
      key: 'name',
      render: (_, p) => (
        <div className={styles.cellStack}>
          <span className={styles.cellMain}>
            {p.name}
            {/* Mã KHÔNG công bố: admin phải thấy vì sao khách không tìm ra nó trong danh sách. */}
            {p.listed ? null : (
              <Tag className={styles.hiddenTag} color={STATUS_COLOR.NEUTRAL}>
                {t('admin.form.listed')}: {tCommon('labels.no')}
              </Tag>
            )}
          </span>
          {p.description ? <span className={styles.cellSub}>{p.description}</span> : null}
        </div>
      ),
    },
    {
      title: t('admin.column.discountType'),
      key: 'discountType',
      width: 120,
      render: (_, p) => (
        <Tag color={p.discountType === PROMO_DISCOUNT_TYPE.PERCENT ? STATUS_COLOR.INFO : STATUS_COLOR.SUCCESS}>
          {domainLabel('promoDiscountType', p.discountType)}
        </Tag>
      ),
    },
    {
      title: t('admin.column.value'),
      key: 'value',
      width: 150,
      render: (_, p) => (
        <div className={styles.cellStack}>
          <span className={styles.amount}>
            {p.discountType === PROMO_DISCOUNT_TYPE.PERCENT
              ? t('admin.value.percent', { percent: p.discountPercent ?? 0 })
              : fmt.money(p.discountAmount)}
          </span>
          {p.discountType === PROMO_DISCOUNT_TYPE.PERCENT ? (
            <span className={styles.cellSub}>
              {p.maxDiscountAmount
                ? t('admin.value.maxDiscount', { amount: fmt.money(p.maxDiscountAmount) })
                : t('admin.value.unlimited')}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('admin.column.conditions'),
      key: 'conditions',
      width: 210,
      render: (_, p) => (
        <div className={styles.cellStack}>
          <span className={styles.cellSub}>
            {Number(p.minOrderAmount) > 0
              ? t('admin.conditions.minOrder', { amount: fmt.money(p.minOrderAmount) })
              : t('admin.conditions.noMinOrder')}
          </span>
          {/*
            Chỉ nêu phạm vi KHÁC mặc định — liệt kê đủ "tất cả xe · tất cả dịch vụ · toàn quốc"
            cho mọi hàng là ba dòng không mang thông tin nào.
          */}
          {p.vehicleScope !== PROMO_VEHICLE_SCOPE.ALL ? (
            <span className={styles.cellSub}>
              {t('admin.conditions.vehicleScope', {
                scope: domainLabel('promoVehicleScope', p.vehicleScope),
              })}
            </span>
          ) : null}
          {p.serviceScope.length > 0 ? (
            <span className={styles.cellSub}>
              {t('admin.conditions.serviceScope', {
                list: p.serviceScope.map((s) => domainLabel('serviceType', s)).join(', '),
              })}
            </span>
          ) : null}
          {p.audience !== 'all' ? (
            <span className={styles.cellSub}>{t('admin.conditions.newCustomer')}</span>
          ) : null}
          {p.provinceCodes.length > 0 ? (
            <span className={styles.cellSub}>
              {t('admin.conditions.provinces', { count: p.provinceCodes.length })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('admin.column.window'),
      key: 'window',
      width: 180,
      render: (_, p) => (
        <span className={styles.cellSub}>
          {fmt.date(p.startsAt)} – {fmt.date(p.endsAt)}
        </span>
      ),
    },
    {
      title: t('admin.column.usage'),
      key: 'usage',
      width: 130,
      render: (_, p) => (
        <div className={styles.cellStack}>
          <span className={styles.amount}>
            {p.totalUsageLimit == null
              ? t('admin.usage.unlimited', { used: p.redeemedCount })
              : t('admin.usage.value', { used: p.redeemedCount, limit: p.totalUsageLimit })}
          </span>
          {/*
            Lượt ĐANG GIỮ hiện riêng: chúng chiếm hạn mức nhưng chưa tiêu đồng nào, và nếu chỉ
            hiện "đã dùng" thì một mã báo "0/50" mà thực tế đã kín chỗ.
          */}
          {p.reservedCount > p.redeemedCount ? (
            <span className={styles.cellSub}>
              {t('admin.usage.reserved', { count: p.reservedCount - p.redeemedCount })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      title: t('admin.column.sponsored'),
      key: 'sponsored',
      width: 130,
      render: (_, p) => <span className={styles.amount}>{fmt.money(p.sponsoredAmount)}</span>,
    },
    {
      title: t('admin.column.state'),
      key: 'state',
      width: 130,
      render: (_, p) => (
        <StatusTag
          value={p.state as PromoCodeState}
          meta={PROMO_CODE_STATE_META}
          group="promoCodeState"
        />
      ),
    },
    actionColumn<AdminPromoCode>(
      (p) => [
        {
          key: 'edit',
          label: t('admin.action.edit'),
          icon: <EditOutlined />,
          onClick: () => openEdit(p),
        },
        {
          key: 'toggle',
          label: p.isActive ? t('admin.action.disable') : t('admin.action.enable'),
          icon: <PoweroffOutlined />,
          loading: toggle.isPending && toggle.variables?.id === p.id,
          onClick: () => confirmToggle(p),
        },
        {
          key: 'redemptions',
          label: t('admin.action.redemptions'),
          icon: <HistoryOutlined />,
          onClick: () => setRedemptionsFor(p),
        },
        {
          key: 'duplicate',
          label: t('admin.action.duplicate'),
          icon: <CopyOutlined />,
          loading: duplicate.isPending && duplicate.variables === p.id,
          onClick: () => handleDuplicate(p),
        },
        {
          key: 'delete',
          label: t('admin.action.delete'),
          icon: <DeleteOutlined />,
          danger: true,
          loading: remove.isPending && remove.variables === p.id,
          onClick: () => confirmDelete(p),
        },
      ],
      { width: 220, maxInline: 2 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        extra={createButton}
      />

      <div className={styles.stats}>
        <MoneyStat
          label={t('admin.stats.total')}
          value={stats ? String(stats.total) : null}
          size="compact"
          tone="accent"
          loading={!stats && isFetching}
          hint={stats ? t('admin.stats.totalDelta', { count: stats.createdLast30Days }) : undefined}
        />
        <MoneyStat
          label={t('admin.stats.active')}
          value={stats ? String(stats.active) : null}
          size="compact"
          tone="positive"
          loading={!stats && isFetching}
        />
        <MoneyStat
          label={t('admin.stats.endingSoon')}
          value={stats ? String(stats.endingSoon) : null}
          size="compact"
          tone="neutral"
          loading={!stats && isFetching}
          hint={t('admin.stats.endingSoonHint', { days: PROMO_ENDING_SOON_DAYS })}
        />
        <MoneyStat
          label={t('admin.stats.expired')}
          value={stats ? String(stats.expired) : null}
          size="compact"
          tone="neutral"
          loading={!stats && isFetching}
        />
      </div>

      <div className={styles.filters}>
        <Input.Search
          className={styles.search}
          allowClear
          placeholder={t('admin.filter.search')}
          aria-label={t('admin.filter.search')}
          defaultValue={filters.q ?? ''}
          onSearch={(value) => setFilters({ q: value.trim() || undefined })}
        />
        <Select
          className={styles.select}
          value={filters.discountType}
          aria-label={t('admin.filter.discountType')}
          onChange={(value) => setFilters({ discountType: value })}
          options={[
            { value: 'all', label: t('admin.filter.all') },
            ...PROMO_DISCOUNT_TYPE_VALUES.map((value) => ({
              value,
              label: domainLabel('promoDiscountType', value),
            })),
          ]}
        />
        <Select
          className={styles.select}
          value={filters.state}
          aria-label={t('admin.filter.state')}
          onChange={(value) => setFilters({ state: value })}
          options={[
            { value: 'all', label: t('admin.filter.all') },
            ...PROMO_CODE_STATE_VALUES.map((value) => ({
              value,
              label: domainLabel('promoCodeState', value),
            })),
          ]}
        />
        <DatePicker.RangePicker
          className={styles.range}
          aria-label={t('admin.filter.dateRange')}
          /*
           * `toAppTz` chứ không `dayjs()` trần: giá trị trên URL là mốc UTC, và đọc nó theo giờ
           * MÁY sẽ hiện lệch một ngày với người dùng ở múi giờ âm (CLAUDE.md §9).
           */
          value={
            filters.dateFrom && filters.dateTo
              ? [toAppTz(filters.dateFrom), toAppTz(filters.dateTo)]
              : null
          }
          onChange={(range) =>
            setFilters({
              /*
               * Gửi mốc ĐẦU và CUỐI ngày theo giờ Việt Nam. Dùng `.toISOString()` trần sẽ biến
               * "từ 01/10" thành 17:00 ngày 30/09 và bỏ sót một chiến dịch bắt đầu sáng 01/10.
               */
              dateFrom: range?.[0]?.startOf('day').toISOString() ?? undefined,
              dateTo: range?.[1]?.endOf('day').toISOString() ?? undefined,
            })
          }
        />
        {hasFilters ? (
          <Button
            onClick={() =>
              setFilters({
                q: undefined,
                discountType: 'all',
                state: 'all',
                dateFrom: undefined,
                dateTo: undefined,
              })
            }
          >
            {t('admin.filter.reset')}
          </Button>
        ) : null}
      </div>

      <DataTable<AdminPromoCode>
        label={t('admin.title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        filtered={hasFilters}
        error={
          isError && !data ? { title: t('admin.error'), onRetry: () => void refetch() } : null
        }
        empty={{ title: t('admin.empty.title'), description: t('admin.empty.hint'), action: createButton }}
        noResults={{ title: t('admin.emptyFiltered') }}
        pagination={
          data
            ? {
                meta: data.meta,
                onChange: (page) => setFilters({ page }),
                totalLabel: (total) => t('admin.pagination.codes', { count: total }),
              }
            : undefined
        }
      />

      {/*
        `key` buộc form dựng lại khi đổi bản ghi đang sửa: `defaultValues` của RHF chỉ đọc một
        lần, nên tái dùng cùng một instance sẽ mở form mới với số của chiến dịch trước.
      */}
      <PromoCodeFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        promo={editing}
        onClose={() => setFormOpen(false)}
      />
      <PromoRedemptionsDialog
        promo={redemptionsFor}
        onClose={() => setRedemptionsFor(null)}
      />
    </div>
  );
}
