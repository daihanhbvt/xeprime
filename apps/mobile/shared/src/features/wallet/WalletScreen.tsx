import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { nowInAppTz } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { ScrollReveal } from '@/components/motion/ScrollReveal';
import { BANK_ACCOUNT_SCOPE } from '@/api/bank-accounts/api';
import { PayoutNotes } from '@/features/account-payments/components/PayoutNotes';
import { BankAccountList } from '@/features/bank-accounts/components/BankAccountList';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { WALLET_SCOPE, type WalletScope, type WalletStatementFilters } from '@/api/wallet/api';
import { WalletActivityPanel } from './components/WalletActivityPanel';
import {
  WalletMonthSummary,
  WalletStatementPanel,
  WalletStatsCard,
} from './components/WalletStatementPanel';
import { WalletSummaryCard } from './components/WalletSummaryCard';
import { WithdrawSheet } from './components/WithdrawSheet';
import { useWalletSummary } from './hooks/use-wallet';

/** Kỳ mặc định của bảng tổng hợp: tháng đang chạy, theo giờ Việt Nam - đúng như web. */
const STATEMENT_PERIOD_FORMAT = 'YYYY-MM';

/** `num/12` của Figma - khe/đệm của thẻ ví. */
const SPACE_12 = toPx(XP_TOKENS['space-12']);

/**
 * Ví điểm - bản native của `WalletView`. Dùng chung khu cá nhân và khu gian hàng, khác nhau đúng ở
 * `scope` (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * Ba khối theo đúng thứ tự câu hỏi: *tôi có bao nhiêu* → *tiền đang đi tới đâu* → *nó đến từ đâu*.
 * Sổ phân trang ở SERVER: một chủ xe chạy vài trăm chuyến một năm có sổ dài hàng nghìn dòng, và
 * cuộn vô hạn ở đây là bắt người ta cuộn mãi để tìm một dòng họ biết là nằm ở tháng nào.
 *
 * ADR 0033: đây là SỔ CÔNG NỢ XePrime phải trả, KHÔNG phải ví điện tử - không nạp, không chuyển
 * ngang, không thanh toán nội bộ. Ba thao tác duy nhất: xem, rút, huỷ lệnh rút.
 */
/**
 * VỎ của màn - tách khỏi `scope`. Khu quản lý của XePrime Partner có thanh quản lý (`ManageHeader`,
 * cần `ManageDrawerHost`); khu TÀI KHOẢN của app XePrime (`/account/balance`) không có drawer -
 * dựng `ManageHeader` ở đó là sập màn. Từ ADR 0053 sổ tenant chỉ còn ở khu quản lý.
 */
export type WalletShell = 'manage' | 'account';

/** Hai bảng của trang Số dư gian hàng - mã cũng là hậu tố khoá dịch `Wallet.tabs.*`. */
const BALANCE_TAB = { STATEMENT: 'statement', ACTIVITY: 'activity' } as const;
type BalanceTab = (typeof BALANCE_TAB)[keyof typeof BALANCE_TAB];
const BALANCE_TABS: readonly BalanceTab[] = [BALANCE_TAB.STATEMENT, BALANCE_TAB.ACTIVITY];

export function WalletScreen({
  scope = WALLET_SCOPE.ACCOUNT,
  shell = scope === WALLET_SCOPE.SHOP ? 'manage' : 'account',
  focusPayout = false,
}: {
  scope?: WalletScope;
  shell?: WalletShell;
  /**
   * Mở bằng `?section=payout` (alias `/manage/bank-accounts` hoặc `/account/bank-accounts`) ⇒ cuộn
   * tới khối tài khoản nhận tiền.
   */
  focusPayout?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const tBank = useTranslations('BankAccounts');
  /*
   * Cuộn tới khối payout MỘT lần, khi đã đo được vị trí - cùng cách `ShopProfileScreen` cuộn tới
   * `?section=`. Toạ độ khối là tương đối với cột nội dung, nên cộng thêm vị trí của cột.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  const columnY = useRef<number | null>(null);
  const payoutY = useRef<number | null>(null);
  const scrolled = useRef(false);
  /*
   * Chỉ cuộn khi thẻ số dư phía trên ĐÃ có dữ liệu - như web (`summary.isSuccess`,
   * `AccountBalanceView`): đo lúc thẻ còn là khung chờ thì skeleton thấp hơn thẻ thật, khối đích
   * bị đẩy xuống sau đó và lượt cuộn duy nhất dừng phía trên nó.
   */
  const summaryReady = useRef(false);
  const scrollToPayout = useCallback(() => {
    if (!focusPayout || scrolled.current || !summaryReady.current) return;
    if (columnY.current === null || payoutY.current === null) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({
      y: Math.max(0, columnY.current + payoutY.current - space.md),
      animated: true,
    });
  }, [focusPayout]);
  useEffect(() => {
    if (!focusPayout) scrolled.current = false;
  }, [focusPayout]);
  const onColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      columnY.current = event.nativeEvent.layout.y;
      scrollToPayout();
    },
    [scrollToPayout],
  );
  const onPayoutLayout = useCallback(
    (event: LayoutChangeEvent) => {
      payoutY.current = event.nativeEvent.layout.y;
      scrollToPayout();
    },
    [scrollToPayout],
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  /*
   * Kỳ + trang của bảng tổng hợp sống ở state MÀN, không dùng chung `page` với sổ ví: hai danh
   * sách phân trang cùng một biến sẽ kéo nhau mỗi lần một bên lật trang.
   *
   * Web giữ chúng trên URL (ADR 0004) để "gửi kế toán đường dẫn tháng 10" chạy được; native không
   * có thanh địa chỉ, nên state màn là chỗ tương đương gần nhất - và nó vẫn sống qua một lần đi
   * sang màn khác rồi lui lại, vì màn không bị tháo.
   */
  /*
   * Hai bảng của trang Số dư gian hàng (web `PartnerBalanceView`, PR #276): "Tổng hợp giao dịch"
   * và "Biến động số dư". Biến động số dư thay cho hai khối "Lệnh rút" + "Sổ giao dịch" cũ - lệnh
   * rút là một dòng của chính nó. Hai bảng dùng CHUNG một kỳ.
   */
  const [tab, setTab] = useState<BalanceTab>(BALANCE_TAB.STATEMENT);
  const [statementFilters, setStatementFilters] = useState<WalletStatementFilters>(() => ({
    period: nowInAppTz().format(STATEMENT_PERIOD_FORMAT),
    page: 1,
  }));

  /*
   * Phía TÀI KHOẢN KHÁCH: lệnh rút và sổ ví là các dòng của tab "Lịch sử giao dịch"
   * (`GET /account/transactions`) - tab số dư chỉ còn thẻ số dư + tài khoản nhận tiền, như web.
   */
  /*
   * Hàng tiêu đề của khu quản lý đặt hành động chính cạnh tên trang, cùng khuôn với màn
   * Giao dịch thu chi. Query này dùng chung cache với `WalletSummaryCard`, nên không tạo thêm
   * một request mạng; nó chỉ cho hàng tiêu đề biết lúc nào nút Rút được phép bật.
   */
  // Phía tài khoản cũng đọc nó: khối lưu ý dưới tài khoản nhận tiền cần `maxBusinessDays`.
  const walletSummary = useWalletSummary(scope);
  const queryClient = useQueryClient();
  // Kéo để làm mới số dư, sổ và các lệnh rút cùng lúc.
  const pull = usePullRefresh(
    useCallback(
      () =>
        Promise.all([
          walletSummary.refetch(),
          // Bảng đang mở (tổng hợp / biến động) đọc dưới `wallet` - làm mới cả nhánh.
          queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all }),
        ]),
      [walletSummary, queryClient],
    ),
  );
  // Dữ liệu vừa về: khối đích sẽ đo lại (onLayout), nhưng nếu nó không xê dịch thì cuộn từ đây.
  useEffect(() => {
    summaryReady.current = walletSummary.isSuccess;
    if (walletSummary.isSuccess) scrollToPayout();
  }, [walletSummary.isSuccess, scrollToPayout]);

  const isShop = scope === WALLET_SCOPE.SHOP;
  /*
   * Kỳ của thẻ chỉ số + Tổng hợp tháng: trang 1 của kỳ đang xem. Ở tab tổng hợp dùng đúng bộ lọc
   * của bảng (trùng khoá cache, không thêm request).
   */
  // Luôn TRANG 1 - danh sách cuộn vô hạn đổi `page` liên tục, thẻ tổng hợp không được tải lại theo.
  const monthFilters: WalletStatementFilters = { period: statementFilters.period, page: 1 };
  /** Tab đang mở đăng ký "tải trang kế" vào đây; `Screen onNearEnd` gọi nó (cuộn vô hạn). */
  const loadMoreRef = useRef<(() => void) | null>(null);
  // Trang gian hàng là "Quản lý ví" của web (ledger 09 §3.10); ví tài khoản khách giữ tên cũ.
  const title = isShop ? t('manage.title') : t('title.user');

  /*
   * Hai VỎ cho cùng một màn: khu gian hàng có thanh quản lý + tiêu đề trang, khu tài khoản có nút
   * lui về menu. Cùng khuôn mà `CalendarScreen` đang dùng - thân màn không biết mình đang ở đâu.
   */
  const manageShell = shell === 'manage';
  /*
   * Khu tài khoản: màn này là tab "Tài khoản thanh toán" của mục Quản lý thanh toán (web
   * `AccountPaymentsHub`, design Account 22/10/2026) - tiêu đề là của MỤC, bộ chuyển tab ngay dưới.
   */
  // Khu tài khoản: header + dải tab do `AccountPaymentsHub` dựng (đổi tab tại chỗ, 29/10/2026).
  const header = manageShell ? <ManagePageHeader title={title} /> : null;

  return (
    <>
      {header}
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={!manageShell}
        scrollRef={scrollRef}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        onNearEnd={() => loadMoreRef.current?.()}
      >
        {/*
          Câu mô tả trang nói ĐÂY LÀ KHOẢN PHẢI TRẢ, không phải ví điện tử (ADR 0033 điều 1) - cùng
          khe `subtitle` mà `/manage/balance` bên web dùng. Nó thay cho dòng "1 điểm = 1đ" đã bị gỡ
          khi ví đổi tên từ "Ví điểm" sang "Số dư".
        */}
        {/* Trang gian hàng: Figma `24228:102177` không có câu mô tả dưới tiêu đề (người dùng chốt bỏ 25/11/2026). */}
        {manageShell && !isShop ? (
          <YStack pb={space.sm}>
            {/* Nút "Rút về ngân hàng" nằm TRONG thẻ số dư như web — hàng tiêu đề không lặp nó. */}
            {/*
              Mô tả đứng TRỌN bề ngang dưới hàng tiêu đề, giống `summaryBlock` của Giao dịch
              thu chi. Đặt nó chung cột với nút Rút sẽ bó câu dài vào phần bề ngang còn lại và
              biến hai dòng thành bốn dòng trên máy 360dp.
            */}
            <Text px={layout.screenX} col={colors.textMuted} fos={fontSize.label}>
              {t('page.subtitle')}
            </Text>
          </YStack>
        ) : null}

        {/*
          Thứ tự khổ điện thoại của web `PartnerBalanceView` (ledger 09 §3.10): CỘT PHẢI lên trước
          — thẻ số dư + tài khoản nhận tiền chung một thẻ trắng, Tổng hợp tháng, ô ghi chú thuế —
          rồi hàng tab ngay trên nội dung của nó.
        */}
        <YStack
          gap={layout.section}
          px={manageShell ? layout.screenX : 0}
          // Figma "Container" đệm 16 cả bốn phía - trang gian hàng không còn câu mô tả đứng trên.
          pt={manageShell && isShop ? space.md : 0}
          pb={manageShell ? layout.section : 0}
          onLayout={onColumnLayout}
        >
          {isShop ? (
            <ScrollReveal index={0}>
              {/* Figma "Wallet Card" `24228:102180`: thẻ trắng bo 16, đệm 8 (đáy 12), khe 12. */}
              <YStack
                bg={colors.surface}
                br={radius.card}
                pt={space.sm}
                px={space.sm}
                pb={SPACE_12}
                gap={SPACE_12}
                overflow="hidden"
              >
                  <WalletSummaryCard
                    scope={scope}
                    onWithdraw={() => setWithdrawOpen(true)}
                    pageVariant={manageShell}
                  />
                  {/* Đích của `?section=payout` (thông báo, route cũ `/manage/bank-accounts`). */}
                  <YStack onLayout={onPayoutLayout}>
                    <BankAccountList
                      scope={BANK_ACCOUNT_SCOPE.SHOP}
                      title={tBank('title')}
                      hint={t('payout.hint')}
                      appearance="wallet"
                    />
                  </YStack>
              </YStack>
            </ScrollReveal>
          ) : (
            <>
              <ScrollReveal index={0}>
                <WalletSummaryCard
                  scope={scope}
                  onWithdraw={() => setWithdrawOpen(true)}
                  pageVariant={manageShell}
                />
              </ScrollReveal>
              {/*
               * Tab "Tài khoản thanh toán" (web `AccountBalanceView`, Figma `19879:74829`): khối là
               * MỘT thẻ - tiêu đề, mô tả, thẻ tài khoản hình `detail`, rồi khối lưu ý.
               */}
              <YStack onLayout={onPayoutLayout}>
                <ScrollReveal index={1}>
                  <SectionCard>
                    <BankAccountList
                      scope={BANK_ACCOUNT_SCOPE.ACCOUNT}
                      title={tBank('title')}
                      hint={tBank('subtitle')}
                      detailed
                      footer={<PayoutNotes maxBusinessDays={walletSummary.data?.maxBusinessDays} />}
                    />
                  </SectionCard>
                </ScrollReveal>
              </YStack>
            </>
          )}

          {isShop ? (
            <>
              {/*
                Thẻ ba chỉ số (Figma "Vehicle Summary" `24228:102201`) rồi thẻ Tổng hợp tháng - cả
                hai hiện ở CẢ HAI tab, đọc chung một kỳ.
              */}
              <WalletStatsCard filters={monthFilters} />
              <WalletMonthSummary filters={monthFilters} />

              {/*
                Figma `24612:145584`: MỘT thẻ trắng viền bo 16, đệm 16, khe 12 - hàng tab chia đôi
                (16/24, gạch vàng 2px), ô tháng trải ngang, rồi nội dung của tab (người dùng chốt
                cùng một khung cho cả hai tab, 25/11/2026).
              */}
              <YStack
                bg={colors.surface}
                bw={1}
                bc={colors.border}
                br={radius.card}
                p={space.md}
                gap={SPACE_12}
              >
                <YStack accessibilityLabel={t('tabs.label')}>
                  <UnderlineTabs
                    stretch
                    items={BALANCE_TABS.map((value) => ({ key: value, label: t(`tabs.${value}`) }))}
                    value={tab}
                    onChange={(value) => {
                      setTab(value);
                      setStatementFilters((prev) => ({ ...prev, page: 1 }));
                    }}
                  />
                </YStack>
                {tab === BALANCE_TAB.ACTIVITY ? (
                  <WalletActivityPanel
                    filters={statementFilters}
                    loadMoreRef={loadMoreRef}
                    onFiltersChange={(patch) =>
                      setStatementFilters((prev) => ({ ...prev, ...patch }))
                    }
                  />
                ) : (
                  <WalletStatementPanel
                    filters={statementFilters}
                    loadMoreRef={loadMoreRef}
                    onFiltersChange={(patch) =>
                      setStatementFilters((prev) => ({ ...prev, ...patch }))
                    }
                  />
                )}
              </YStack>
            </>
          ) : null}
        </YStack>
      </Screen>

      <WithdrawSheet scope={scope} open={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </>
  );
}

/**
 * Thẻ bọc một KHỐI của trang (tổng hợp, lệnh rút, sổ, thuế) - mỗi khối một mặt phẳng,
 * thay vì các cụm chữ thả trên nền trang.
 */
function SectionCard({ children }: { children: ReactNode }) {
  return (
    <Card lift="flat">
      <YStack gap={space.sm}>{children}</YStack>
    </Card>
  );
}
