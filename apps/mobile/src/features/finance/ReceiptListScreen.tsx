import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, type ListRenderItem } from 'react-native';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PAYMENT_METHOD_VALUES,
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_SOURCE_VALUES,
  RECEIPT_STATUS_VALUES,
  RECEIPT_TYPE_VALUES,
} from '@xeprime/types';

import { Screen } from '@/components/layout/Screen';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { FIRST_PAGE, useClampedPage } from '@/queries/use-clamped-page';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { colors, fontSize, space } from '@/theme/tokens';
import { CategoryManagerSheet } from './components/CategoryManagerSheet';
import { FinancePeriodBar } from './components/FinancePeriodBar';
import { ReceiptCard } from './components/ReceiptCard';
import { ReceiptDetailSheet } from './components/ReceiptDetailSheet';
import { ReceiptFormSheet } from './components/ReceiptFormSheet';
import { ReceiptSummaryCards } from './components/ReceiptSummaryCards';
import { FILTER_ALL, RECEIPT_PERIOD_VALUES } from './constants';
import { hasReceiptFilters, type Receipt, type ReceiptFilters } from './api';
import { useFinanceCategories, useReceipts, useReceiptSummary } from './hooks/use-finance';

const SKELETON_ROWS = 4;
const SEARCH_DEBOUNCE_MS = 300;

// Ở module scope, không inline: FlatList coi `keyExtractor` mới là prop đổi và dựng lại cả cây con.
const keyOf = (receipt: Receipt) => receipt.id;

/**
 * Sổ Thu-Chi (FIN-02) — bản native của `/manage/receipts`.
 *
 * Một màn cho HAI vai, đúng như web: cuốn sổ đầy đủ của gian hàng (mở từ menu), và một tập phiếu
 * ĐÃ LỌC SẴN (mở từ thẻ tổng ở màn Tổng quan, từ hồ sơ xe, từ hồ sơ khách). Phạm vi tới từ tham
 * số route — cùng bộ tên tham số web đặt trên URL.
 *
 * **Phạm vi phải NHÌN THẤY ĐƯỢC.** Web không cần: nó nằm trên thanh địa chỉ. Trên app thì không
 * có thanh nào, và một cuốn sổ bị lọc âm thầm đọc ra là "gian hàng chỉ có ngần này phiếu" — nên
 * mỗi chiều phạm vi là một viên gỡ được ngay tại chỗ.
 *
 * Thẻ tổng cộng trên ĐÚNG bộ lọc đang xem (`/receipts/summary` cùng vị từ với danh sách), và
 * khoá của nó KHÔNG mang `page` — sang trang không làm bốn con số nháy.
 */
export function ReceiptListScreen() {
  const params = useLocalSearchParams<{
    type?: string;
    status?: string;
    categoryId?: string;
    source?: string;
    sourceGroup?: string;
    paymentMethod?: string;
    bookingId?: string;
    vehicleId?: string;
    tenantCustomerId?: string;
    q?: string;
    from?: string;
    to?: string;
    create?: string;
  }>();

  const t = useTranslations('Finance.receipts');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const tFeature = useTranslations('ManageCommon.feature');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const canCreate = permissions.has(PERMISSION.RECEIPT_CREATE);

  /*
   * PHẠM VI = đúng bốn chiều KHÔNG có ô điều khiển trên thanh lọc (y hệt web): đơn · xe · khách ·
   * nhóm nguồn. Chúng đến từ lối vào — thẻ tổng, hồ sơ xe, hồ sơ khách — chứ không phải lựa chọn
   * của người dùng, nhưng chúng ĐANG cắt danh sách nên phải hiện ra và gỡ được.
   *
   * Mọi chiều còn lại (`type`, `status`, `categoryId`, `source`, `paymentMethod`, khoảng ngày,
   * từ khoá) đã có ô riêng trong tấm lọc, nên tham số route chỉ là GIÁ TRỊ KHỞI TẠO của ô đó —
   * dựng thêm một viên phạm vi cho chúng là hai chỗ điều khiển cùng một bộ lọc.
   */
  const [scope, setScope] = useState<ReceiptFilters>(() => ({
    ...(params.sourceGroup ? { sourceGroup: params.sourceGroup } : {}),
    ...(params.bookingId ? { bookingId: params.bookingId } : {}),
    ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
    ...(params.tenantCustomerId ? { tenantCustomerId: params.tenantCustomerId } : {}),
  }));

  const [type, setType] = useState(params.type ?? FILTER_ALL);
  const [status, setStatus] = useState(params.status ?? FILTER_ALL);
  const [categoryId, setCategoryId] = useState(params.categoryId ?? FILTER_ALL);
  const [source, setSource] = useState(params.source ?? FILTER_ALL);
  const [paymentMethod, setPaymentMethod] = useState(params.paymentMethod ?? FILTER_ALL);
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');
  const [search, setSearch] = useState(params.q ?? '');
  const [page, setPage] = useState(FIRST_PAGE);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  /* `?create=1` là Ý ĐỊNH mang sang từ hồ sơ xe — chỉ là giá trị KHỞI TẠO, không phải bộ lọc. */
  const [formOpen, setFormOpen] = useState(() => params.create === '1' && canCreate);

  /**
   * Tham số route → bộ lọc, **mỗi lần chúng ĐỔI**, không chỉ lúc mount.
   *
   * Sổ Thu-Chi là một TAB. Tab được giữ sống sau lần mở đầu tiên, nên `useState(params.x ?? …)`
   * ở trên chỉ chạy đúng một lần trong cả phiên: mở sổ một lần rồi quay về Tổng quan bấm "Bảo
   * dưỡng/Thay nhớt" thì màn hiện ra là cuốn sổ CŨ với bộ lọc cũ — thẻ nói một đằng, danh sách
   * nói một nẻo, mà không có gì trên màn nói ra là lối đi đã hỏng. Lần đầu thì lại đúng, nên lỗi
   * này chỉ lộ ra ở lần bấm thứ hai.
   *
   * So bằng CHỮ KÝ chứ không bằng object: `useLocalSearchParams` trả về object mới mỗi lần
   * render, đưa thẳng vào deps là hiệu ứng chạy vô tận.
   *
   * Chữ ký khởi tạo bằng chính chữ ký hiện tại: lần mount đầu `useState` đã đọc xong tham số,
   * chạy lại ở đây là ghi đè đúng những giá trị vừa đặt.
   */
  const routeSignature = [
    params.type,
    params.status,
    params.categoryId,
    params.source,
    params.sourceGroup,
    params.paymentMethod,
    params.bookingId,
    params.vehicleId,
    params.tenantCustomerId,
    params.q,
    params.from,
    params.to,
    params.create,
  ].join('|');

  const appliedSignature = useRef(routeSignature);

  useEffect(() => {
    if (appliedSignature.current === routeSignature) return;
    appliedSignature.current = routeSignature;

    setScope({
      ...(params.sourceGroup ? { sourceGroup: params.sourceGroup } : {}),
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
      ...(params.tenantCustomerId ? { tenantCustomerId: params.tenantCustomerId } : {}),
    });
    setType(params.type ?? FILTER_ALL);
    setStatus(params.status ?? FILTER_ALL);
    setCategoryId(params.categoryId ?? FILTER_ALL);
    setSource(params.source ?? FILTER_ALL);
    setPaymentMethod(params.paymentMethod ?? FILTER_ALL);
    setFrom(params.from ?? '');
    setTo(params.to ?? '');
    setSearch(params.q ?? '');
    setPage(FIRST_PAGE);
    /*
     * `create` là Ý ĐỊNH mang theo đường dẫn, không phải bộ lọc. Đặt thẳng chứ không chỉ-bật:
     * một lối vào MỚI (chữ ký đổi) mang theo một ý định mới, và ý định đó có thể là "chỉ xem sổ".
     */
    setFormOpen(params.create === '1' && canCreate);
  }, [
    routeSignature,
    params.type,
    params.status,
    params.categoryId,
    params.source,
    params.sourceGroup,
    params.paymentMethod,
    params.bookingId,
    params.vehicleId,
    params.tenantCustomerId,
    params.q,
    params.from,
    params.to,
    params.create,
    canCreate,
  ]);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmedSearch = debouncedSearch.trim();

  const filters = useMemo<ReceiptFilters>(
    () => ({
      ...scope,
      ...(type === FILTER_ALL ? {} : { type }),
      ...(status === FILTER_ALL ? {} : { status }),
      ...(categoryId === FILTER_ALL ? {} : { categoryId }),
      ...(source === FILTER_ALL ? {} : { source }),
      ...(paymentMethod === FILTER_ALL ? {} : { paymentMethod }),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(trimmedSearch ? { q: trimmedSearch } : {}),
      page,
    }),
    [scope, type, status, categoryId, source, paymentMethod, from, to, trimmedSearch, page],
  );

  const query = useReceipts(filters, canViewFinance);
  const summary = useReceiptSummary(filters, canViewFinance);
  /* Danh mục nạp sẵn cho ô lọc: người dùng phải THẤY có những nhóm nào rồi mới chọn được. */
  const { data: categories } = useFinanceCategories(undefined, canViewFinance);

  /*
   * `?? []` dựng mảng MỚI mỗi lần render — đưa thẳng vào deps của `useMemo` bên dưới là nó tính
   * lại ở mọi lần render, và dải viên phạm vi dựng lại theo.
   */
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const meta = query.data?.meta;

  /* Duyệt / huỷ làm danh sách ngắn đi — trang đang đứng có thể biến mất theo. */
  useClampedPage(meta, setPage);

  /**
   * Kéo-làm-mới nạp lại CẢ danh sách LẪN thẻ tổng.
   *
   * Khoá của thẻ tổng đã cố ý bỏ `page`/`limit` nên nó không đi theo mỗi lần sang trang; cái giá
   * là nó cũng không đi theo lần refetch của danh sách. Bỏ nó ra khỏi thao tác làm mới thì người
   * dùng kéo xuống, thấy phiếu mới hiện ra, mà bốn con số ngay trên đầu vẫn là tổng cũ.
   */
  const refresh = useCallback(() => {
    void query.refetch();
    void summary.refetch();
  }, [query, summary]);

  const changeSearch = useCallback((next: string) => {
    setSearch(next);
    setPage(FIRST_PAGE);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    switch (groupKey) {
      case 'type':
        setType(value);
        break;
      case 'status':
        setStatus(value);
        break;
      case 'categoryId':
        setCategoryId(value);
        break;
      case 'source':
        setSource(value);
        break;
      case 'paymentMethod':
        setPaymentMethod(value);
        break;
      case 'from':
        setFrom(value);
        break;
      default:
        setTo(value);
    }
    setPage(FIRST_PAGE);
  }, []);

  /** Kỳ dựng sẵn ghi thẳng `from`/`to` — cùng tham số với ô chọn ngày trong tấm lọc. */
  const changeRange = useCallback((range: { from: string; to: string }) => {
    setFrom(range.from);
    setTo(range.to);
    setPage(FIRST_PAGE);
  }, []);

  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'type',
        label: t('filters.type'),
        value: type,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tLabels('all') },
          ...RECEIPT_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('receiptType', value),
          })),
        ],
      },
      {
        key: 'status',
        label: t('filters.status'),
        value: status,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tLabels('all') },
          ...RECEIPT_STATUS_VALUES.map((value) => ({
            value,
            label: domainLabel('receiptStatus', value),
          })),
        ],
      },
      {
        key: 'categoryId',
        label: t('filters.category'),
        value: categoryId,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tLabels('all') },
          ...(categories ?? []).map((category) => ({
            value: category.id,
            label: category.name,
          })),
        ],
      },
      {
        key: 'source',
        label: t('filters.source'),
        value: source,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tLabels('all') },
          ...RECEIPT_SOURCE_VALUES.map((value) => ({
            value,
            label: domainLabel('receiptSource', value),
          })),
        ],
      },
      {
        key: 'paymentMethod',
        label: t('filters.paymentMethod'),
        value: paymentMethod,
        resetValue: FILTER_ALL,
        options: [
          { value: FILTER_ALL, label: tLabels('all') },
          ...PAYMENT_METHOD_VALUES.map((value) => ({
            value,
            label: domainLabel('paymentMethod', value),
          })),
        ],
      },
      { kind: 'dateRange', label: t('filters.dateRange'), fromKey: 'from', toKey: 'to', from, to },
    ],
    [
      t,
      tLabels,
      domainLabel,
      type,
      status,
      categoryId,
      source,
      paymentMethod,
      from,
      to,
      categories,
    ],
  );

  /**
   * Các chiều PHẠM VI đang cắt danh sách, mỗi chiều một viên gỡ được.
   *
   * Nhãn nói THỰC THỂ chứ không nói id: một viên "01JQZX…" không cho người dùng biết gì cả. Tên
   * lấy từ chính trang dữ liệu đang hiện — nó luôn có mặt khi phạm vi có kết quả, và khi không
   * có kết quả thì nhãn chung vẫn nói đúng chiều đang lọc.
   */
  const scopeChips = useMemo(() => {
    const first = items[0];
    const chips: { key: keyof ReceiptFilters; label: string }[] = [];
    if (scope.tenantCustomerId) {
      chips.push({
        key: 'tenantCustomerId',
        label: `${t('detail.rows.customer')}: ${first?.customerName ?? scope.tenantCustomerId}`,
      });
    }
    if (scope.vehicleId) {
      chips.push({
        key: 'vehicleId',
        label: `${t('detail.rows.vehicle')}: ${first?.vehicleName ?? scope.vehicleId}`,
      });
    }
    if (scope.bookingId) {
      chips.push({
        key: 'bookingId',
        label: `${t('detail.rows.booking')}: ${first?.bookingCode ?? scope.bookingId}`,
      });
    }
    if (scope.sourceGroup) {
      chips.push({
        key: 'sourceGroup',
        label: `${t('filters.source')}: ${domainLabel('receiptSourceGroup', scope.sourceGroup)}`,
      });
    }
    return chips;
  }, [scope, items, t, domainLabel]);

  const clearScope = useCallback((key: keyof ReceiptFilters) => {
    setScope((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setPage(FIRST_PAGE);
  }, []);

  const clearAll = useCallback(() => {
    setScope({});
    setType(FILTER_ALL);
    setStatus(FILTER_ALL);
    setCategoryId(FILTER_ALL);
    setSource(FILTER_ALL);
    setPaymentMethod(FILTER_ALL);
    setFrom('');
    setTo('');
    setSearch('');
    setPage(FIRST_PAGE);
  }, []);

  const renderItem = useCallback<ListRenderItem<Receipt>>(
    ({ item }) => <ReceiptCard receipt={item} showDescription onPress={setDetailId} />,
    [],
  );

  /* Đếm ĐỦ mọi chiều, kể cả chiều chỉ đến từ đường dẫn — cùng vị từ với `hasReceiptFilters`. */
  const filtered = hasReceiptFilters(filters);

  /**
   * Khối đầu trang, GHI NHỚ theo đúng những thứ nó đọc.
   *
   * Đây là khối cao nhất màn: dải viên phạm vi, thẻ tổng bốn dòng, dải kỳ, hai viên hành động.
   * Dựng nó thẳng trong JSX thì mỗi lần màn render nó dựng lại — mà màn render mỗi khi CHẠM vào
   * một phiếu (`detailId`), mở tấm danh mục, mở form. Người dùng cảm nhận đúng cái đó: chạm vào
   * một dòng thì khựng một nhịp trước khi tấm chi tiết trượt lên.
   *
   * Các thẻ phiếu đã `memo` nên chúng không dựng lại; khối này là chỗ duy nhất còn lại làm việc
   * thừa ở mỗi cú chạm.
   */
  const summaryBlock = useMemo(
    () => (
      <YStack px={layout.screenX} pb={space.sm} gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('page.subtitle')}
        </Text>

        {/* Phạm vi đang cắt danh sách — mỗi chiều một viên, gỡ được ngay tại chỗ. */}
        {scopeChips.length > 0 ? (
          <XStack flexWrap="wrap" gap={space.xs}>
            {scopeChips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                icon="close"
                tone="accent"
                role="button"
                size="sm"
                onPress={() => clearScope(chip.key)}
              />
            ))}
          </XStack>
        ) : null}

        <ReceiptSummaryCards
          data={summary.data}
          loading={summary.isFetching}
          error={summary.isError}
          filtered={filtered}
        />

        {/*
          Kỳ xem nhanh — CÙNG component với màn Tổng quan doanh thu, không phải một dải
          viên dựng tay lần thứ hai. Hai bản chép tay là hai chỗ hiểu "tháng này" theo hai
          cách, và ở đây chúng đứng cạnh nhau trong cùng một module tiền.
  
          `customRange={false}`: khoảng ngày tự chọn của sổ đã nằm trong tấm lọc (nhóm
          `dateRange`), thêm hai ô ngày nữa vào khối đầu trang là hai chỗ điều khiển cùng
          một bộ lọc — và khối đầu trang càng cao thì càng lâu mới thấy phiếu đầu tiên.
        */}
        <FinancePeriodBar
          periods={RECEIPT_PERIOD_VALUES}
          from={from}
          to={to}
          onChange={changeRange}
          customRange={false}
        />


        {/* Gói hết hạn: nói RÕ là chế độ chỉ xem, không để nút tắt trông như thiếu quyền. */}
        {canCreate && !finance.canWrite ? (
          <Callout tone="warning">{tFeature('readOnlyTooltip')}</Callout>
        ) : null}
      </YStack>
    ),
    [
      t,
      tFeature,
      scopeChips,
      clearScope,
      summary.data,
      summary.isFetching,
      summary.isError,
      filtered,
      from,
      to,
      changeRange,
      canCreate,
      finance.canWrite,
    ],
  );

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái thiếu quyền, KHÔNG giả thành rỗng.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <ManageListShell
          title={t('page.title')}
          {...(meta === undefined ? {} : { total: t('table.totalLabel', { count: meta.total }) })}
          /*
            Hai lối đi của sổ nằm trên HÀNG TIÊU ĐỀ, cạnh nhau — đúng chỗ web đặt "Danh mục" và
            "Tạo phiếu". Trước đây "Danh mục" là một viên nằm lẫn trong khối thống kê: nó không
            phải bộ lọc, không phải con số, nên đứng giữa dải kỳ và thẻ tổng thì vừa khó tìm vừa
            làm khối đó cao thêm một hàng.
          */
          action={
            <XStack ai="center" gap={space.xs}>
              {/*
                `accent` — nền gold nhạt, viền và hình gold đậm.

                Tông mặc định để hình vẽ đứng trần trên nền trắng: nó đọc ra như một biểu tượng
                trang trí chứ không như một nút. `surface` (xám) thì bấm được nhưng lại nói "phụ",
                trong khi đây là lối đi duy nhất tới màn quản lý danh mục. Gold nhạt đứng cạnh nút
                "Tạo phiếu" gold ĐẶC thành một cặp cùng họ, khác trọng lượng — không phải hai màu
                đấu nhau, và cũng không phải hai nút trông giống hệt nhau.
              */}
              <IconButton
                icon="pricetags-outline"
                label={t('actions.categories')}
                tone="accent"
                onPress={() => setCategoriesOpen(true)}
              />
              {canCreate ? (
                <IconButton
                  icon="add"
                  label={t('actions.create')}
                  tone="primary"
                  disabled={!finance.canWrite}
                  onPress={() => setFormOpen(true)}
                />
              ) : null}
            </XStack>
          }
          summary={summaryBlock}
          searchValue={search}
          searchLabel={t('filters.searchLabel')}
          searchPlaceholder={t('filters.searchPlaceholder')}
          onSearchChange={changeSearch}
          groups={groups}
          onFilterChange={changeFilter}
          {...(meta === undefined ? {} : { meta })}
          onPageChange={setPage}
        >
          {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
            const inStateScroll = (children: ReactNode) => (
              <ManageStateScroll
                onScroll={onScroll}
                headerHeight={headerHeight}
                refreshing={query.isRefetching || summary.isRefetching}
                onRefresh={refresh}
              >
                {children}
              </ManageStateScroll>
            );

            return query.isPending ? (
              inStateScroll(
                <YStack px={layout.screenX} gap={layout.inline}>
                  {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <RecordCardSkeleton key={i} />
                  ))}
                </YStack>,
              )
            ) : query.isError && !query.data ? (
              inStateScroll(
                <ScreenError
                  error={query.error}
                  title={t('table.error.title')}
                  onRetry={() => void query.refetch()}
                />,
              )
            ) : items.length === 0 ? (
              /*
                "Đang lọc mà rỗng" và "sổ chưa có phiếu" là hai câu chuyện khác nhau: lối ra của
                cái này là gỡ bộ lọc, của cái kia là ghi phiếu đầu tiên.
              */
              inStateScroll(
                filtered ? (
                  <ScreenMessage
                    icon="search-outline"
                    title={t('table.noResults.title')}
                    actionLabel={tActions('clear')}
                    onAction={clearAll}
                  />
                ) : (
                  /*
                    KHÔNG có nút "thêm" ở đây: nó đã nằm ở hàng tiêu đề (`ManageListShell action`),
                    và danh sách rỗng thì không có gì để cuộn nên hàng đó đứng nguyên trên màn —
                    hai nút cùng một việc trong cùng một khung hình.
                  */
                  <ScreenMessage icon="receipt-outline" title={t('table.empty.title')} />
                ),
              )
            ) : (
              <Animated.FlatList
                ref={bindList}
                data={items}
                keyExtractor={keyOf}
                {...LIST_TUNING}
                renderItem={renderItem}
                contentContainerStyle={contentContainerStyle}
                onScroll={onScroll}
                scrollEventThrottle={scrollThrottle.frame}
                refreshControl={
                  <RefreshControl
                    refreshing={query.isRefetching || summary.isRefetching}
                    onRefresh={refresh}
                    tintColor={colors.primaryActive}
                    progressViewOffset={headerHeight}
                  />
                }
              />
            );
          }}
        </ManageListShell>
      </Screen>

      {/* MỘT implementation chi tiết phiếu cho mọi lối vào — xem `ReceiptDetailSheet`. */}
      <ReceiptDetailSheet receiptId={detailId} onClose={() => setDetailId(null)} />

      {/* Gắn/tháo theo cờ mở: giá trị mặc định của form chỉ đọc lúc dựng. */}
      {formOpen ? (
        <ReceiptFormSheet
          open
          onClose={() => setFormOpen(false)}
          initialVehicleId={scope.vehicleId ?? null}
        />
      ) : null}

      {/* Gắn/tháo theo cờ mở, cùng lý do với form phiếu: đóng thì nó không còn ở trong cây. */}
      {categoriesOpen ? (
        <CategoryManagerSheet open onClose={() => setCategoriesOpen(false)} />
      ) : null}
    </>
  );
}
