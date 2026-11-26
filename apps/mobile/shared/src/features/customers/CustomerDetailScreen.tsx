import { useCallback, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_SOURCE,
  blocksNewRentals,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { customerStatusOf, isZeroMoney } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { useHideTabBar } from '@/components/layout/tab-bar-visibility';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { pillToneOfStatusColor } from '@/components/ui/Pill';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { Screen } from '@/components/layout/Screen';
import { Callout } from '@/components/ui/Callout';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ActionSheetButtons } from '@/components/ui/ActionSheetButtons';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import type { IconName } from '@/components/ui/Chip';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Ionicons } from '@/components/icons/Ionicons';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import { CustomerBookingHistory } from './components/CustomerBookingHistory';
import { CustomerDocumentsPanel } from './components/CustomerDocumentsPanel';
import { CustomerDetailSkeleton } from './components/CustomerDetailSkeleton';
import { CustomerHeroCard, type HeroStat } from './components/CustomerHeroCard';
import { CustomerRevenueCard } from './components/CustomerRevenueCard';
import { CustomerOverviewBlocks } from './components/CustomerOverviewBlocks';
import { CustomerFormSheet } from './components/CustomerFormSheet';
import { CustomerNotesPreview } from './components/CustomerNotesPreview';
import { CustomerRiskSheet } from './components/CustomerRiskSheet';
import {
  useCustomer,
  useCustomerDetailRefresh,
  useSetCustomerArchived,
} from './hooks/use-customers';
import type { TenantCustomerDetail } from './api';

/**
 * Bốn khu của hồ sơ, đúng bốn tab của web (02/11/2026). Mã là khoá `Customers.tabs.*`, không phải
 * chữ. Tab "Ghi chú" cũ đã thành thẻ "Ghi chú vận hành" trong Tổng quan (ledger §3.4 #5).
 *
 * Khu `history` và `finance` chỉ có mặt khi đủ quyền — cùng luật web dùng để dựng mảng `items`
 * của `<Tabs>`.
 */
const SECTION = {
  OVERVIEW: 'overview',
  HISTORY: 'history',
  FINANCE: 'finance',
  DOCUMENTS: 'documents',
} as const;

type Section = (typeof SECTION)[keyof typeof SECTION];

/**
 * Hồ sơ khách (CUS-02 + CUS-03) — route THẬT `/manage/customers/[id]`, deep-link được.
 *
 * Vì sao là route chứ không phải tấm trượt: một hồ sơ khách được gửi cho nhau ("xem giúp anh
 * khách này"), mở lại nhiều lần trong ngày, và thông báo đẩy phải tới thẳng nó. Cùng lý do với
 * chi tiết đơn thuê.
 *
 * Bố cục theo Figma Partner-XePrime "Users / Details" (`24486:59789`, người dùng 25/11/2026): thanh
 * trên "Chi tiết khách hàng" (← · Sửa · ⋮), khối danh tính + Gọi/Zalo + bốn ô số liệu + dải tab
 * (`CustomerHeroCard`, dùng chung cho cả bốn tab), rồi nội dung khu đang chọn. Cảnh báo lưu trữ /
 * rủi ro Figma không vẽ nhưng là trạng thái nghiệp vụ nên vẫn nằm ngay dưới khối đầu.
 *
 * Các chỉ số, dòng hồ sơ (địa chỉ, tài khoản, ngày vào sổ, nhãn…) mà Figma không vẽ đã bỏ khỏi màn
 * theo quyết định của người dùng; email được đưa lên khối danh tính cạnh SĐT.
 *
 * Ba khối tiền BIẾN MẤT hoàn toàn khi thiếu `finance.view` — không render số 0 giả.
 */
export function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = id ?? '';

  const t = useTranslations('Customers');
  const tApp = useTranslations('Customers.app.detail');
  const router = useRouter();
  const permissions = usePermissions();

  const back = () => goBackOr(router, ROUTES.manage.customers());

  const canView = permissions.has(PERMISSION.CUSTOMER_VIEW);

  const { data, isLoading, isError, error, refetch } = useCustomer(canView ? customerId : null);

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <AppHeader title={t('page.title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('permission.title')}
            description={t('permission.description')}
          />
        </Screen>
      </>
    );
  }

  if (isLoading || permissions.isLoading) {
    return (
      <>
        <AppHeader title={tApp('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} padded={false}>
          <CustomerDetailSkeleton />
        </Screen>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <AppHeader title={tApp('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={error}
            title={t('detail.errorTitle')}
            onRetry={() => void refetch()}
          />
        </Screen>
      </>
    );
  }

  return <CustomerProfile customer={data} onBack={back} />;
}

function CustomerProfile({
  customer,
  onBack,
}: {
  customer: TenantCustomerDetail;
  onBack: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Customers');
  const tApp = useTranslations('Customers.app.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  useHideTabBar();

  const canManage = permissions.has(PERMISSION.CUSTOMER_MANAGE);
  const canManageRisk = permissions.has(PERMISSION.CUSTOMER_MANAGE_RISK);
  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const canViewBookings = permissions.has(PERMISSION.BOOKING_VIEW);
  const canCreateBooking = permissions.has(PERMISSION.BOOKING_CREATE);
  const canManageDocuments = permissions.has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE);
  const canViewDocumentFiles = permissions.has(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW);

  const setArchived = useSetCustomerArchived();
  // Kéo xuống làm mới cả năm khu + hai khối tiền của khách này — xem hook.
  const refresh = useCustomerDetailRefresh(customer.id);

  const [section, setSection] = useState<Section>(SECTION.OVERVIEW);
  const [editing, setEditing] = useState(false);
  const [changingRisk, setChangingRisk] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const archived = Boolean(customer.archivedAt);
  const status = customerStatusOf(customer, canViewFinance);
  const statusLabel =
    status.key === 'unclassified'
      ? t('card.unclassified')
      : domainLabel('tenantCustomerRelationship', status.key);
  const riskLevel = customer.riskLevel as TenantCustomerRiskLevel;
  const blocked = blocksNewRentals(customer.riskLevel);
  const watchlist = riskLevel === TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST;

  /** Khu nào có mặt — quyền quyết định, y như mảng `items` của `<Tabs>` bên web. */
  const sections = useMemo<readonly { key: Section; label: string }[]>(() => {
    const list: { key: Section; label: string }[] = [
      { key: SECTION.OVERVIEW, label: tApp('tabs.overview') },
    ];
    if (canViewBookings) list.push({ key: SECTION.HISTORY, label: tApp('tabs.history') });
    if (canViewFinance) list.push({ key: SECTION.FINANCE, label: tApp('tabs.finance') });
    list.push({ key: SECTION.DOCUMENTS, label: tApp('tabs.documents') });
    return list;
  }, [tApp, canViewBookings, canViewFinance]);

  const activeSection = sections.some((entry) => entry.key === section)
    ? section
    : SECTION.OVERVIEW;

  const toggleArchived = useCallback(() => {
    setArchived.mutate(
      { id: customer.id, archived: !archived },
      {
        onSuccess: () =>
          toast.showSuccess(archived ? t('actions.restored') : t('actions.archived')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  }, [setArchived, customer.id, archived, toast, t, errorMessage]);

  const copy = useCallback(
    async (value: string) => {
      await Clipboard.setStringAsync(value);
      toast.showSuccess(t('detail.copied'));
    },
    [toast, t],
  );

  /**
   * Tạo đơn thuê: điều hướng sang LUỒNG ĐƠN ĐÃ CÓ, mang theo tên + SĐT để nhân viên không phải
   * gõ lại. KHÔNG dựng form tạo đơn thứ hai — hai bộ luật giá/lịch sẽ trôi khỏi nhau.
   *
   * Khách bị từ chối phục vụ hoặc hồ sơ đã lưu trữ thì nút TẮT; backend cũng chặn (`resolveWithinTx`
   * ném 409 `CUSTOMER_BLOCKED`), nên ẩn/tắt ở đây chỉ là chỉ dẫn, không phải lớp bảo vệ.
   */
  const createBooking = useCallback(() => {
    navigateOnce(
      ROUTES.manage.bookingCreate({
        customerName: customer.fullName,
        customerPhone: customer.phone,
      }),
    );
  }, [navigateOnce, customer.fullName, customer.phone]);

  /**
   * Hành động của hồ sơ - nút Sửa (bút chì) đứng ngoài thanh trên (Figma Header MB) nên KHÔNG lặp lại
   * trong tấm "Thao tác"; "Tạo đơn thuê", rủi ro và lưu trữ nằm trong tấm mở từ ⋮. Quyền và điều
   * kiện bật/tắt KHÔNG đổi: vẫn đúng bộ điều kiện của web, backend vẫn là lớp chặn thật
   * (`resolveWithinTx` ném 409 `CUSTOMER_BLOCKED`). "Tạo đơn thuê" đứng ĐẦU vì là hành động chính.
   */
  const actionPills = useMemo<ActionPillSpec[]>(() => {
    const list: ActionPillSpec[] = [];

    // Không có "Sửa hồ sơ" ở đây: nút bút chì ngoài thanh trên đã lo (Figma Header MB, người dùng 25/11/2026).
    if (canCreateBooking) {
      list.push({
        key: 'createBooking',
        icon: 'add-circle-outline',
        lineIcon: 'add',
        label: t('actions.createBooking'),
        primary: true,
        tone: colors.primaryActive,
        surface: colors.primaryLight,
        disabled: blocked || archived,
        onPress: createBooking,
      });
    }
    if (canManageRisk) {
      list.push({
        key: 'risk',
        icon: 'shield-checkmark-outline',
        lineIcon: 'tag',
        // Figma ghi "Phân loại" cho thao tác đổi mức rủi ro (người dùng 25/11/2026).
        label: tApp('actionClassify'),
        tone: blocked ? colors.danger : colors.info,
        surface: blocked ? colors.dangerSurface : colors.infoSurface,
        onPress: () => setChangingRisk(true),
      });
    }
    if (canManage) {
      list.push({
        key: 'archive',
        icon: archived ? 'arrow-undo-outline' : 'archive-outline',
        lineIcon: archived ? 'rotate-right' : 'download',
        label: archived ? t('actions.restore') : t('actions.archive'),
        tone: colors.textMuted,
        surface: colors.surfaceMuted,
        // Figma: "Lưu trữ" viền + chữ + icon ĐỎ, rộng 163; "Khôi phục" là việc lành nên giữ nút phụ thường.
        danger: !archived,
        width: archived ? undefined : 163,
        disabled: setArchived.isPending,
        onPress: toggleArchived,
      });
    }

    return list;
  }, [
    colors,
    t,
    canManage,
    canCreateBooking,
    canManageRisk,
    archived,
    blocked,
    createBooking,
    toggleArchived,
    setArchived.isPending,
  ]);

  /**
   * Bốn ô số liệu của Figma (Hoàn tất · Đang chạy · Doanh thu · Còn nợ). Hai ô tiền BIẾN MẤT khi
   * thiếu `finance.view`: `null` do thiếu quyền khác hẳn "0 ₫", và một số 0 giả sẽ được đọc như sự
   * thật. Số tiền rút gọn theo MỘT kiểu chung (`fmt.moneyCompact`: `5,004tr`, `1,62tr`, `20k`) - không mất tiền tới 1.000đ.
   */
  const heroStats = useMemo<HeroStat[]>(() => {
    const owing = customer.debtAmount != null && !isZeroMoney(customer.debtAmount);
    return [
      {
        key: 'completed',
        value: fmt.count(customer.completedRentalCount),
        label: tApp('stats.completed'),
      },
      {
        key: 'active',
        value: fmt.count(customer.activeBookingCount),
        label: tApp('stats.active'),
        tone: colors.infoStrong,
      },
      ...(canViewFinance
        ? [
            {
              key: 'revenue',
              value: fmt.moneyCompact(customer.totalBookingAmount),
              label: tApp('stats.revenue'),
            },
            {
              key: 'debt',
              value: fmt.moneyCompact(customer.debtAmount),
              label: tApp('stats.debt'),
              ...(owing ? { tone: colors.danger } : {}),
            },
          ]
        : []),
    ];
  }, [customer, canViewFinance, fmt, tApp, colors]);

  const sourceLabels: Readonly<Record<string, string>> = {
    [TENANT_CUSTOMER_SOURCE.MANUAL]: tApp('source.manual'),
    [TENANT_CUSTOMER_SOURCE.BOOKING]: tApp('source.booking'),
    [TENANT_CUSTOMER_SOURCE.MARKETPLACE]: tApp('source.marketplace'),
  };
  const sourceLabel =
    sourceLabels[customer.source] ?? domainLabel('tenantCustomerSource', customer.source);

  return (
    <>
      {/* Figma Header MB: ← "Chi tiết khách hàng" · nút Sửa · nút ⋮ (mở tấm "Thao tác"). */}
      <ManagePageHeader
        title={tApp('title')}
        onBack={onBack}
        {...(actionPills.length > 0
          ? {
              actions: (
                <>
                  {canManage ? (
                    <IconSquareButton
                      label={t('actions.edit')}
                      disabled={archived}
                      onPress={() => setEditing(true)}
                    >
                      <LineIcon name="edit" size={iconSize.lg} color={colors.textMuted} />
                    </IconSquareButton>
                  ) : null}
                  <IconSquareButton label={t('actions.more')} onPress={() => setMoreOpen(true)}>
                    <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
                  </IconSquareButton>
                </>
              ),
            }
          : {})}
      />

      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      >
        <CustomerHeroCard
          fullName={customer.fullName}
          avatarUrl={customer.avatarUrl ?? null}
          statusLabel={statusLabel}
          statusTone={pillToneOfStatusColor(status.color)}
          phone={customer.phone}
          email={customer.email}
          sourceLabel={sourceLabel}
          stats={heroStats}
          onCopy={(value) => void copy(value)}
          tabs={
            /* Tab chuyển PHẦN của hồ sơ ⇒ gạch chân, chia đều bề ngang (Figma "Horizontal tabs"). */
            <UnderlineTabs
              stretch
              items={sections.map((entry) => ({ key: entry.key, label: entry.label }))}
              value={activeSection}
              onChange={setSection}
            />
          }
        />

        <YStack p={space.lg} gap={space.lg}>
          {blocked && canCreateBooking ? (
            <XStack ai="flex-start" gap={space.xs}>
              <Ionicons name="ban-outline" size={iconSize.sm} color={colors.danger} />
              <Text f={1} col={colors.textMuted} fos={fontSize.label}>
                {t('actions.createBookingBlocked')}
              </Text>
            </XStack>
          ) : null}

          {archived ? (
            <Callout tone="info" title={t('detail.archivedBannerTitle')}>
              {t('detail.archivedBannerBody')}
            </Callout>
          ) : null}

          {blocked || watchlist ? (
            <Callout
              tone={blocked ? 'danger' : 'warning'}
              title={blocked ? t('detail.blockedBannerTitle') : t('detail.watchlistBannerTitle')}
            >
              <YStack gap={space.xs}>
                {customer.riskReason ? (
                  <Text col={colors.text} fos={fontSize.bodySm}>
                    {customer.riskReason}
                  </Text>
                ) : null}
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {blocked ? t('detail.blockedBannerBody') : t('detail.watchlistBannerBody')}
                </Text>
              </YStack>
            </Callout>
          ) : null}

          {activeSection === SECTION.OVERVIEW ? (
            <YStack gap={space.lg}>
              {/* Công nợ cũ nhất + chuyến hiện tại (web `CustomerOverviewTab`). */}
              <CustomerOverviewBlocks
                customer={customer}
                canViewBookings={canViewBookings}
                canViewFinance={canViewFinance}
              />
              {/* "Ghi chú vận hành": ô xem trước + "Xem đầy đủ" mở tấm có đủ danh sách/thêm/xoá. */}
              <CustomerNotesPreview
                customerId={customer.id}
                canManage={canManage}
                disabled={archived}
              />
            </YStack>
          ) : null}

          {activeSection === SECTION.HISTORY && canViewBookings ? (
            <CustomerBookingHistory customerId={customer.id} canViewFinance={canViewFinance} />
          ) : null}

          {activeSection === SECTION.FINANCE && canViewFinance ? (
            /* Server đòi thêm bookings.view cho doanh thu theo kỳ; danh sách phiếu Figma không vẽ (xem CustomerRevenueCard). */
            canViewBookings ? <CustomerRevenueCard customerId={customer.id} /> : null
          ) : null}

          {activeSection === SECTION.DOCUMENTS ? (
            <CustomerDocumentsPanel
              customerId={customer.id}
              canManage={canManageDocuments}
              canViewFiles={canViewDocumentFiles}
              disabled={archived}
            />
          ) : null}
        </YStack>
      </Screen>

      {/*
        Danh sách hành động: nút CÓ CHỮ xếp dọc trong tấm trượt, vì tấm trượt có cả bề ngang màn
        hình. `onPress` bọc thêm một lớp đóng tấm trượt — bản thân hành động không biết nó đang
        được gọi từ đâu, và không nên biết.
      */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={tApp('actionsTitle')} chrome="v2" headerDivider>
        <YStack gap={space.sm}>
          {/* Figma "Thao tác" `24273:89851`: nút phụ viền hai cột, "Tạo đơn thuê" vàng trải hàng (20/11/2026). */}
          <ActionSheetButtons
            actions={actionPills.map(({ key, label, lineIcon, primary, disabled, danger, width, onPress }) => ({
              key,
              label,
              icon: lineIcon,
              primary: primary ?? false,
              danger: danger ?? false,
              ...(width ? { width } : {}),
              disabled: disabled ?? false,
              onPress: () => {
                setMoreOpen(false);
                onPress();
              },
            }))}
          />
          {blocked && canCreateBooking ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('actions.createBookingBlocked')}
            </Text>
          ) : null}
        </YStack>
      </BottomSheet>

      <CustomerFormSheet
        open={editing}
        customer={customer}
        onClose={() => setEditing(false)}
      />
      <CustomerRiskSheet
        open={changingRisk}
        customer={customer}
        onClose={() => setChangingRisk(false)}
      />
    </>
  );
}

/** Một hành động trong tấm "Thao tác". */
interface ActionPillSpec {
  /** Khoá React — KHÔNG truyền xuống component con, React nuốt mất thuộc tính tên này. */
  key: string;
  icon: IconName;
  label: string;
  /** Biểu tượng nét của Figma đứng trước chữ trong tấm "Thao tác". */
  lineIcon: LineIconName;
  /** Hành động CHÍNH của màn — nền gold đặc. Đúng MỘT mục được mang, nếu không thì không mục nào chính. */
  primary?: boolean;
  /** Màu hình, chữ và viền — bản ĐẬM của tông. Mục `primary` không dùng. */
  tone: string;
  /** Nền — bản NHẠT của đúng tông đó. Mục `primary` không dùng. */
  surface: string;
  disabled?: boolean;
  danger?: boolean;
  width?: number | undefined;
  onPress: () => void;
}
