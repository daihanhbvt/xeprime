import { useRouter } from 'expo-router';
import { useAccumulatedPages } from '@/hooks/use-accumulated-pages';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { RefreshControl } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  SUPPORT_CASE_CATEGORY_VALUES,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  PERMISSION,
  STATUS_COLOR,
  isSupportCaseCategory,
  isSupportCaseStatus,
  type SupportCaseCategory,
  type SupportCaseStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipTabs, type ChipTabItem } from '@/components/ui/ChipTabs';
import { FactRow } from '@/components/ui/FactRow';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { LineIcon } from '@/components/icons/LineIcon';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useResponsive } from '@/theme/use-responsive';
import { CardAccent } from '@/components/ui/CardAccent';
import { IconLine } from '@/components/ui/IconLine';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ManageListShell } from '@/features/shell/ManageListShell';
import { ManageStateScroll } from '@/features/shell/ManageStateScroll';
import type { FilterGroup } from '@/features/shell/ManageFilterSheet';
import { layout } from '@/theme/layout';
import { LIST_TUNING } from '@/theme/list-tuning';
import { scrollThrottle } from '@/theme/motion';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectControl } from '@/components/ui/SelectControl';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { FILTER_ALL } from '@/constants/filters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space, typeScale } from '@/theme/tokens';
import {
  SUPPORT_CASES_PAGE_SIZE,
  SUPPORT_SURFACE,
  type SupportCase,
  type SupportSurface,
} from './api';
import { OpenCaseSheet } from './components/OpenCaseSheet';
import { useCanWriteSupportCase, useSupportCases } from './hooks/use-support-cases';

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `status=all`. */
const ALL = FILTER_ALL;

/**
 * Yêu cầu hỗ trợ của CHÍNH người dùng — bản native của `CustomerSupportCases`.
 *
 * KHÁC `/support` công khai của chợ xe: đó là trung tâm hướng dẫn và câu hỏi thường gặp, còn đây
 * là những yêu cầu CÓ MÃ THEO DÕI mà chính họ đã mở.
 *
 * Phạm vi đọc là việc của server (`SupportService.scopeWhere`), không phải của client — nên không
 * có bộ lọc "chỉ yêu cầu của tôi" ở đây, đúng như web.
 */
/** Hoãn gọi API trong lúc người dùng còn gõ — cùng nhịp với hộp thư yêu cầu thuê. */
const SEARCH_DEBOUNCE_MS = 350;

const SKELETON_ROWS = 3;

function caseKey(row: SupportCase): string {
  return row.id;
}

export function SupportCasesScreen({ surface }: { surface: SupportSurface }) {
  const colors = useColors();
  const t = useTranslations('SupportCases');
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const tPermission = useTranslations('ManageCommon.permission');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');

  const isTenant = surface === SUPPORT_SURFACE.TENANT;
  // Kiểu union, không phải `string`: sentinel "tất cả" là giá trị của GIAO DIỆN, còn khi đã
  // chọn thì nó phải là đúng một mã server hiểu — nới thành `string` là mất luôn phần canh đó.
  const [status, setStatus] = useState<SupportCaseStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<SupportCaseCategory | typeof ALL>(ALL);
  /*
   * Tìm theo MÃ hoặc tiêu đề — cách người ta thật sự tìm lại một yêu cầu cũ là đọc mã trong email
   * rồi dán vào, và hai bộ lọc kia không thay được việc đó.
   *
   * Gõ thì hoãn 350ms rồi mới gọi: mỗi ký tự một request là một lượt tải cho một chuỗi chưa gõ
   * xong. Ô hiện chữ NGAY (state cục bộ), chỉ lượt gọi bị hoãn.
   */
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  /*
   * Mở xong thì vào thẳng yêu cầu vừa tạo — web `SupportCasesView` cũng mở hộp chi tiết của nó
   * (`onOpened={setOpenId}`): người dùng vừa gửi là muốn theo dõi chính yêu cầu đó.
   */
  const openDetail = useCallback(
    (id: string) =>
      router.push(
        surface === SUPPORT_SURFACE.TENANT
          ? ROUTES.manage.supportCase(id)
          : ROUTES.account.supportCase(id),
      ),
    [router, surface],
  );

  const q = debouncedSearch.trim();
  const query = useSupportCases(surface, {
    ...(status === ALL ? {} : { status }),
    ...(category === ALL ? {} : { category }),
    ...(q ? { q } : {}),
    page,
    limit: SUPPORT_CASES_PAGE_SIZE,
  }, {
    // Như web `ShopSupportCasesPage`: chưa biết quyền thì chưa gọi, thiếu `support.view` thì không gọi.
    enabled: !isTenant || (!permissions.isLoading && permissions.has(PERMISSION.SUPPORT_VIEW)),
  });
  /** Lúc quyền còn đang tải, query bị tắt nên `isLoading` = false - vẫn phải hiện khung chờ. */
  const listLoading = query.isLoading || (isTenant && permissions.isLoading);

  // Cuộn vô hạn trên mobile: gộp các trang đã tải (`useAccumulatedPages`).
  const items = useAccumulatedPages(query.data?.items, query.data?.meta?.page);
  const total = query.data?.meta?.total ?? 0;
  const filtered = status !== ALL || category !== ALL || q !== '';

  const statusOptions = useMemo(
    () => [
      { value: ALL, label: t('filters.status') },
      ...SUPPORT_CASE_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('supportCaseStatus', value),
      })),
    ],
    [t, domainLabel],
  );

  /*
   * Danh mục lọc GIỮ NGUYÊN cả `account_deletion` — đúng như web. Nó không MỞ được ở đây (luồng
   * riêng ở "Yêu cầu xoá tài khoản"), nhưng một yêu cầu đã mở thì vẫn phải lọc ra xem được.
   */
  const categoryOptions = useMemo(
    () => [
      { value: ALL, label: t('filters.category') },
      ...SUPPORT_CASE_CATEGORY_VALUES.map((value) => ({
        value,
        label: domainLabel('supportCaseCategory', value),
      })),
    ],
    [t, domainLabel],
  );

  // Thành viên gian hàng chỉ có `support.view` không mở được case — web không dựng nút (cả ở
  // trạng thái rỗng).
  const canOpen = useCanWriteSupportCase(surface);
  const openButton = canOpen ? (
    <Button label={t('page.openButton')} icon="add" onPress={() => setFormOpen(true)} />
  ) : null;

  /** Đổi bộ lọc là về TRANG 1: giữ trang 5 của một bộ lọc khác thường ra một danh sách rỗng. */
  const patch = (apply: () => void) => {
    apply();
    setPage(1);
  };

  /** Hai chiều lọc trong tấm trượt "Bộ lọc" — lựa chọn đầu là "Tất cả", như mọi danh sách khác. */
  const groups = useMemo<readonly FilterGroup[]>(
    () => [
      {
        key: 'category',
        label: t('filters.category'),
        value: category,
        resetValue: ALL,
        options: [{ value: ALL, label: tLabels('all') }, ...categoryOptions.slice(1)],
      },
    ],
    [t, tLabels, category, categoryOptions],
  );

  /** Trạng thái là NHÓM chính của màn - dải `ChipTabs` như chặng của Đơn thuê; Loại ở tấm Lọc. */
  const { gutter } = useResponsive();
  const statusTabs = useMemo<ChipTabItem<SupportCaseStatus | typeof ALL>[]>(
    () => [
      { value: ALL, label: tLabels('all') },
      ...SUPPORT_CASE_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('supportCaseStatus', value),
      })),
    ],
    [tLabels, domainLabel],
  );
  const selectStatus = useCallback((next: SupportCaseStatus | typeof ALL) => {
    setStatus(next);
    setPage(1);
  }, []);

  const changeFilter = useCallback((groupKey: string, value: string) => {
    if (groupKey === 'status') setStatus(isSupportCaseStatus(value) ? value : ALL);
    else setCategory(isSupportCaseCategory(value) ? value : ALL);
    setPage(1);
  }, []);

  const clearFilters = () => {
    setStatus(ALL);
    setCategory(ALL);
    setSearch('');
    setPage(1);
  };

  /*
   * Bề mặt GIAN HÀNG gác bằng quyền `SUPPORT_VIEW`, đúng như trang web tương ứng — và KHÔNG gác
   * bằng cờ gói: tranh chấp có hệ quả tiền (nó tạm giữ việc chốt khoản giữ chỗ của chuyến), nên
   * nó thuộc bộ CƠ BẢN (ADR 0027 điều 1). Bề mặt khách không có quyền nào để kiểm — đó là dữ
   * liệu của chính người đang đăng nhập.
   */
  if (isTenant && !permissions.isLoading && !permissions.has(PERMISSION.SUPPORT_VIEW)) {
    return (
      <>
        <ManagePageHeader title={t('page.tenantTitle')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.noPermissionTitle')}
            description={`${t('page.noPermission')}\n${tPermission('requires')} ${PERMISSION.SUPPORT_VIEW}`}
            actionLabel={t('page.backHome')}
            onAction={() => router.replace(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  if (isTenant) {
    return (
      <>
        <ManagePageHeader
          title={t('page.tenantTitle')}
          actions={
            canOpen ? (
              <IconSquareButton label={t('page.openButton')} tone="brand" onPress={() => setFormOpen(true)}>
                <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
              </IconSquareButton>
            ) : null
          }
        />
        <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
          {/*
            Cùng khung với mọi danh sách của khu quản lý (`ManageListShell`): nút "+" tròn ở hàng
            tiêu đề, ô tìm + nút "Bộ lọc" mở tấm trượt gom Trạng thái và Loại — thay hai ô chọn
            dàn hàng dọc và nút "Mở yêu cầu" trải ngang.
          */}
          <ManageListShell
            variant="page"
            title={t('page.tenantTitle')}
            subtitle={t('page.tenantSubtitle')}
            {...(total > 0 ? { total: t('page.total', { count: total }) } : {})}
            tabs={
              <ChipTabs
                label={t('filters.status')}
                items={statusTabs}
                value={status}
                onSelect={selectStatus}
                gutter={gutter}
              />
            }
            searchValue={search}
            searchLabel={t('filters.search')}
            searchPlaceholder={t('filters.searchPlaceholder')}
            onSearchChange={(next) => patch(() => setSearch(next))}
            groups={groups}
            onFilterChange={changeFilter}
            hasRows={items.length > 0}
            {...(total > 0 ? { meta: { page, limit: SUPPORT_CASES_PAGE_SIZE, total } } : {})}
            onPageChange={setPage}
            loadingMore={query.isFetching && page > 1}
          >
            {({ onScroll, headerHeight, contentContainerStyle, bindList }) => {
              const inStateScroll = (body: ReactNode) => (
                <ManageStateScroll
                  onScroll={onScroll}
                  headerHeight={headerHeight}
                  refreshing={query.isRefetching}
                  onRefresh={() => void query.refetch()}
                >
                  {body}
                </ManageStateScroll>
              );
              return listLoading ? (
                inStateScroll(
                  <YStack px={layout.screenX} gap={layout.inline}>
                    {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                      <ActionCardSkeleton key={i} />
                    ))}
                  </YStack>,
                )
              ) : query.isError && !query.data ? (
                inStateScroll(
                  <ScreenError
                    error={query.error}
                    title={t('page.loadError')}
                    onRetry={() => void query.refetch()}
                  />,
                )
              ) : items.length === 0 ? (
                inStateScroll(
                  filtered ? (
                    <ScreenMessage
                      icon="search-outline"
                      title={tLabels('none')}
                      actionLabel={tActions('clear')}
                      onAction={clearFilters}
                    />
                  ) : (
                    // Web `SupportCasesView`: khối rỗng có nút "Mở yêu cầu" (khi được mở).
                    <ScreenMessage
                      icon="chatbubbles-outline"
                      title={t('page.empty')}
                      {...(canOpen
                        ? { actionLabel: t('page.openButton'), onAction: () => setFormOpen(true) }
                        : {})}
                    />
                  ),
                )
              ) : (
                <Animated.FlatList
                  ref={bindList}
                  data={items}
                  keyExtractor={caseKey}
                  {...LIST_TUNING}
                  renderItem={({ item }) => <SupportCaseRow row={item} surface={surface} />}
                  contentContainerStyle={contentContainerStyle}
                  onScroll={onScroll}
                  scrollEventThrottle={scrollThrottle.frame}
                  refreshControl={
                    <RefreshControl
                      refreshing={query.isRefetching}
                      onRefresh={() => void query.refetch()}
                      tintColor={colors.primaryActive}
                      progressViewOffset={headerHeight}
                    />
                  }
                />
              );
            }}
          </ManageListShell>
        </Screen>

        <OpenCaseSheet
          surface={surface}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onOpened={openDetail}
        />
      </>
    );
  }

  return (
    <>
      {/* Khu quản lý có thanh riêng của nó; khu khách có nút lui về menu tài khoản. */}
      {isTenant ? (
        <ManageHeader />
      ) : (
        <AppHeader
          onBack={() => goBackOr(router, ROUTES.account.home())}
          title={t('page.customerTitle')}
          subtitle={t('page.customerSubtitle')}
        />
      )}
      <Screen edges={['left', 'right', 'bottom']}>
        {isTenant ? (
          <ManagePageTitle title={t('page.tenantTitle')} subtitle={t('page.tenantSubtitle')} />
        ) : null}
        <YStack gap={space.md}>
          {openButton}

          <YStack gap={space.sm}>
            <SearchInput
              value={search}
              onChange={(next) => patch(() => setSearch(next))}
              label={t('filters.search')}
              placeholder={t('filters.searchPlaceholder')}
              variant="boxed"
            />
            <SelectControl
              label={t('filters.status')}
              value={status}
              options={statusOptions}
              onChange={(next) => patch(() => setStatus(isSupportCaseStatus(next) ? next : ALL))}
            />
            <SelectControl
              label={t('filters.category')}
              value={category}
              options={categoryOptions}
              onChange={(next) =>
                patch(() => setCategory(isSupportCaseCategory(next) ? next : ALL))
              }
            />
          </YStack>

          {listLoading ? (
            <MiniRowsSkeleton rows={4} />
          ) : query.isError ? (
            <ScreenError
              error={query.error}
              title={t('page.loadError')}
              onRetry={() => void query.refetch()}
            />
          ) : items.length === 0 ? (
            /*
             * Rỗng vì LỌC và rỗng vì chưa có yêu cầu nào là hai chuyện khác nhau — lối ra của
             * chúng khác nhau, nên không dùng chung một nút.
             */
            <ScreenMessage
              icon="chatbubbles-outline"
              title={t('page.empty')}
              // Màn trống dữ liệu chỉ mô tả, không nút mở yêu cầu (người dùng chốt 27/10/2026).
            />
          ) : (
            <YStack gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('page.total', { count: total })}
              </Text>
              {items.map((row) => (
                <SupportCaseRow key={row.id} row={row} surface={surface} />
              ))}
              {total > SUPPORT_CASES_PAGE_SIZE ? (
                <Pagination
                  page={page}
                  limit={SUPPORT_CASES_PAGE_SIZE}
                  total={total}
                  onChange={setPage}
                />
              ) : null}
            </YStack>
          )}
        </YStack>
      </Screen>

      <OpenCaseSheet
          surface={surface}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onOpened={openDetail}
        />
    </>
  );
}

/** Một yêu cầu trong danh sách — bốn cột của web gập lại thành một thẻ chạm được. */
function SupportCaseRow({ row, surface }: { row: SupportCase; surface: SupportSurface }) {
  const colors = useColors();
  const t = useTranslations('SupportCases');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const meta = SUPPORT_CASE_STATUS_META[row.status as SupportCaseStatus];
  const statusColor = meta?.color ?? STATUS_COLOR.NEUTRAL;

  /* Mỗi khu có route riêng — mở một case của gian hàng bằng đường của khu khách là lạc khu. */
  const detailHref =
    surface === SUPPORT_SURFACE.TENANT
      ? ROUTES.manage.supportCase(row.id)
      : ROUTES.account.supportCase(row.id);

  if (surface === SUPPORT_SURFACE.TENANT) {
    /* Khuôn thẻ Partner (chuẩn Đơn thuê): đầu = tiêu đề + mã, viên trạng thái góc phải; thân = FactRow. */
    return (
      <Card onPress={() => router.push(detailHref)} accessibilityLabel={row.subject}>
          <YStack gap={space.sm}>
            <XStack ai="flex-start" gap={space.sm}>
              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {row.subject}
                </Text>
                <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                  {row.code}
                </Text>
              </YStack>
              <Pill
                label={domainLabel('supportCaseStatus', row.status, meta?.label)}
                tone={pillToneOfStatusColor(statusColor)}
              />
            </XStack>
            <FactRow label={t('columns.category')}>{domainLabel('supportCaseCategory', row.category)}</FactRow>
            <FactRow label={t('columns.updatedAt')}>{fmt.dateTime(row.updatedAt)}</FactRow>
          </YStack>
      </Card>
    );
  }

  return (
    /* Ngôn ngữ thẻ danh sách chung: vạch màu trạng thái ở mép trái, nhãn trạng thái góc phải. */
    <Card padded={false} onPress={() => router.push(detailHref)} accessibilityLabel={row.subject}>
      <XStack>
        <CardAccent color={statusColor} />
        <YStack f={1} minWidth={0} p={space.sm} gap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {row.code}
            </Text>
            <StatusBadge
              label={domainLabel('supportCaseStatus', row.status, meta?.label)}
              color={statusColor}
              size="sm"
            />
          </XStack>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={2}>
            {row.subject}
          </Text>
          <IconLine icon="pricetag-outline">
            {domainLabel('supportCaseCategory', row.category)}
          </IconLine>
          <IconLine icon="time-outline">
            {`${t('columns.updatedAt')}${LIST_SEPARATOR}${fmt.dateTime(row.updatedAt)}`}
          </IconLine>
        </YStack>
      </XStack>
    </Card>
  );
}
