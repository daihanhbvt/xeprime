import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { Pagination } from '@/components/ui/Pagination';
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
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  SUPPORT_CASES_PAGE_SIZE,
  SUPPORT_SURFACE,
  type SupportCase,
  type SupportSurface,
} from './api';
import { OpenCaseSheet } from './components/OpenCaseSheet';
import { useSupportCases } from './hooks/use-support-cases';

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
export function SupportCasesScreen({ surface }: { surface: SupportSurface }) {
  const t = useTranslations('SupportCases');
  const router = useRouter();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const tPermission = useTranslations('ManageCommon.permission');

  const isTenant = surface === SUPPORT_SURFACE.TENANT;
  // Kiểu union, không phải `string`: sentinel "tất cả" là giá trị của GIAO DIỆN, còn khi đã
  // chọn thì nó phải là đúng một mã server hiểu — nới thành `string` là mất luôn phần canh đó.
  const [status, setStatus] = useState<SupportCaseStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<SupportCaseCategory | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const query = useSupportCases(surface, {
    ...(status === ALL ? {} : { status }),
    ...(category === ALL ? {} : { category }),
    page,
    limit: SUPPORT_CASES_PAGE_SIZE,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.meta?.total ?? 0;
  const filtered = status !== ALL || category !== ALL;

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

  const openButton = (
    <Button label={t('page.openButton')} icon="add" onPress={() => setFormOpen(true)} />
  );

  /** Đổi bộ lọc là về TRANG 1: giữ trang 5 của một bộ lọc khác thường ra một danh sách rỗng. */
  const patch = (apply: () => void) => {
    apply();
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
        <ManageHeader />
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

          {query.isLoading ? (
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
              {...(filtered
                ? {}
                : { actionLabel: t('page.openButton'), onAction: () => setFormOpen(true) })}
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

      <OpenCaseSheet surface={surface} open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}

/** Một yêu cầu trong danh sách — bốn cột của web gập lại thành một thẻ chạm được. */
function SupportCaseRow({ row, surface }: { row: SupportCase; surface: SupportSurface }) {
  const t = useTranslations('SupportCases');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const meta = SUPPORT_CASE_STATUS_META[row.status as SupportCaseStatus];

  /* Mỗi khu có route riêng — mở một case của gian hàng bằng đường của khu khách là lạc khu. */
  const detailHref =
    surface === SUPPORT_SURFACE.TENANT
      ? ROUTES.manage.supportCase(row.id)
      : ROUTES.account.supportCase(row.id);

  return (
    <Card onPress={() => router.push(detailHref)} accessibilityLabel={row.subject}>
      <XStack ai="center" gap={space.sm}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {row.code}
          </Text>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={2}>
            {row.subject}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {domainLabel('supportCaseCategory', row.category)}
            {LIST_SEPARATOR}
            {t('columns.updatedAt')}: {fmt.dateTime(row.updatedAt)}
          </Text>
        </YStack>

        <YStack ai="flex-end">
          <StatusBadge
            label={domainLabel('supportCaseStatus', row.status, meta?.label)}
            color={meta?.color ?? STATUS_COLOR.NEUTRAL}
            size="sm"
          />
        </YStack>
      </XStack>
    </Card>
  );
}
