import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STATUS_COLOR,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_META,
  blocksNewRentals,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Callout } from '@/components/ui/Callout';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { IconButton } from '@/components/ui/IconButton';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { CustomerBookingHistory } from './components/CustomerBookingHistory';
import { CustomerDocumentsPanel } from './components/CustomerDocumentsPanel';
import { CustomerFinancePanel } from './components/CustomerFinancePanel';
import { CustomerFormSheet } from './components/CustomerFormSheet';
import { CustomerNotesPanel } from './components/CustomerNotesPanel';
import { CustomerRiskSheet } from './components/CustomerRiskSheet';
import {
  useCustomer,
  useCustomerDetailRefresh,
  useSetCustomerArchived,
} from './hooks/use-customers';
import type { TenantCustomerDetail } from './api';

/**
 * Năm khu của hồ sơ, đúng năm tab của web. Mã là khoá `Customers.tabs.*`, không phải chữ.
 *
 * Khu `history` và `finance` chỉ có mặt khi đủ quyền — cùng luật web dùng để dựng mảng `items`
 * của `<Tabs>`.
 */
const SECTION = {
  OVERVIEW: 'overview',
  HISTORY: 'history',
  FINANCE: 'finance',
  NOTES: 'notes',
  DOCUMENTS: 'documents',
} as const;

type Section = (typeof SECTION)[keyof typeof SECTION];

/** Ảnh đại diện của thẻ hồ sơ — cỡ `lg` của `EntityIdentity` bên web. */
const AVATAR_SIZE = 48;

/** Đường kính ô tròn dẫn đầu mỗi dòng hồ sơ — đủ chứa hình `iconSize.sm` và còn thở. */
const ROW_ICON_SIZE = 32;

/**
 * Hồ sơ khách (CUS-02 + CUS-03) — route THẬT `/manage/customers/[id]`, deep-link được.
 *
 * Vì sao là route chứ không phải tấm trượt: một hồ sơ khách được gửi cho nhau ("xem giúp anh
 * khách này"), mở lại nhiều lần trong ngày, và thông báo đẩy phải tới thẳng nó. Cùng lý do với
 * chi tiết đơn thuê.
 *
 * Năm tab của web thành một dải tab CUỘN NGANG: năm nhãn tiếng Việt không vừa 390dp, và bóp
 * chúng lại thì "Ghi chú nội bộ" bị cắt thành "Ghi ch…". Nội dung, quyền và thứ tự giữ nguyên.
 *
 * **Thứ tự khối bám ĐÚNG `CustomerDetailView` bên web ở khổ hẹp** — đây là thứ tự người dùng
 * đã quen từ trình duyệt, đổi đi là hai sản phẩm dạy hai thói quen khác nhau:
 *
 *  1. tên + dòng liên hệ (thanh trên) → 2. nhãn rủi ro/lưu trữ → 3. cảnh báo lưu trữ →
 *  4. cảnh báo rủi ro → 5. dải số liệu → 6. dải tab → 7. nội dung khu đang chọn.
 *
 * Thẻ hồ sơ (liên hệ + tài khoản + ngày vào sổ) nằm TRONG khu "Tổng quan", trên "Hoạt động gần
 * đây" — đúng chỗ web đặt nó khi không đủ bề ngang cho cột phụ.
 *
 * Ba khối tiền BIẾN MẤT hoàn toàn khi thiếu `finance.view` — không render số 0 giả.
 */
export function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = id ?? '';

  const t = useTranslations('Customers');
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
        <AppHeader title={t('detail.title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <ProfileSkeleton />
        </Screen>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <AppHeader title={t('detail.title')} onBack={back} />
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
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

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
  const riskLevel = customer.riskLevel as TenantCustomerRiskLevel;
  const blocked = blocksNewRentals(customer.riskLevel);
  const watchlist = riskLevel === TENANT_CUSTOMER_RISK_LEVEL.WATCHLIST;

  /** Khu nào có mặt — quyền quyết định, y như mảng `items` của `<Tabs>` bên web. */
  const sections = useMemo<readonly { key: Section; label: string }[]>(() => {
    const list: { key: Section; label: string }[] = [
      { key: SECTION.OVERVIEW, label: t('tabs.overview') },
    ];
    if (canViewBookings) list.push({ key: SECTION.HISTORY, label: t('tabs.history') });
    if (canViewFinance) list.push({ key: SECTION.FINANCE, label: t('tabs.finance') });
    list.push({ key: SECTION.NOTES, label: t('tabs.notes') });
    list.push({ key: SECTION.DOCUMENTS, label: t('tabs.documents') });
    return list;
  }, [t, canViewBookings, canViewFinance]);

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

  async function copy(value: string) {
    await Clipboard.setStringAsync(value);
    toast.showSuccess(t('detail.copied'));
  }

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
   * Năm hành động của web, HIỆN RA thành một hàng viên — không giấu sau nút "…".
   *
   * Bản trước dồn cả năm vào một tấm trượt mở từ dấu ba chấm. Đúng quy ước native, nhưng ở màn
   * này nó sai vai: web bày cả năm nút ngay dưới tiêu đề, và "Tạo đơn thuê" là hành động CHÍNH
   * của cả hồ sơ khách — thứ người trực bấm mỗi ngày. Giấu hành động chính sau một dấu ba chấm
   * là bắt người ta học thêm một bước cho việc họ tới đây để làm.
   *
   * "Tạo đơn thuê" đứng ĐẦU hàng chứ không giữ vị trí thứ hai như web: hàng này cuộn ngang, nên
   * thứ nằm ngoài mép phải là thứ không ai nhìn thấy — mà đây là hành động người trực bấm mỗi
   * ngày. Web bày cả năm nút cùng lúc nên thứ tự DOM ở đó không quyết định cái gì nhìn thấy được.
   *
   * Danh sách này nuôi CẢ HAI bề mặt — hàng viên nút trong thân trang và tấm trượt mở từ nút "…"
   * trên thanh đầu — nên chúng không thể lệch nhau: thêm một hành động là cả hai chỗ cùng có, đổi
   * điều kiện tắt là cả hai chỗ cùng tắt. Đó là điều kiện để có hai lối vào mà không sinh nợ.
   *
   * Vì sao vẫn giữ nút "…" dù mọi hành động đã hiện ra: hàng viên nút CUỘN MẤT khi người dùng kéo
   * xuống tab Giấy tờ, còn thanh đầu thì đứng yên. Hàng viên lo phần "thấy được ngay khi mở màn",
   * nút "…" lo phần "với tới được ở bất cứ đâu" — hai vai khác nhau, không phải hai bản sao.
   *
   * Bản trước bỏ hẳn nút "…": hai lối vào cho cùng một việc thì trình đọc màn hình
   * nghe hai lần, và ngón tay có hai đích cho cùng một đích đến — đúng thứ `DetailArrow` đã ghi
   * lại là không nên làm.
   *
   * Quyền và điều kiện bật/tắt KHÔNG đổi: vẫn đúng bộ điều kiện của web, và backend vẫn là lớp
   * chặn thật (`resolveWithinTx` ném 409 `CUSTOMER_BLOCKED`).
   */
  const actionPills = useMemo<ActionPillSpec[]>(() => {
    const list: ActionPillSpec[] = [];

    if (canCreateBooking) {
      list.push({
        key: 'createBooking',
        icon: 'add-circle-outline',
        label: t('actions.createBooking'),
        primary: true,
        tone: colors.primaryActive,
        surface: colors.primaryLight,
        disabled: blocked || archived,
        onPress: createBooking,
      });
    }
    if (canManage) {
      list.push({
        key: 'edit',
        icon: 'create-outline',
        label: t('actions.edit'),
        tone: colors.info,
        surface: colors.infoSurface,
        disabled: archived,
        onPress: () => setEditing(true),
      });
    }
    if (canManage) {
      list.push({
        key: 'addNote',
        icon: 'document-text-outline',
        label: t('actions.addNote'),
        tone: colors.warning,
        surface: colors.warningSurface,
        onPress: () => setSection(SECTION.NOTES),
      });
    }
    if (canManageRisk) {
      list.push({
        key: 'risk',
        icon: 'shield-checkmark-outline',
        label: t('actions.risk'),
        tone: blocked ? colors.danger : colors.info,
        surface: blocked ? colors.dangerSurface : colors.infoSurface,
        onPress: () => setChangingRisk(true),
      });
    }
    if (canManage) {
      list.push({
        key: 'archive',
        icon: archived ? 'arrow-undo-outline' : 'archive-outline',
        label: archived ? t('actions.restore') : t('actions.archive'),
        tone: colors.textMuted,
        surface: colors.surfaceMuted,
        disabled: setArchived.isPending,
        onPress: toggleArchived,
      });
    }

    return list;
  }, [
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
   * Dòng liên hệ dưới tên ở thanh trên — đúng vai `subtitle` của `ManagePageHeader` bên web.
   *
   * Email đi sau dấu `·` và chỉ khi có, y hệt `contactLine` của web. Thanh trên cắt còn một
   * dòng; bản đầy đủ (gọi được, chép được) nằm ở thẻ hồ sơ trong khu Tổng quan.
   */
  const contactLine = customer.email ? `${customer.phone} · ${customer.email}` : customer.phone;

  /**
   * Nhãn rủi ro (+ lưu trữ) đứng NGAY CẠNH TÊN trên thanh đầu — không phải một hàng riêng nằm
   * trong thân trang.
   *
   * Đây là thứ định tính chính con người đang mở, nên nó phải đọc được cùng lúc với cái tên, và
   * phải còn nhìn thấy sau khi người dùng đã cuộn xuống tận tab Giấy tờ. Một hàng nhãn nằm trong
   * thân trang thì cuộn một cái là mất — mà "khách này đang bị từ chối phục vụ" đúng là thứ
   * không được phép biến mất giữa lúc đang thao tác.
   *
   * Web đặt hai nhãn này ở `headerExtra`, cũng ngay dưới tiêu đề trang: cùng vai, cùng chỗ.
   *
   * `flexShrink={0}` ở đây và `flexShrink={1}` ở tiêu đề: khi hết chỗ thì CÁI TÊN cắt bớt, không
   * phải cái nhãn. Một cái tên cụt vẫn nhận ra được; "Từ chối phụ…" thì mất đúng phần nói ra hệ quả.
   */
  const headerBadge = (
    <XStack ai="center" gap={space.xs} flexShrink={0}>
      <StatusBadge
        label={domainLabel('tenantCustomerRiskLevel', riskLevel)}
        color={TENANT_CUSTOMER_RISK_LEVEL_META[riskLevel].color}
        size="sm"
      />
      {archived ? (
        <StatusBadge label={t('card.archived')} color={STATUS_COLOR.NEUTRAL} size="sm" />
      ) : null}
    </XStack>
  );

  /**
   * Bảy ô số liệu của web, ĐÚNG thứ tự đó, trong một bảng `StatGrid` hai cột.
   *
   * Biến thể `list` — MỘT chỉ số một hàng full width — chứ không phải lưới nhiều cột. Hai bản
   * trước đều vỡ vì cùng một lý do: nhãn ở đây là cụm từ tiếng Việt dài ("Không nhận xe / trả
   * muộn", "Đơn đang chạy / sắp tới") mà ô của lưới hai cột chỉ rộng ~130dp. Bản đầu
   * (`XStack flexWrap`) cho số ô mỗi hàng đổi theo độ dài nội dung nên cả dải mất mép thẳng; bản
   * sau (lưới hai cột) thì mép thẳng nhưng nhãn bị cắt bằng "…" — mà cắt tên một chỉ số là bỏ đi
   * đúng phần nói ra nó đếm cái gì.
   *
   * Hàng full width thì nhãn ĐẦY ĐỦ của web luôn vừa (không cần khoá `*Short` nào), và cả cột số
   * căn phải thẳng hàng. Đổi lại con số nhỏ hơn — đánh đổi đúng ở màn HỒ SƠ, nơi người dùng đọc
   * từng dòng chứ không liếc một cái như ở đầu sổ khách.
   *
   * Ba ô tiền BIẾN MẤT khi thiếu `finance.view`. `null` do thiếu quyền khác hẳn "0 ₫", và một số 0
   * giả sẽ được đọc như sự thật — backend trả `null` cho đúng lý do đó.
   *
   * Màu HÌNH phân loại con số (chuyến · đơn · tiền · cảnh báo); màu CHỮ SỐ chỉ bật khi con số
   * đang cần chú ý. Tô đỏ một khoản nợ bằng 0 là báo động giả.
   */
  const statCells = useMemo<StatCell[]>(() => {
    const owing = customer.debtAmount != null && !isZeroMoney(customer.debtAmount);
    const incidents = customer.noShowCount > 0 || customer.lateReturnCount > 0;

    return [
      {
        key: 'completed',
        icon: 'checkmark-done-outline',
        label: t('stats.completed'),
        value: fmt.count(customer.completedRentalCount),
        tone: colors.success,
        surface: colors.successSurface,
      },
      {
        key: 'active',
        icon: 'car-sport-outline',
        label: t('stats.active'),
        value: fmt.count(customer.activeBookingCount),
        tone: colors.info,
        surface: colors.infoSurface,
      },
      ...(canViewFinance
        ? ([
            {
              key: 'totalValue',
              icon: 'pricetags-outline',
              label: t('stats.totalValue'),
              value: fmt.money(customer.totalBookingAmount),
              tone: colors.primaryActive,
              surface: colors.primaryLight,
            },
            {
              key: 'paid',
              icon: 'wallet-outline',
              label: t('stats.paid'),
              value: fmt.money(customer.paidAmount),
              tone: colors.success,
              surface: colors.successSurface,
            },
            {
              key: 'debt',
              icon: owing ? 'alert-circle-outline' : 'checkmark-circle-outline',
              label: t('stats.debt'),
              value: fmt.money(customer.debtAmount),
              tone: owing ? colors.danger : colors.textMuted,
              surface: owing ? colors.dangerSurface : colors.surfaceMuted,
              ...(owing ? { valueTone: colors.danger } : {}),
            },
          ] satisfies StatCell[])
        : []),
      {
        key: 'noShowLate',
        icon: incidents ? 'warning-outline' : 'shield-checkmark-outline',
        label: t('stats.noShowLate'),
        value: `${fmt.count(customer.noShowCount)} / ${fmt.count(customer.lateReturnCount)}`,
        tone: incidents ? colors.danger : colors.textMuted,
        surface: incidents ? colors.dangerSurface : colors.surfaceMuted,
        ...(incidents ? { valueTone: colors.danger } : {}),
      },
      {
        key: 'lastRental',
        icon: 'calendar-outline',
        label: t('stats.lastRental'),
        value: customer.lastRentalAt ? fmt.date(customer.lastRentalAt) : '—',
        tone: colors.info,
        surface: colors.infoSurface,
      },
    ];
  }, [customer, canViewFinance, t, fmt]);

  /**
   * Thẻ hồ sơ — bản native của `profileCard` bên web, đặt ĐÚNG chỗ web đặt nó ở màn hẹp: TRONG
   * khu "Tổng quan", ngay TRÊN "Hoạt động gần đây".
   *
   * Web dựng thẻ này một lần rồi thả vào cột phụ ở desktop hoặc vào tab Tổng quan ở nơi hẹp
   * (`{isDesktop ? null : profileCard}`). App native luôn là "nơi hẹp", nên chỉ còn một chỗ.
   * Kéo nó lên đầu màn thì thứ tự đọc lệch hẳn web: cảnh báo rủi ro và dải số liệu bị đẩy xuống
   * dưới một khối liên hệ dài, trong khi câu hỏi đầu tiên khi mở hồ sơ là "khách này có vấn đề
   * gì không".
   *
   * Thứ tự các dòng bám đúng `<dl>` của web: SĐT → email → địa chỉ → tài khoản → vào sổ từ.
   *
   * Dải danh tính có nền vàng nhạt, và mỗi dòng có một ô tròn pha màu dẫn đầu: năm dòng chữ xám
   * giống hệt nhau thì phải ĐỌC nhãn mới biết dòng nào là số điện thoại. Màu ở đây phân loại dữ
   * liệu chứ không trang trí — cùng nguyên tắc với hình dẫn của `StatGrid`.
   */
  const profileCard = (
    <Card padded={false}>
      <XStack ai="center" gap={space.sm} bg={colors.primaryLight} p={space.md}>
        <Avatar name={customer.fullName} size={AVATAR_SIZE} />
        <YStack f={1} minWidth={0} gap={2}>
          <Text
            col={colors.text}
            fos={fontSize.body}
            fow={fontWeight.semibold}
            numberOfLines={2}
          >
            {customer.fullName}
          </Text>
          <Text col={colors.primaryActive} fos={fontSize.label} numberOfLines={1}>
            {domainLabel('tenantCustomerSource', customer.source)}
          </Text>
        </YStack>
      </XStack>

      <YStack p={space.md} gap={space.md}>
        {/* SĐT: gọi được VÀ chép được — ngoài quầy thì bấm gọi, ngồi máy thì dán sang Zalo. */}
        <ProfileRow
          icon="call-outline"
          tone={colors.success}
          surface={colors.successSurface}
          label={t('detail.phone')}
          value={customer.phone}
          actions={
            <>
              <IconButton
                icon="call"
                tone="success"
                label={t('detail.phone')}
                onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
              />
              <IconButton
                icon="copy-outline"
                tone="accent"
                label={t('detail.copyPhone')}
                onPress={() => void copy(customer.phone)}
              />
            </>
          }
        />
        {customer.email ? (
          <ProfileRow
            icon="mail-outline"
            tone={colors.info}
            surface={colors.infoSurface}
            label={t('detail.email')}
            value={customer.email}
            actions={
              <>
                <IconButton
                  icon="mail"
                  tone="info"
                  label={t('detail.email')}
                  onPress={() => void Linking.openURL(`mailto:${customer.email}`)}
                />
                <IconButton
                  icon="copy-outline"
                  tone="accent"
                  label={t('detail.copyEmail')}
                  onPress={() => void copy(customer.email as string)}
                />
              </>
            }
          />
        ) : null}
        {customer.address ? (
          <ProfileRow
            icon="location-outline"
            tone={colors.warning}
            surface={colors.warningSurface}
            label={t('detail.address')}
            value={customer.address}
            lines={3}
          />
        ) : null}
        <ProfileRow
          icon={customer.hasAccount ? 'shield-checkmark-outline' : 'person-outline'}
          tone={customer.hasAccount ? colors.info : colors.textMuted}
          surface={customer.hasAccount ? colors.infoSurface : colors.surfaceMuted}
          label={t('detail.account')}
          value={customer.hasAccount ? t('detail.accountLinked') : t('detail.accountNotLinked')}
          valueTone={customer.hasAccount ? colors.info : colors.textMuted}
        />
        <ProfileRow
          icon="calendar-outline"
          tone={colors.primaryActive}
          surface={colors.primaryLight}
          label={t('detail.createdAt')}
          value={fmt.date(customer.createdAt)}
        />
      </YStack>
    </Card>
  );

  return (
    <>
      <AppHeader
        title={customer.fullName}
        subtitle={contactLine}
        badge={headerBadge}
        onBack={onBack}
        {...(actionPills.length > 0
          ? {
              right: (
                <IconButton
                  icon="ellipsis-horizontal"
                  label={t('actions.more')}
                  onPress={() => setMoreOpen(true)}
                />
              ),
            }
          : {})}
      />

      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      >
        <YStack gap={space.lg}>
          {actionPills.length > 0 ? (
            <YStack gap={space.sm}>
              {/*
                Cuộn ngang, chữ MỘT dòng — không phải lưới ô chia đều.

                Ô chia đều thì bề rộng mỗi ô = bề rộng màn ÷ số hành động, mà số hành động phụ
                thuộc QUYỀN: người đủ năm quyền được ô rộng ~65dp và "Tạo đơn thuê" vỡ thành hai
                dòng, người có hai quyền lại được ô rộng gấp đôi. Viên pill thì bề rộng đi theo
                CHỮ, nên không cấu hình quyền nào làm vỡ được nó; thừa chỗ thì vuốt ngang.

                Cùng cơ chế với dải tab ngay bên dưới, nên không phải một thao tác mới cần học.
              */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.xs, paddingRight: layout.screenX }}
              >
                {actionPills.map(({ key, ...pill }) => (
                  <ActionPill key={key} {...pill} />
                ))}
              </ScrollView>

              {/*
                Vì sao "Tạo đơn thuê" đang tắt — nói ra ngay dưới chính cái viên bị tắt.

                Web treo câu này trong tooltip của nút; native không có hover, nên một nút xám
                không lời giải thích chỉ đọc ra là "app hỏng". Chỉ hiện khi người dùng THẬT SỰ có
                quyền tạo đơn — người không có quyền thì không có viên nào để mà thắc mắc.
              */}
              {blocked && canCreateBooking ? (
                <XStack ai="flex-start" gap={space.xs}>
                  <Ionicons name="ban-outline" size={iconSize.sm} color={colors.danger} />
                  <Text f={1} col={colors.textMuted} fos={fontSize.label}>
                    {t('actions.createBookingBlocked')}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          ) : null}

          {archived ? (
            <Callout tone="info" title={t('detail.archivedBannerTitle')}>
              {t('detail.archivedBannerBody')}
            </Callout>
          ) : null}

          {blocked || watchlist ? (
            <Callout
              tone={blocked ? 'danger' : 'warning'}
              title={
                blocked ? t('detail.blockedBannerTitle') : t('detail.watchlistBannerTitle')
              }
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

          {/* ── Dải số liệu ────────────────────────────────────────────────── */}
          <Card padded={false}>
            <StatGrid cells={statCells} variant="list" />
            {/*
              Cách tính công nợ — bản native của biểu tượng ⓘ có tooltip bên web.

              Nằm ở CHÂN bảng chứ không trong ô "Còn nợ": nhét một câu năm chục ký tự vào một ô
              rộng nửa thẻ thì ô đó cao gấp đôi ô bên cạnh và cả lưới lệch — đúng cái vừa sửa.
              Một dòng chân thẻ nói đủ câu đó mà không phá hàng nào.

              Chỉ hiện khi có `finance.view` — không có ô "Còn nợ" thì không có gì để giải thích.
            */}
            {canViewFinance ? (
              <XStack
                ai="flex-start"
                gap={space.xs}
                px={space.md}
                py={space.sm}
                borderTopWidth={1}
                borderTopColor={colors.borderSubtle}
                bg={colors.surfaceMuted}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={iconSize.sm}
                  color={colors.textMuted}
                />
                <Text f={1} col={colors.textMuted} fos={fontSize.label}>
                  {t('hints.debt')}
                </Text>
              </XStack>
            ) : null}
          </Card>

          {/* ── Dải tab cuộn ngang ─────────────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.xs, paddingRight: layout.screenX }}
          >
            {sections.map((entry) => {
              const active = entry.key === activeSection;
              return (
                <YStack
                  key={entry.key}
                  onPress={() => setSection(entry.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={entry.label}
                  px={space.md}
                  py={space.sm}
                  br={radius.pill}
                  bg={active ? colors.primaryLight : colors.surfaceMuted}
                  bw={1}
                  bc={active ? colors.primary : colors.borderSubtle}
                >
                  <Text
                    col={active ? colors.primaryActive : colors.text}
                    fos={fontSize.bodySm}
                    fow={active ? fontWeight.semibold : fontWeight.regular}
                    numberOfLines={1}
                  >
                    {entry.label}
                  </Text>
                </YStack>
              );
            })}
          </ScrollView>

          {activeSection === SECTION.OVERVIEW ? (
            <YStack gap={space.md}>
              {profileCard}
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="time-outline" size={iconSize.md} color={colors.primaryActive} />
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('overview.recentTitle')}
                </Text>
              </XStack>
              {/*
                Thiếu `bookings.view`: KHÔNG gọi endpoint lịch sử và KHÔNG hiện dữ liệu đơn —
                `recentBookings` của server cũng rỗng trong trường hợp đó. Nói ra vì sao phần này
                trống thay vì để một khoảng trắng khó hiểu.
              */}
              {canViewBookings ? (
                customer.recentBookings.length > 0 ? (
                  customer.recentBookings.map((booking) => (
                    <Card
                      key={booking.id}
                      onPress={() => navigateOnce(ROUTES.manage.bookingDetail(booking.id))}
                      accessibilityLabel={booking.code}
                    >
                      <XStack ai="center" gap={space.sm}>
                        {/*
                          Mã đơn thành một viên nhãn vàng: nó là ĐỊNH DANH, không phải một dòng
                          chữ trong câu. Ở dạng chữ trần nó dính vào tên xe ngay bên cạnh và cả
                          hàng đọc ra thành một chuỗi liền.
                        */}
                        <XStack bg={colors.primaryLight} br={radius.pill} px={space.sm} py={2}>
                          <Text
                            col={colors.primaryActive}
                            fos={fontSize.label}
                            fow={fontWeight.semibold}
                            numberOfLines={1}
                          >
                            {booking.code}
                          </Text>
                        </XStack>
                        <YStack f={1} minWidth={0} gap={2}>
                          <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
                            {booking.vehicleName}
                          </Text>
                          <XStack ai="center" gap={space.xs}>
                            <Ionicons
                              name="calendar-outline"
                              size={iconSize.xs}
                              color={colors.textMuted}
                            />
                            <Text
                              f={1}
                              minWidth={0}
                              col={colors.textMuted}
                              fos={fontSize.label}
                              numberOfLines={1}
                            >
                              {fmt.date(booking.pickupAt)}
                            </Text>
                          </XStack>
                        </YStack>
                        <DetailChevron />
                      </XStack>
                    </Card>
                  ))
                ) : (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('overview.recentEmpty')}
                  </Text>
                )
              ) : (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('overview.recentHidden')}
                </Text>
              )}
            </YStack>
          ) : null}

          {activeSection === SECTION.HISTORY && canViewBookings ? (
            <CustomerBookingHistory customerId={customer.id} canViewFinance={canViewFinance} />
          ) : null}

          {activeSection === SECTION.FINANCE && canViewFinance ? (
            <CustomerFinancePanel customerId={customer.id} />
          ) : null}

          {activeSection === SECTION.NOTES ? (
            <CustomerNotesPanel
              customerId={customer.id}
              canManage={canManage}
              disabled={archived}
            />
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
        Cùng danh sách hành động, bề mặt khác: ở đây là nút CÓ CHỮ xếp dọc, vì tấm trượt có cả bề
        ngang màn hình và không phải tiết kiệm chỗ như hàng viên cuộn ngang.

        `onPress` bọc thêm một lớp đóng tấm trượt — bản thân hành động không biết nó đang được gọi
        từ đâu, và không nên biết.
      */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('actions.more')}>
        <YStack gap={space.sm}>
          {actionPills.map(({ key, icon, label, primary, disabled, onPress }) => (
            <Button
              key={key}
              label={label}
              icon={icon}
              variant={primary ? 'primary' : 'secondary'}
              disabled={disabled ?? false}
              onPress={() => {
                setMoreOpen(false);
                onPress();
              }}
            />
          ))}
          {blocked && canCreateBooking ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('actions.createBookingBlocked')}
            </Text>
          ) : null}
          <Button label={tCommon('close')} variant="ghost" onPress={() => setMoreOpen(false)} />
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

/**
 * Một dòng của thẻ hồ sơ: ô tròn pha màu dẫn đầu, nhãn + giá trị ở giữa, hành động bên phải.
 *
 * Ô tròn KHÔNG phải trang trí — nó phân loại dòng. Năm dòng chữ xám giống hệt nhau thì phải đọc
 * nhãn mới biết dòng nào là số điện thoại; một vòng tròn xanh lá có hình ống nghe thì nhận ra
 * trước khi mắt kịp tới chữ. Cùng lý do `StatGrid` cho mỗi ô số một hình dẫn.
 *
 * Hình dẫn ở dạng `-outline`, nút hành động ở dạng ĐẶC (`call`, `mail`): cùng một biểu tượng hai
 * lần trên một hàng thì phải khác nét, nếu không cái bên trái đọc ra như một nút thứ hai.
 *
 * `flexShrink` phải khai TƯỜNG MINH ở cột giữa: trong React Native nó mặc định là 0, không phải
 * 1 như CSS, nên một địa chỉ dài giữ nguyên bề rộng tự nhiên và đẩy hai nút hành động tràn khỏi thẻ.
 */
function ProfileRow({
  icon,
  tone,
  surface,
  label,
  value,
  valueTone,
  lines = 1,
  actions,
}: {
  icon: IconName;
  /** Màu hình — bản ĐẬM của tông. */
  tone: string;
  /** Nền ô tròn — bản NHẠT của đúng tông đó. */
  surface: string;
  label: string;
  value: string;
  valueTone?: string;
  /** Số dòng tối đa của giá trị. Địa chỉ cần 3; số điện thoại và ngày thì 1 là đủ. */
  lines?: number;
  actions?: ReactNode;
}) {
  return (
    <XStack ai="center" gap={space.sm}>
      {/*
        Viền CÙNG màu với hình, không phải màu nền: ô nền nhạt đặt trên thẻ trắng gần như không
        có mép, nên nó nhoè vào thẻ thay vì đọc ra là một huy hiệu tròn.
      */}
      <YStack
        w={ROW_ICON_SIZE}
        h={ROW_ICON_SIZE}
        br={radius.pill}
        bg={surface}
        bw={1}
        bc={tone}
        ai="center"
        jc="center"
      >
        <Ionicons name={icon} size={iconSize.sm} color={tone} />
      </YStack>

      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {label}
        </Text>
        <Text
          flexShrink={1}
          col={valueTone ?? colors.text}
          fos={fontSize.bodySm}
          fow={fontWeight.medium}
          numberOfLines={lines}
        >
          {value}
        </Text>
      </YStack>

      {actions}
    </XStack>
  );
}

/** Một viên hành động trong hàng cuộn ngang. */
interface ActionPillSpec {
  /** Khoá React của viên — KHÔNG truyền xuống `ActionPill`, React nuốt mất thuộc tính tên này. */
  key: string;
  icon: IconName;
  label: string;
  /** Hành động CHÍNH của màn — nền gold đặc. Đúng MỘT viên được mang, nếu không thì không viên nào chính. */
  primary?: boolean;
  /** Màu hình, chữ và viền — bản ĐẬM của tông. Viên `primary` không dùng. */
  tone: string;
  /** Nền viên — bản NHẠT của đúng tông đó. Viên `primary` không dùng. */
  surface: string;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Một viên hành động: hình + chữ MỘT dòng, bề rộng đi theo CHỮ.
 *
 * Không có `numberOfLines` nào ở đây cắt được nhãn, vì viên không có bề rộng cố định để mà cắt —
 * đó là cả điểm của việc bỏ lưới ô chia đều. Hàng cha lo phần vuốt ngang khi tổng bề rộng vượt
 * bề ngang màn hình.
 *
 * `minHeight` bằng vùng chạm tối thiểu: đệm dọc `space.sm` chỉ cho ra ~34dp, nhỏ hơn ngón tay —
 * mà đây đúng là hàng nút chính của cả màn.
 */
function ActionPill({
  icon,
  label,
  primary = false,
  tone,
  surface,
  disabled = false,
  onPress,
}: Omit<ActionPillSpec, 'key'>) {
  const fg = disabled ? colors.textDisabled : primary ? colors.onPrimary : tone;
  const bg = disabled ? colors.surfaceMuted : primary ? colors.primary : surface;
  const border = disabled ? colors.border : primary ? colors.primary : tone;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => (pressed ? pillStyles.pressed : null)}
    >
      <XStack
        ai="center"
        gap={space.xs}
        px={space.md}
        minHeight={sizing.touchTarget}
        br={radius.pill}
        bg={bg}
        bw={1}
        bc={border}
      >
        <Ionicons name={icon} size={iconSize.sm} color={fg} />
        <Text col={fg} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

const pillStyles = StyleSheet.create({
  pressed: { opacity: 0.6 },
});
