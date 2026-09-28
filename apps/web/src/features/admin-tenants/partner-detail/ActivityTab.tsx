'use client';

import {
  CustomerServiceOutlined,
  HistoryOutlined,
  LockOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Pagination, Segmented, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AUDIT_ACTOR_SCOPE_VALUES,
  PERMISSION,
  SUPPORT_SESSION_STATUS,
  auditCategoriesFor,
  type PlatformPartnerKind,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ALL_FILTER } from '@/constants/filters';
import { adminAuditPath } from '@/constants/routes';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { DAY_PARAM_FORMAT, nowInAppTz, toAppTz } from '@/lib/datetime';
import {
  PARTNER_DETAIL_PAGE_SIZE,
  type PartnerActivity,
  type PartnerActivityFilters,
  type PartnerSupportSession,
} from './api';
import { usePartnerActivity, usePartnerSupportSessions } from './hooks';
import { useTabState } from './parts';
import styles from './PartnerDetail.module.css';

const SEGMENT = { ACTIVITY: 'activity', SESSIONS: 'sessions' } as const;
type Segment = (typeof SEGMENT)[keyof typeof SEGMENT];

/** Khoảng thời gian — mốc tính một lần lúc chọn để khoá cache ổn định. */
const RANGE_DAYS = { all: null, d7: 7, d30: 30, d90: 90 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

/**
 * Tab Nhật ký — hoạt động của đối tác và các phiên hỗ trợ đã mở. CHỈ ĐỌC.
 *
 * Danh sách dùng nhãn thân thiện (nhóm + động từ); mã hành động kỹ thuật, IP và thiết bị KHÔNG có
 * ở đây — "Xem chi tiết" mở trang Nhật ký hệ thống, nơi các trường đó nằm sau quyền của trang đó.
 * Nhóm không áp dụng cho loại đối tác (chi nhánh/nhân sự/gói với chủ xe cá nhân) không có trong
 * bộ lọc, và server cũng đã loại chúng khỏi dữ liệu.
 */
export function ActivityTab({ tenantId, kind }: { tenantId: string; kind: PlatformPartnerKind }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const { has } = usePermissions();
  const allowed = has(PERMISSION.PLATFORM_AUDIT_VIEW);
  const [segment, setSegment] = useState<Segment>(SEGMENT.ACTIVITY);

  if (!allowed) {
    return (
      <div className={styles.tabBody}>
        <PermissionState
          kind="forbidden"
          title={t('denied.title')}
          description={t('denied.activity')}
        />
      </div>
    );
  }

  return (
    <div className={styles.tabBody}>
      <Segmented<Segment>
        value={segment}
        onChange={setSegment}
        options={[
          {
            value: SEGMENT.ACTIVITY,
            icon: <HistoryOutlined />,
            label: t('activity.segments.activity'),
          },
          {
            value: SEGMENT.SESSIONS,
            icon: <CustomerServiceOutlined />,
            label: t('activity.segments.sessions'),
          },
        ]}
      />
      {segment === SEGMENT.ACTIVITY ? (
        <ActivityList
          tenantId={tenantId}
          kind={kind}
          canViewMoney={has(PERMISSION.PLATFORM_MONEY_MANAGE)}
        />
      ) : (
        <SupportSessions tenantId={tenantId} />
      )}
    </div>
  );
}

function ActivityList({
  tenantId,
  kind,
  canViewMoney,
}: {
  tenantId: string;
  kind: PlatformPartnerKind;
  canViewMoney: boolean;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.activity');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const [filters, setFilters] = useState<PartnerActivityFilters>({});
  const [range, setRange] = useState<RangeKey>('all');
  const query = usePartnerActivity(tenantId, filters, true);
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: tTab('denied.activity'),
  });

  const all = { value: ALL_FILTER, label: t('filters.all') };
  const fields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    {
      kind: 'select',
      key: 'actorScope',
      label: t('filters.source'),
      allowClear: false,
      options: [
        all,
        ...AUDIT_ACTOR_SCOPE_VALUES.map((value) => ({
          value,
          label: domainLabel('auditActorScope', value),
        })),
      ],
    },
    {
      kind: 'select',
      key: 'category',
      label: t('filters.category'),
      allowClear: false,
      options: [
        all,
        ...auditCategoriesFor(kind, { canViewMoney }).map((value) => ({
          value,
          label: domainLabel('auditActionCategory', value),
        })),
      ],
    },
    {
      kind: 'select',
      key: 'range',
      label: t('filters.range'),
      allowClear: false,
      options: (Object.keys(RANGE_DAYS) as RangeKey[]).map((value) => ({
        value,
        label: t(`range.${value}`),
      })),
    },
  ];

  function update(patch: Record<string, string | undefined>) {
    const next: PartnerActivityFilters = { ...filters, page: undefined };
    if ('q' in patch) next.q = patch.q || undefined;
    if ('actorScope' in patch)
      next.actorScope = patch.actorScope === ALL_FILTER ? undefined : patch.actorScope;
    if ('category' in patch)
      next.category = patch.category === ALL_FILTER ? undefined : patch.category;
    if ('range' in patch) {
      const key = (patch.range ?? 'all') as RangeKey;
      setRange(key);
      const days = RANGE_DAYS[key];
      next.dateFrom = days
        ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    }
    setFilters(next);
  }

  const items = query.data?.items ?? [];
  const groups = groupByDay(items);
  const filtered = Boolean(filters.q || filters.actorScope || filters.category || filters.dateFrom);

  return (
    <div className={styles.columns}>
      <div className={styles.stack}>
        <FilterBar
          fields={fields}
          values={{
            q: filters.q,
            actorScope: filters.actorScope ?? ALL_FILTER,
            category: filters.category ?? ALL_FILTER,
            range,
          }}
          onChange={update}
        />
        {state ??
          (items.length === 0 ? (
            <EmptyState
              variant={filtered ? 'no-results' : 'empty'}
              title={filtered ? t('noResults') : t('empty')}
            />
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.day}>
                  <h4 className={styles.dayHeading}>{dayLabel(group.day, t, fmt)}</h4>
                  {group.items.map((row) => (
                    <ActivityRow key={row.id} row={row} />
                  ))}
                </section>
              ))}
              <Pagination
                size="small"
                current={query.data?.meta.page ?? 1}
                pageSize={PARTNER_DETAIL_PAGE_SIZE}
                total={query.data?.meta.total ?? 0}
                showSizeChanger={false}
                showTotal={(total) => t('total', { count: total })}
                onChange={(page) => setFilters({ ...filters, page })}
              />
            </>
          ))}
      </div>
      <DashboardPanel title={t('ipNote.title')} icon={<LockOutlined />}>
        <p className={styles.bio}>{t('ipNote.body')}</p>
      </DashboardPanel>
    </div>
  );
}

function ActivityRow({ row }: { row: PartnerActivity }) {
  const t = useTranslations('AdminTenants.partnerDetail.activity');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const verb = row.action.slice(row.action.lastIndexOf('.') + 1);
  const verbLabel = domainLabel('auditActionVerb', verb, '');
  const category = domainLabel('auditActionCategory', row.category);
  return (
    <div className={styles.activityRow}>
      <span className={styles.muted}>{fmt.time(row.createdAt)}</span>
      <span className={styles.stack}>
        <span className={styles.activityTitle}>
          {verbLabel ? t('title', { category, verb: verbLabel }) : category}
        </span>
        <span className={styles.muted}>
          {row.actorName ?? t('systemActor')} · {domainLabel('auditActorScope', row.actorScope)}
          {row.viaSupport ? (
            <Tag className={styles.small} color="gold">
              {t('viaSupport')}
            </Tag>
          ) : null}
        </span>
      </span>
      {row.targetId ? (
        <Link href={adminAuditPath.forTarget(row.targetType, row.targetId)}>
          {t('viewDetail')} <RightOutlined aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function SupportSessions({ tenantId }: { tenantId: string }) {
  const t = useTranslations('AdminTenants.partnerDetail.activity.sessions');
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const tSupport = useTranslations('TenantSupport.banner');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const [page, setPage] = useState(1);
  const query = usePartnerSupportSessions(tenantId, { page }, true);
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: tTab('denied.activity'),
  });
  if (state) return <>{state}</>;

  const columns: DataTableColumn<PartnerSupportSession>[] = [
    {
      title: t('columns.opened'),
      key: 'opened',
      width: 150,
      render: (_, row) => fmt.dateTime(row.createdAt),
    },
    {
      title: t('columns.actor'),
      key: 'actor',
      width: 160,
      render: (_, row) => row.actorName ?? '—',
    },
    {
      title: t('columns.mode'),
      key: 'mode',
      width: 130,
      render: (_, row) =>
        tSupport.has(`mode.${row.mode}` as never)
          ? tSupport(`mode.${row.mode}` as never)
          : row.mode,
    },
    {
      title: t('columns.workspace'),
      key: 'workspace',
      width: 200,
      render: (_, row) =>
        tSupport.has(`workspace.${row.workspace}` as never)
          ? tSupport(`workspace.${row.workspace}` as never)
          : row.workspace,
    },
    { title: t('columns.reason'), key: 'reason', width: 260, render: (_, row) => row.reason },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <Tag color={row.status === SUPPORT_SESSION_STATUS.ACTIVE ? 'processing' : undefined}>
          {domainLabel('supportSessionStatus', row.status)}
        </Tag>
      ),
    },
  ];

  return (
    <DataTable<PartnerSupportSession>
      label={t('tableLabel')}
      columns={columns}
      items={query.data?.items ?? []}
      minWidth={1030}
      loading={query.isFetching}
      empty={{ title: t('empty') }}
      pagination={{
        meta: query.data?.meta ?? {
          page: 1,
          limit: PARTNER_DETAIL_PAGE_SIZE,
          total: 0,
          hasNext: false,
        },
        onChange: (next) => setPage(next),
        totalLabel: (count) => t('total', { count }),
      }}
    />
  );
}

function groupByDay(items: PartnerActivity[]): { day: string; items: PartnerActivity[] }[] {
  const groups: { day: string; items: PartnerActivity[] }[] = [];
  for (const item of items) {
    const day = toAppTz(item.createdAt).format(DAY_PARAM_FORMAT);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

function dayLabel(
  day: string,
  t: ReturnType<typeof useTranslations<'AdminTenants.partnerDetail.activity'>>,
  fmt: ReturnType<typeof useAppFormat>,
): string {
  const today = nowInAppTz().format(DAY_PARAM_FORMAT);
  const yesterday = nowInAppTz().subtract(1, 'day').format(DAY_PARAM_FORMAT);
  if (day === today) return t('today');
  if (day === yesterday) return t('yesterday');
  return fmt.dateKey(day);
}
