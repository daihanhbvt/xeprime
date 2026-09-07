import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, RECEIPT_STATUS_VALUES, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Pagination } from '@/components/ui/Pagination';
import { SelectControl } from '@/components/ui/SelectControl';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ReceiptCard } from './components/ReceiptCard';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import { useReceipts } from './hooks/use-finance';

const SKELETON_ROWS = 4;

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `status=all`. */
const ALL = 'all';

/**
 * Sổ Thu-Chi ĐÃ LỌC SẴN theo một thực thể.
 *
 * Đây **chưa phải FIN-02 đầy đủ** (không có tổng theo bộ lọc, không tạo/duyệt/huỷ phiếu, không
 * chi tiết phiếu) và cố ý không có mặt trong menu quản lý: nó tồn tại để hai lối đi từ hồ sơ
 * khách — "Xem trên sổ Thu-Chi" và "Xem tất cả N phiếu" — dẫn tới một màn THẬT thay vì một nút
 * chết. Mở FIN-02 trọn vẹn thì mở rộng chính màn này, không dựng màn thứ hai.
 *
 * Phạm vi tới từ tham số route (`tenantCustomerId`, `from`, `to`, `status`) — ngữ cảnh của lối
 * vào, không phải lựa chọn của người dùng; hai chiều lọc còn lại thì có ô chọn.
 */
export function ReceiptListScreen() {
  const params = useLocalSearchParams<{
    tenantCustomerId?: string;
    from?: string;
    to?: string;
    status?: string;
  }>();

  const t = useTranslations('Finance.receipts');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const permissions = usePermissions();

  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);

  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(params.status ?? ALL);

  const filters = useMemo(
    () => ({
      ...(params.tenantCustomerId ? { tenantCustomerId: params.tenantCustomerId } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(type === ALL ? {} : { type }),
      ...(status === ALL ? {} : { status }),
      page,
    }),
    [params.tenantCustomerId, params.from, params.to, type, status, page],
  );

  const query = useReceipts(filters, canViewFinance);

  const typeOptions = useMemo(
    () => [
      { value: ALL, label: t('filters.type') },
      ...RECEIPT_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('receiptType', value),
      })),
    ],
    [t, domainLabel],
  );
  const statusOptions = useMemo(
    () => [
      { value: ALL, label: t('filters.status') },
      ...RECEIPT_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('receiptStatus', value),
      })),
    ],
    [t, domainLabel],
  );

  /**
   * Phạm vi đến từ lối vào (hồ sơ khách), không phải lựa chọn của người dùng — nhưng nó ĐANG cắt
   * danh sách, nên phải hiện ra.
   *
   * Web không cần: phạm vi nằm trên URL và người dùng đọc được ở thanh địa chỉ. Trên app thì
   * không có thanh nào, và một sổ bị lọc âm thầm đọc ra là "gian hàng chỉ có ngần này phiếu".
   */
  const scopeLines = [
    params.tenantCustomerId ? t('detail.rows.customer') : null,
    params.from && params.to ? `${fmt.dateKey(params.from)} → ${fmt.dateKey(params.to)}` : null,
  ].filter(Boolean) as string[];

  const back = () => goBackOr(router, ROUTES.manage.home());

  // Thiếu quyền là 403 của CHÍNH màn này — hiện trạng thái thiếu quyền, KHÔNG giả thành rỗng.
  if (!permissions.isLoading && !canViewFinance) {
    return (
      <>
        <AppHeader title={t('page.title')} onBack={back} />
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

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const filtered = type !== ALL || status !== ALL;

  return (
    <>
      <AppHeader
        title={t('page.title')}
        onBack={back}
        {...(scopeLines.length > 0 ? { subtitle: scopeLines.join(LIST_SEPARATOR) } : {})}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={space.md}>
          <SelectControl
            label={t('filters.type')}
            value={type}
            options={typeOptions}
            onChange={(next) => {
              setType(next);
              setPage(1);
            }}
          />
          <SelectControl
            label={t('filters.status')}
            value={status}
            options={statusOptions}
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
          />

          {meta ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('table.totalLabel', { count: meta.total })}
            </Text>
          ) : null}

          {query.isLoading && !query.data ? (
            Array.from({ length: SKELETON_ROWS }, (_, i) => <RecordCardSkeleton key={i} />)
          ) : query.isError && !query.data ? (
            <ScreenError
              error={query.error}
              title={t('table.error.title')}
              onRetry={() => void query.refetch()}
            />
          ) : items.length === 0 ? (
            <ScreenMessage
              icon="receipt-outline"
              title={filtered ? t('table.noResults.title') : t('table.empty.title')}
            />
          ) : (
            items.map((receipt) => (
              <ReceiptCard key={receipt.id} receipt={receipt} showDescription />
            ))
          )}

          {meta && meta.total > meta.limit ? (
            <Pagination page={meta.page} limit={meta.limit} total={meta.total} onChange={setPage} />
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}
