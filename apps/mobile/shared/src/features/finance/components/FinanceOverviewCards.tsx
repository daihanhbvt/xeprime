import { useCallback, useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { RECEIPT_SOURCE_GROUP, RECEIPT_STATUS, RECEIPT_TYPE } from '@xeprime/types';
import { isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatCardFooter, StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import type { FinancePeriodFilters, FinanceSummary } from '../api';

/**
 * BA LỚP TIỀN của một kỳ, xếp thành ba khối tách rời — bản native của `FinanceOverviewCards`.
 *
 * Vì sao không phải một dải sáu ô: ba lớp trả lời ba câu hỏi khác nhau và mang ba đơn vị thời
 * gian khác nhau. "Lợi nhuận" là của MỘT KỲ; "Cọc đang giữ" là TẠI LÚC NÀY và không đổi khi
 * người dùng chọn kỳ khác. Xếp chúng cạnh nhau trong một dải là mời người đọc cộng trừ hai thứ
 * không cộng trừ được với nhau — và đó chính là cách sinh ra một con số sai mà không ai thấy sai.
 *
 * **Hình thức là DÒNG SỔ**, không phải lưới ô: mỗi chỉ số một dòng trọn bề ngang, nhãn bên
 * trái, số căn phải. Cả cột số thẳng một mép nên mắt dò dọc được — ở lưới hai cột, các con số
 * bắt đầu ở bốn vị trí khác nhau và không con nào so được với con nào. Lưới còn ép nhãn xuống
 * một dòng cụt và, với ba chỉ số, để lại một ô lẻ nở hết bề ngang ở hàng cuối.
 *
 * **Hai lớp đầu có hình dạng HAI VẾ + MỘT TỔNG**: doanh thu và chi phí là hai vế, lợi nhuận là
 * kết quả; tiền vào và tiền ra là hai vế, cân đối là kết quả. Cái tổng đi vào `total` của
 * `<StatGrid>` — một dòng dưới vạch đậm, không phải chỉ số thứ ba ngang hàng với hai thứ sinh
 * ra nó. Lớp thứ ba không có tổng vì cọc đang giữ và công nợ **không cộng được với nhau**.
 *
 * **Hai bậc chữ, màu theo CHIỀU TIỀN.** Cả ba thẻ chỉ có chữ SỐ (14) và chữ NHÃN (12) — không có
 * bậc riêng cho hàng tổng; thứ bậc do vạch kẻ và độ đậm làm, không do cỡ chữ.
 *
 * Màu đi thành cặp huy hiệu + con số: xanh cho tiền vào, đỏ cho tiền ra, và hai hàng TỔNG đổi màu
 * theo DẤU (xanh khi dương, đỏ khi âm) — đọc lướt là biết ngay kỳ này lãi hay lỗ mà không phải dò
 * dấu trừ. Hai ô ở lớp "tại thời điểm này" thì khác: cọc đang giữ là tiền GIỮ HỘ chứ không phải
 * tiền vào nên giữ mực đen, còn công nợ chỉ đỏ khi thực sự còn nợ — tô đỏ một số 0 là báo động giả.
 *
 * **Câu chú thích nằm TRONG thẻ**, dưới một vạch mảnh. Để nó trôi bên dưới như trước thì mỗi lớp
 * là ba mảnh rời (tiêu đề · thẻ · một đoạn chữ mờ), và ba lớp thành chín mảnh trên một màn cuộn.
 *
 * Mỗi ô có đích là một LỐI ĐI về đúng tập phiếu sinh ra nó. Đường dẫn mang `sourceGroup` +
 * `status=approved` để tổng ở sổ khớp từng đồng với con số trên ô; thiếu `sourceGroup`, bấm
 * "Doanh thu" sẽ mở ra một sổ có cộng cả tiền cọc. Hai hàng tổng KHÔNG dẫn đi đâu — chúng là
 * hiệu của hai vế, không có tập phiếu nào cộng ra chúng để mà mở.
 */
export function FinanceOverviewCards({
  data,
  filters,
  loading,
  error,
}: {
  data: FinanceSummary | undefined;
  filters: FinancePeriodFilters;
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations('Finance.overview.cards');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  if (error && !data) return <Callout tone="warning">{t('error')}</Callout>;
  if (!data) return <SkeletonText lines={8} />;

  const period = { from: filters.from, to: filters.to, status: RECEIPT_STATUS.APPROVED };
  const openLedger = (extra: Parameters<typeof ROUTES.manage.receipts>[0]) => () =>
    navigateOnce(ROUTES.manage.receipts({ ...period, ...extra }));

  const businessCells: StatCell[] = [
    {
      key: 'revenue',
      icon: 'trending-up-outline',
      label: t('business.revenue'),
      value: fmt.money(data.revenue),
      tone: colors.success,
      surface: colors.successSurface,
      valueTone: colors.success,
      onPress: openLedger({
        type: RECEIPT_TYPE.INCOME,
        sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
      }),
    },
    {
      key: 'cost',
      icon: 'trending-down-outline',
      label: t('business.cost'),
      value: fmt.money(data.cost),
      tone: colors.danger,
      surface: colors.dangerSurface,
      valueTone: colors.danger,
      ...(isZeroMoney(data.unassignedCost)
        ? {}
        : { hint: t('business.unassigned', { value: fmt.money(data.unassignedCost) }) }),
      onPress: openLedger({
        type: RECEIPT_TYPE.EXPENSE,
        sourceGroup: RECEIPT_SOURCE_GROUP.BUSINESS,
      }),
    },
  ];

  /*
   * Mực đen trên nền chìm trung tính, KHÔNG phải gold trên nền gold: thẻ này đã có gold ở vạch
   * dẫn và đường kẻ của `BlockTitle`, thêm một dải gold nữa thì gold xuất hiện ba lần trong một
   * khối cao 150dp và thôi còn là điểm nhấn. Hàng tổng đã tách khỏi hai ô trên bằng dải nền và
   * cách căn phải — nó không cần mượn thêm màu.
   *
   * Lỗ thì đổi đỏ. Đó là lần DUY NHẤT con số ở đây đổi màu, nên khi nó đỏ thì người đọc biết
   * ngay có chuyện.
   */
  const businessTotal: StatCell = {
    key: 'profit',
    icon: 'wallet-outline',
    label: t('business.profit'),
    value: fmt.money(data.profit),
    tone: colors.textMuted,
    valueTone: isNegativeMoney(data.profit) ? colors.danger : colors.success,
    /* `null` là "chưa có doanh thu để tính biên" — khác hẳn "biên 0%" (hoà vốn). */
    hint:
      data.profitMarginPercent == null
        ? t('business.marginUnknown')
        : t('business.margin', { value: data.profitMarginPercent }),
  };

  const cashCells: StatCell[] = [
    {
      key: 'in',
      icon: 'arrow-down-circle-outline',
      label: t('cash.in'),
      value: fmt.money(data.totalIncome),
      tone: colors.success,
      surface: colors.successSurface,
      valueTone: colors.success,
      // KHÔNG lọc nhóm nguồn — lớp này CỐ Ý gồm cả tiền cọc.
      onPress: openLedger({ type: RECEIPT_TYPE.INCOME }),
    },
    {
      key: 'out',
      icon: 'arrow-up-circle-outline',
      label: t('cash.out'),
      value: fmt.money(data.totalExpense),
      tone: colors.danger,
      surface: colors.dangerSurface,
      valueTone: colors.danger,
      onPress: openLedger({ type: RECEIPT_TYPE.EXPENSE }),
    },
  ];

  /* Cùng khuôn với "Lợi nhuận": nền chìm, mực đen, chỉ đổi đỏ khi âm. */
  const cashTotal: StatCell = {
    key: 'balance',
    icon: 'swap-vertical-outline',
    label: t('cash.balance'),
    value: fmt.money(data.balance),
    tone: colors.textMuted,
    valueTone: isNegativeMoney(data.balance) ? colors.danger : colors.success,
  };

  const nowCells: StatCell[] = [
    {
      key: 'depositHeld',
      icon: 'lock-closed-outline',
      label: t('now.depositHeld'),
      value: fmt.money(data.depositHeld),
      tone: colors.info,
      surface: colors.infoSurface,
      hint: t('now.bookings', { count: data.depositHeldBookings }),
      /* KHÔNG mang kỳ: cọc đang giữ là con số TẠI LÚC NÀY, không thuộc kỳ nào. */
      onPress: () =>
        navigateOnce(
          ROUTES.manage.receipts({
            status: RECEIPT_STATUS.APPROVED,
            sourceGroup: RECEIPT_SOURCE_GROUP.HELD_FUNDS,
          }),
        ),
    },
    {
      key: 'debt',
      icon: 'alert-circle-outline',
      label: t('now.debt'),
      value: fmt.money(data.totalDebt),
      tone: colors.warning,
      surface: colors.warningSurface,
      hint: t('now.bookings', { count: data.debtBookings }),
      ...(isZeroMoney(data.totalDebt) ? {} : { valueTone: colors.danger }),
      /* Công nợ dẫn sang màn Công nợ, KHÔNG phải sổ Thu-Chi — nó tính trên ĐƠN, không trên phiếu. */
      onPress: () => navigateOnce(ROUTES.manage.debts()),
    },
  ];

  return (
    <YStack gap={space.lg}>
      <Layer
        title={t('business.title')}
        cells={businessCells}
        total={businessTotal}
        note={t('business.note')}
        loading={loading}
      />
      <Layer
        title={t('cash.title')}
        cells={cashCells}
        total={cashTotal}
        note={t('cash.note')}
        loading={loading}
      />
      <Layer title={t('now.title')} cells={nowCells} note={t('now.note')} loading={loading} />
    </YStack>
  );
}

/**
 * Một lớp tiền: tiêu đề · bảng chỉ số (± hàng tổng) · câu chú thích.
 *
 * Câu chú thích KHÔNG bỏ đi được — nó là chỗ duy nhất nói ra "đã loại tiền cọc", "chưa trừ khấu
 * hao" và "hai số này không phụ thuộc kỳ". Thiếu nó thì ba lớp trông như ba cách nói cùng một
 * chuyện, và người đọc sẽ tự cộng chúng lại.
 */
function Layer({
  title,
  cells,
  total,
  note,
  loading,
}: {
  title: string;
  cells: readonly StatCell[];
  /** Vắng mặt = lớp này không có kết quả để tổng — xem chú thích của component chính. */
  total?: StatCell;
  note: string;
  loading: boolean;
}) {
  /*
   * Thu gọn từng lớp một, KHÔNG phải thu cả ba cùng lúc: ba lớp trả lời ba câu hỏi khác nhau, và
   * người mở màn buổi sáng thường chỉ theo dõi một trong ba. Gấp hai lớp kia lại là kéo biểu đồ
   * và hai dải xếp hạng lên gần đầu màn.
   *
   * Mặc định MỞ: một màn tổng quan mở ra toàn tiêu đề gấp lại thì không còn là tổng quan.
   */
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((current) => !current), []);

  return (
    <YStack gap={space.sm}>
      <BlockTitle collapsed={collapsed} onToggleCollapsed={toggle}>
        {title}
      </BlockTitle>
      {collapsed ? null : (
        <Card padded={false}>
          {/* Mờ đi khi đang tải, nhưng VIỀN thẻ giữ nguyên — mờ cả thẻ thì nhìn ra một thẻ hỏng. */}
          <YStack opacity={loading ? 0.6 : 1}>
            <StatGrid variant="list" cells={cells} {...(total ? { total } : {})} />
            <StatCardFooter>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {note}
              </Text>
            </StatCardFooter>
          </YStack>
        </Card>
      )}
    </YStack>
  );
}
