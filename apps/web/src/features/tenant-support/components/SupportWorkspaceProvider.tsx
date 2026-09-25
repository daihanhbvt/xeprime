'use client';

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { API_ERROR_CODE, SUPPORT_WORKSPACE } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import {
  ROUTES,
  WORKSPACE,
  adminTenantSupportPath,
  workspacePaths,
  workspaceVehiclePaths,
  type WorkspacePaths,
} from '@/constants/routes';
import { tenantSupportHref } from '@/constants/tenant-support-routes';
import { WorkspaceScope, type WorkspaceContextValue } from '@/hooks/use-workspace';
import {
  registerActiveSupportContext,
  releaseActiveSupportContext,
} from '@/services/active-support-context';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { useSupportContext } from '../hooks/use-tenant-support';
import { SupportSessionScope, supportSessionOf, useSupportSession } from '../support-session';
import type { SupportContext } from '../types';
import { SupportBanner } from './SupportBanner';

/** Hai mã nói "phiên này không còn dùng được" — gặp ở bất kỳ request nào là đọc lại phiên ngay. */
const DEAD_SESSION_CODES: readonly string[] = [
  API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED,
  API_ERROR_CODE.SUPPORT_CONTEXT_INVALID,
];

/**
 * Cache RIÊNG cho dữ liệu gian hàng đọc trong một phiên hỗ trợ (ADR 0050).
 *
 * Không dùng chung cache chính, và đó là bảo đảm chống rò chứ không phải tối ưu: query key của
 * feature xe (`['vehicles', 'detail', id]`) không mang gian hàng, nên dùng chung cache thì mở
 * phiên B ngay sau phiên A có thể hiện dữ liệu của A trong một nhịp. Một QueryClient cho mỗi lần
 * mount — và nơi dùng đặt `key={contextId}` — thì đổi phiên là đổi hẳn cache, rời phiên là vứt cache.
 */
export function createSupportQueryClient(onDeadSession: () => void): QueryClient {
  const onError = (error: unknown) => {
    const code = getErrorCode(error);
    if (code && DEAD_SESSION_CODES.includes(code)) onDeadSession();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Bảng đường dẫn của khu làm việc TRONG phiên — chính bảng của gian hàng (Full Manage hoặc Owner
 * Lite), mỗi đích ánh xạ qua `tenantSupportHref`.
 *
 * Đích KHÔNG có trong phiên giữ nguyên href thật: `SupportNavigationScope` chặn nó và NÓI ra là màn
 * đó không mở trong phiên. Đổi nó thành trang đầu của phiên (bản trước) là để một link tên "Ví" dẫn
 * vào danh sách xe — sai nhãn, không lời nào. Trang đầu của phiên `package_pending` là gốc phiên
 * (tóm tắt trạng thái đăng ký), vì phiên đó không có màn nào khác.
 */
export function supportWorkspaceValue(context: SupportContext): WorkspaceContextValue {
  const isManage = context.workspace === SUPPORT_WORKSPACE.MANAGE;
  const workspace = isManage ? WORKSPACE.MANAGE : WORKSPACE.ACCOUNT;
  const map = (href: string) => tenantSupportHref(context.id, href);
  const base = workspacePaths(workspace);
  const home =
    context.workspace === SUPPORT_WORKSPACE.ONBOARDING
      ? adminTenantSupportPath.root(context.id)
      : (map(base.home) ?? map(base.vehicles) ?? adminTenantSupportPath.root(context.id));
  const paths = Object.fromEntries(
    Object.entries(base).map(([key, href]) => [key, key === 'home' ? home : (map(href) ?? href)]),
  ) as WorkspacePaths;
  const vehicles = workspaceVehiclePaths(workspace);
  const mapOrKeep = (href: string) => map(href) ?? href;
  return {
    workspace,
    paths,
    vehicles: {
      detail: (id) => mapOrKeep(vehicles.detail(id)),
      manageSection: (id, section) => mapOrKeep(vehicles.manageSection(id, section)),
      edit: (id) => mapOrKeep(vehicles.edit(id)),
    },
    isManage,
  };
}

interface SupportStatus {
  readonly contextId: string;
  readonly query: UseQueryResult<SupportContext>;
}

const SupportStatusContext = createContext<SupportStatus | null>(null);

/** Trạng thái tải phiên — `SupportDataScope` đọc để dựng màn đang mở / đã kết thúc. */
export function useSupportStatus(): SupportStatus | null {
  return useContext(SupportStatusContext);
}

/**
 * RANH GIỚI của một phiên hỗ trợ — đặt ở cấp `AppShell`, bọc CẢ khung (menu, breadcrumb, menu dưới
 * đáy) chứ không chỉ nội dung trang: menu của phiên là menu của GIAN HÀNG, nên nó phải thấy phiên.
 *
 * Phiên chỉ "sống" khi đọc được và lần đọc GẦN NHẤT không lỗi — TanStack giữ `data` cũ khi một lần
 * đọc lại thất bại, và giữ nó ở đây nghĩa là tiếp tục hiện dữ liệu của một phiên đã hết hạn. Tới
 * mốc `expiresAt` thì tự đọc lại, để phiên kết thúc ngay cả khi không ai bấm gì.
 *
 * Nơi dùng BẮT BUỘC đặt `key={contextId}` để đổi phiên là mount lại.
 */
export function SupportSessionBoundary({
  contextId,
  children,
}: {
  contextId: string;
  children: ReactNode;
}) {
  const outer = useQueryClient();
  const query = useSupportContext(contextId);
  const data = query.isError ? undefined : query.data;

  /*
   * Đăng ký id phiên khi cây phiên đã COMMIT — không lúc render: một lượt điều hướng bị ngắt trước
   * commit không chạy cleanup, và một đăng ký mồ côi sẽ gắn header phiên vào mọi request sau đó của
   * tab. Layout effect của ranh giới chạy TRƯỚC mọi passive effect của cây con (nơi query bắt đầu
   * fetch), nên request đầu tiên của cây phiên vẫn có header dù thanh địa chỉ còn là trang cũ.
   *
   * Rời phiên (thoát, đổi phiên, đóng trang): gỡ đăng ký và vứt bản ghi phiên trong cache chính.
   * StrictMode (mount → dọn → mount) đăng ký lại ở lần mount thứ hai.
   */
  useLayoutEffect(() => {
    registerActiveSupportContext(contextId);
    return () => {
      releaseActiveSupportContext(contextId);
      outer.removeQueries({ queryKey: queryKeys.tenantSupport.context(contextId) });
    };
  }, [contextId, outer]);

  const expiresAt = data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const refresh = () =>
      void outer.invalidateQueries({ queryKey: queryKeys.tenantSupport.context(contextId) });
    const ms = Date.parse(expiresAt) - Date.now();
    // setTimeout tràn số khi quá ~24,8 ngày — phiên có hạn cứng 2 giờ nên không tới đó.
    const timer = setTimeout(refresh, Math.max(0, ms) + 1_000);
    return () => clearTimeout(timer);
  }, [contextId, expiresAt, outer]);

  const session = useMemo(() => (data ? supportSessionOf(data) : null), [data]);
  const workspace = useMemo(() => (data ? supportWorkspaceValue(data) : null), [data]);
  const status = useMemo(() => ({ contextId, query }), [contextId, query]);

  return (
    <SupportStatusContext.Provider value={status}>
      {session && workspace ? (
        <SupportSessionScope session={session}>
          <WorkspaceScope value={workspace}>{children}</WorkspaceScope>
        </SupportSessionScope>
      ) : (
        children
      )}
    </SupportStatusContext.Provider>
  );
}

/**
 * Phạm vi DỮ LIỆU của phiên — đặt ở layout của route phiên, bọc nội dung trang: băng cảnh báo +
 * cache riêng. Phiên chưa đọc xong / đã kết thúc / không hợp lệ thì KHÔNG dựng trang nào — dữ liệu
 * gian hàng đã đọc (nằm trong cache riêng) không còn chỗ nào để hiện.
 *
 * Nơi dùng BẮT BUỘC đặt `key={contextId}` để đổi phiên là đổi hẳn cache.
 */
export function SupportDataScope({ children }: { children: ReactNode }) {
  const t = useTranslations('TenantSupport.session');
  const outer = useQueryClient();
  const status = useSupportStatus();
  const session = useSupportSession();
  const contextId = status?.contextId ?? '';
  const [client] = useState(() =>
    createSupportQueryClient(() => {
      void outer.invalidateQueries({ queryKey: queryKeys.tenantSupport.context(contextId) });
    }),
  );
  // Rời phiên là vứt dữ liệu gian hàng đã đọc — không giữ lại.
  useEffect(() => () => client.clear(), [client]);

  if (!status || (status.query.isLoading && !session)) {
    return <LoadingState variant="page" label={t('loading')} />;
  }

  if (!session) {
    const code = getErrorCode(status.query.error);
    const kind =
      code === API_ERROR_CODE.SUPPORT_CONTEXT_EXPIRED
        ? 'expired'
        : code === API_ERROR_CODE.SUPPORT_CONTEXT_INVALID
          ? 'invalid'
          : 'error';
    return (
      <EmptyState
        variant="error"
        title={t(`${kind}.title`)}
        description={t(`${kind}.body`)}
        onRetry={kind === 'error' ? () => void status.query.refetch() : undefined}
        action={
          <Link href={ROUTES.MANAGE.ADMIN_TENANTS}>
            <Button type="primary">{t('backToTenants')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <SupportBanner context={session.context} />
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </>
  );
}
