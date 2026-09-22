import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  BILLING_MODE,
  BILLING_PHASE,
  PERMISSION,
  canUpgradeToPackageTrack,
  SUBSCRIPTION_INVOICE_STATUS_META,
  STATUS_COLOR,
  type BillingPhase,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import type { IconName } from '@/components/ui/Chip';
import { BadgeRows } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Divider } from '@/components/ui/DataRow';
import { IconDisc } from '@/components/ui/IconDisc';
import { IconButton } from '@/components/ui/IconButton';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import type { ReactNode } from 'react';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  INVOICES_DEFAULT_LIMIT,
  type MySubscription,
  type SlotUsage,
  type SubscriptionInvoice,
} from '@/api/subscription/api';
import { InvoicePaymentPanel } from './components/InvoicePaymentPanel';
import { PackageUpgradeWizard } from './components/PackageUpgradeWizard';
import { PlanFeatureList } from './components/PlanFeatureList';
import { PurchaseSheet } from './components/PurchaseSheet';
import {
  useMySubscription,
  usePendingInvoice,
  useSubscriptionInvoices,
} from './hooks/use-subscription';

/**
 * "Gói của tôi" (W2, ADR 0015/0026) — bản native của `/manage/subscription`.
 *
 * Cùng THỨ TỰ KHỐI với web: gói hiện hành → chỗ xe đang dùng → lượt miễn phí → tính năng theo gói
 * → hoá đơn đang chờ chuyển khoản → lịch sử hoá đơn.
 *
 * Người dùng KHÔNG được bất ngờ ở đơn thứ ba — lượt miễn phí và điều gì xảy ra khi hết đứng ngay
 * đầu màn, trước cả lịch sử hoá đơn.
 *
 * ## Hai quyền, hai việc
 *
 * `subscription.view` cho XEM gói và hạn mức — `shop_manager` có, vì điều hành đội xe cần biết
 * còn bao nhiêu chỗ. `subscription.purchase` cho MUA/gia hạn thì mặc định chỉ chủ gian hàng có
 * (`rbac.ts`), và API đã chặn. Giao diện phải khớp: thiếu quyền thì KHÔNG có lối nào dẫn vào
 * luồng đó, và `PurchaseSheet` KHÔNG được dựng trong cây — một tấm trượt treo sẵn là một đường
 * vào mà API sẽ từ chối ở bước cuối. Ẩn nút vẫn không phải lớp chặn (CLAUDE.md §6); chặn thật ở
 * server, đây chỉ là không mời người dùng đi vào ngõ cụt.
 */
/**
 * `header` — VỎ điều hướng của khu đang đứng.
 *
 * Cùng màn phục vụ hai khu: khu quản lý (`/manage/subscription`) và khu khách
 * (`/account/subscription` — chủ xe tuyến hoa hồng KHÔNG vào khu quản lý được, ADR 0038 điều 4).
 * Mặc định là đầu trang khu quản lý, nơi màn này ra đời; để nguyên mặc định ở khu khách thì người
 * dùng thấy đầu trang của một khu họ không thuộc về, và không có đường lui.
 */
/** Dưới ngưỡng này thì ô thời hạn đổi sang sắc cảnh báo — cùng mốc web dùng. */
const TERM_WARNING_DAYS = 7;

export function SubscriptionScreen({ header }: { header?: ReactNode } = {}) {
  const t = useTranslations('Subscription');

  return (
    <>
      {header ?? <ManageHeader />}
      <Screen edges={['left', 'right', 'bottom']}>
        <ManagePageTitle title={t('page.title')} />
        <SubscriptionWorkspace />
      </Screen>
    </>
  );
}

/**
 * THÂN của màn gói — không có vỏ điều hướng, không có <Screen> của riêng nó.
 *
 * Tồn tại vì nó có HAI chỗ đứng, đúng như `SubscriptionWorkspace` bên web: một màn riêng
 * (`/manage/subscription`, `/account/subscription`) và khối "Gói & hạn mức" nhúng trong màn
 * Cửa hàng. Nhúng cả một <Screen> vào trong một <Screen> là hai vùng cuộn lồng nhau — ngón tay
 * kéo ở nửa dưới màn hình sẽ cuộn nhầm cái bên trong.
 *
 * Mọi trạng thái (thiếu quyền, đang tải, lỗi) vẽ INLINE chứ không chiếm cả màn: ở chỗ nhúng,
 * một `ScreenMessage` căn giữa toàn màn sẽ đẩy khối hồ sơ gian hàng ra khỏi tầm nhìn.
 *
 * KHÔNG nhận `framed` như web: ở đây từng khối đã tự mang `<Card>` của nó, nên nơi nhúng chỉ
 * cần đặt một tiêu đề lên trên chứ không bọc thêm khung nào.
 */
export function SubscriptionWorkspace() {
  const t = useTranslations('Subscription');
  const tPermission = useTranslations('ManageCommon.permission');
  const permissions = usePermissions();

  const [page, setPage] = useState(1);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  /*
   * Lịch sử GẬP LẠI mặc định, đúng như web: người ta mở nó vài tháng một lần, thường để tìm một
   * mã cụ thể. Thứ đứng trước phải là VIỆC PHẢI LÀM (hoá đơn đang chờ tiền) — một gian hàng có
   * hoá đơn quá hạn mà nhìn chủ yếu thấy một danh sách cũ thì màn này sắp thứ tự sai.
   */
  const [historyOpen, setHistoryOpen] = useState(false);

  const canView = permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const canPurchase = permissions.has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const { data: user } = useCurrentUser();
  /*
   * Chủ xe tuyến hoa hồng ⇒ màn NÂNG CẤP thay cho tấm trượt mua gói. Điều kiện đọc từ luật dùng
   * chung (ADR 0038 điều 1 · ADR 0040 điều 4): nhân viên gian hàng hoa hồng, tenant thiếu gói
   * hiện hành và gian hàng đã từng trả tiền đều KHÔNG rơi vào đây — với họ đây vẫn là màn gia hạn.
   */
  const upgrading = canPurchase && canUpgradeToPackageTrack(user?.tenant);
  const serviceFeePercent = user?.tenant?.serviceFeePercent ?? null;
  const me = useMySubscription(canView);
  const invoices = useSubscriptionInvoices(page, canView);
  /*
   * Hoá đơn đang chờ tiền đi qua BỀ MẶT RIÊNG (`GET /subscription/invoices/pending`), không phải
   * phép dò trong trang hoá đơn đang mở.
   *
   * Hai lý do, và cả hai đều là tiền: (1) lật sang trang 2 thì khối QR biến mất, trong khi khoản
   * tiền đó vẫn đang chờ; (2) bề mặt riêng tự hỏi lại theo nhịp và dừng khi hoá đơn tới trạng thái
   * kết, nên người dùng chuyển khoản xong quay lại app là thấy gói đã bật — không phải tự kéo làm
   * mới và đoán xem tiền đã về chưa (ADR 0022).
   */
  const pending = usePendingInvoice(canView);

  if (!permissions.isLoading && !canView) {
    return (
      <ScreenMessage
        icon="lock-closed-outline"
        title={tPermission('deniedTitle')}
        description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.SUBSCRIPTION_VIEW}`}
      />
    );
  }

  if (me.isLoading) {
    return <MiniRowsSkeleton rows={6} />;
  }

  if (me.isError || !me.data) {
    return (
      <ScreenError error={me.error} title={t('page.loadError')} onRetry={() => void me.refetch()} />
    );
  }

  const { currentPlan, usage, fleetQuota } = me.data;
  const pendingInvoice = pending.data ?? undefined;
  const total = invoices.data?.meta?.total ?? 0;

  return (
    <>
      <YStack gap={space.md}>
        {/*
            Tuyến hoa hồng: KHÔNG dựng nút mua ở đây. Luồng nâng cấp là cả một khối ngay bên
            dưới, và một nút thứ hai dẫn tới chính nó là một cú chạm chỉ để cuộn vài trăm px.
          */}
        <CurrentPlanCard
          plan={currentPlan}
          canPurchase={canPurchase && !upgrading}
          onPurchase={() => setPurchaseOpen(true)}
        />

        <Card>
          <YStack gap={space.md}>
            <CardHeading icon="speedometer-outline" tone={colors.info} surface={colors.infoSurface}>
              {t('usage.title')}
            </CardHeading>
            {/*
                MỘT dòng trần cho cả đội xe (ADR 0041 điều 4) — cả hai tuyến nay đếm TỔNG ô tô +
                xe máy. Hai dòng theo loại bên dưới chỉ nói MỨC DÙNG, không mang trần nào: viết
                trần tổng vào dòng của từng loại là màn hình nói "3 ô tô" trong khi backend chặn ở
                "3 xe", và chủ xe sẽ đăng đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu tiên bị từ
                chối.
              */}
            <FleetTotalRow used={fleetQuota.totalUsed} limit={fleetQuota.totalLimit ?? null} />
            <UsageRow label={t('usage.car')} usage={usage.car} icon="car-sport-outline" />
            <UsageRow label={t('usage.motorbike')} usage={usage.motorbike} icon="bicycle-outline" />

            {/*
                THỜI HẠN và PHÍ DỊCH VỤ là hai dòng nói về HỢP ĐỒNG, không phải về chỗ xe — một
                vạch ngăn tách chúng khỏi ba dòng hạn mức phía trên, thay vì để cả năm dòng đổ
                liền nhau và người đọc phải tự đoán dòng nào thuộc nhóm nào.
              */}
            {currentPlan != null || serviceFeePercent != null ? <Divider /> : null}

            {/* Còn bao lâu nữa hết hạn — con số thứ ba của web, và là thứ quyết định gia hạn. */}
            {currentPlan ? <TermRow endsAt={currentPlan.endsAt} /> : null}

            {/*
                PHÍ DỊCH VỤ đọc từ CHÍNH SÁCH PHÍ hiệu lực (`/auth/me`), KHÔNG từ `commissionPercent`
                của gói: hai con số đó không bị ràng buộc phải bằng nhau (ADR 0029 điều 2), và thứ
                thật sự trừ vào tiền chủ xe là con số của chính sách. Tuyến gói không thu gì trên
                chuyến nên dòng này vắng mặt thay vì hiện "0%".
              */}
            {serviceFeePercent != null ? (
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t('usage.serviceFee')}
                </Text>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('usage.serviceFeeValue', { percent: serviceFeePercent })}
                </Text>
              </XStack>
            ) : null}

            <QuotaWarning fleetQuota={fleetQuota} />
          </YStack>
        </Card>

        {/*
            "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả: chỗ bán hàng thật sự của màn này. Tự biến
            mất khi không còn tính năng nào bị khoá, và không mời bấm khi thiếu quyền mua.
          */}
        <PlanFeatureList
          {...(canPurchase && !upgrading ? { onUpgrade: () => setPurchaseOpen(true) } : {})}
        />

        {upgrading ? <PackageUpgradeWizard /> : null}

        {/*
            Luồng nâng cấp đã dựng khối chuyển khoản ở bước 3 của nó. Để màn này dựng thêm một
            khối nữa là hai mã QR cho CÙNG một hoá đơn trên cùng một màn.
          */}
        {pendingInvoice && !upgrading ? (
          <Card>
            <YStack gap={space.md}>
              <CardHeading
                icon="qr-code-outline"
                tone={colors.warning}
                surface={colors.warningSurface}
              >
                {t('payment.pendingTitle')}
              </CardHeading>
              <InvoicePaymentPanel invoice={pendingInvoice} />
            </YStack>
          </Card>
        ) : null}

        <YStack gap={space.sm}>
          <BlockTitle>{t('invoices.title')}</BlockTitle>

          {invoices.isLoading ? (
            <MiniRowsSkeleton rows={3} />
          ) : invoices.isError && !invoices.data ? (
            <ScreenError
              error={invoices.error}
              title={t('invoices.loadError')}
              onRetry={() => void invoices.refetch()}
            />
          ) : (invoices.data?.items.length ?? 0) === 0 ? (
            /*
                Chỗ trống nói ĐỦ HAI Ý: chưa có gì, và bao giờ thì có. Một dòng "chưa phát sinh
                hoá đơn" trơ trọi để người dùng tự đoán mình có đang thiếu thao tác nào không.
              */
            <YStack gap={2}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('invoices.empty')}
              </Text>
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('invoices.emptyHint')}
              </Text>
            </YStack>
          ) : (
            /*
                Lịch sử là một khối GẬP — chạm để mở, chạm lần nữa để đóng lại.

                Bản trước là một nút đổi thành danh sách: mở ra rồi thì không còn đường đóng, và
                người dùng phải rời màn để lấy lại chỗ. Danh sách vẫn chỉ được DỰNG khi mở.
              */
            <>
              <Button
                label={t(historyOpen ? 'invoices.hideHistory' : 'invoices.showHistory')}
                variant="secondary"
                size="sm"
                icon={historyOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
                onPress={() => setHistoryOpen((open) => !open)}
              />
              {historyOpen ? (
                <>
                  {(invoices.data?.items ?? []).map((invoice) => (
                    <InvoiceRow key={invoice.id} invoice={invoice} />
                  ))}
                  {total > INVOICES_DEFAULT_LIMIT ? (
                    <Pagination
                      page={page}
                      limit={INVOICES_DEFAULT_LIMIT}
                      total={total}
                      onChange={setPage}
                    />
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </YStack>
      </YStack>

      {/*
        Thiếu quyền mua ⇒ KHÔNG dựng tấm trượt trong cây, đúng như web. Tuyến hoa hồng cũng
        không: luồng của họ đã nằm ngay trên màn.
      */}
      {canPurchase && !upgrading ? (
        <PurchaseSheet open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * Hàng tiêu đề của một thẻ trong màn này — đĩa hình nhạt + chữ.
 *
 * Cục bộ chứ không đẩy lên bộ UI chung: nó chỉ tồn tại để ba thẻ của MÀN NÀY đọc ra cùng một
 * nhịp. Thứ hai màn dùng chung mới thuộc về `src/components/ui` (shared-code).
 */
function CardHeading({
  icon,
  tone,
  surface,
  children,
}: {
  icon: IconName;
  tone: string;
  surface: string;
  children: string;
}) {
  return (
    <XStack ai="center" gap={space.sm}>
      <IconDisc icon={icon} tone={tone} surface={surface} />
      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {children}
      </Text>
    </XStack>
  );
}

/**
 * Gói hiện hành — hoặc lời giải thích vì sao CHƯA có gói.
 *
 * "Chưa có gói" KHÔNG phải một trạng thái rỗng: gian hàng đó đang ở tuyến hoa hồng theo chuyến
 * (ADR 0028 điều 1), và họ phải đọc được điều đó ở đúng chỗ họ đi tìm gói của mình.
 */
function CurrentPlanCard({
  plan,
  canPurchase,
  onPurchase,
}: {
  plan: NonNullable<ReturnType<typeof useMySubscription>['data']>['currentPlan'];
  /** Quyền `subscription.purchase`. Thiếu ⇒ KHÔNG dựng nút nào dẫn vào luồng API sẽ chặn. */
  canPurchase: boolean;
  onPurchase: () => void;
}) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const isCommission = plan?.billingMode === BILLING_MODE.COMMISSION;

  /*
    MỘT danh sách tín hiệu có THỨ TỰ: phần tử đầu vừa là viên nhãn góc trên phải, vừa là màu vạch
    mép trái. Tính màu vạch bằng một chuỗi điều kiện riêng là cách hai kênh nói hai điều khác nhau
    về cùng một thẻ.

    Chưa có gói ⇒ không có tín hiệu nào dẫn đầu, và vạch về trung tính: đó không phải trạng thái
    xấu, chỉ là gian hàng đang ở tuyến hoa hồng theo chuyến (ADR 0028 điều 1).
  */
  const leadColor = plan ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL;

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={leadColor} />
        <YStack f={1} p={space.md} gap={space.sm}>
          <XStack ai="center" gap={space.sm}>
            {/*
              Đĩa hình ĐẶC — đây là thẻ đứng đầu màn, và đĩa đặc neo cả khối lại thay vì để một
              dòng tiêu đề trôi giữa những thẻ giống hệt nhau bên dưới.
            */}
            <IconDisc icon="ribbon-outline" tone={colors.primary} filled />
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.textMuted} fos={fontSize.meta} fow={fontWeight.semibold}>
                {t('current.title').toUpperCase()}
              </Text>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={2}>
                {plan ? plan.planName : t('current.none')}
              </Text>
            </YStack>
            {/* Gói đang CHẠY, không phải một bậc trong bảng giá — nói ra để hai thứ không lẫn. */}
            {plan ? (
              <StatusBadge label={t('current.activeTag')} color={STATUS_COLOR.SUCCESS} size="sm" />
            ) : null}
          </XStack>

          {plan ? (
            <>
              {/*
                Chế độ thu phí là thông tin PHÂN LOẠI, không phải trạng thái — nó xuống dải viên
                nhãn dưới tên chứ không tranh góc trên phải với viên "đang chạy".
              */}
              {plan.billingMode ? (
                <BadgeRows
                  items={[
                    {
                      key: 'billingMode',
                      label: domainLabel('billingMode', plan.billingMode),
                      node: (
                        <StatusBadge
                          label={domainLabel('billingMode', plan.billingMode)}
                          color={STATUS_COLOR.NEUTRAL}
                          size="sm"
                        />
                      ),
                    },
                  ]}
                />
              ) : null}

              <Divider />

              {/*
              Hạn mức đọc từ SNAPSHOT trên dòng thuê bao (`quota`), không xuyên qua bậc gói
              (ADR 0041 điều 3): admin sửa trần của một bậc là quyết định về DANH MỤC, và để nó
              lật hạn mức của gian hàng đang chạy giữa kỳ là đổi điều kiện một hợp đồng đã thu tiền.

              `maxVehicles === null` nghĩa là KHÔNG GIỚI HẠN và phải thắng — đọc nó thành "chưa
              khai" rồi rơi về một con số là sai ở đúng chỗ tốn tiền nhất.
            */}
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('current.expires', { date: fmt.date(plan.endsAt) })}
                {plan.quota
                  ? `${LIST_SEPARATOR}${
                      plan.quota.maxVehicles == null
                        ? t('purchase.limitVehiclesUnlimited')
                        : t('purchase.limitVehicles', { count: plan.quota.maxVehicles })
                    }`
                  : ''}
              </Text>

              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {isCommission ? t('current.commissionSummary') : t('current.packageSummary')}
              </Text>
            </>
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('current.noneHint')}
            </Text>
          )}

          {/* Gia hạn là một VÒNG LẶP, mua lần đầu là một giao dịch — hai hình khác nhau. */}
          {canPurchase ? (
            <Button
              label={plan ? t('current.renewButton') : t('current.purchaseButton')}
              icon={plan ? 'refresh-outline' : 'pricetag-outline'}
              onPress={onPurchase}
            />
          ) : null}
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Trần TỔNG của tuyến hoa hồng — một con số cho cả ô tô lẫn xe máy.
 *
 * Không có phần "đội xe / trên chợ" như `UsageRow`: trần này chỉ gác điểm TẠO xe, không gác điểm
 * gửi lên chợ (ADR 0038 điều 12), nên một con số "trên chợ" ở đây sẽ gợi ý một hạn mức thứ hai
 * không tồn tại.
 */
function FleetTotalRow({ used, limit }: { used: number; limit: number | null }) {
  const t = useTranslations('Subscription');
  const full = limit != null && used >= limit;

  return (
    /*
      Trần tổng là con số NGƯỜI DÙNG ĐI TÌM ở khối này, nên nó đứng trên một nền chìm riêng thay
      vì nằm phẳng cùng hai dòng mức dùng theo loại: ở bản trước, ba dòng cùng cỡ chữ và cùng nền
      làm cái trần đọc ra như một mục thứ ba ngang hàng.
    */
    <YStack gap={space.xs} bg={colors.surfaceMuted} br={radius.md} p={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('usage.fleetTotal')}
        </Text>
        <Text col={full ? colors.warning : colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {limit == null
            ? `${used}${LIST_SEPARATOR}${t('usage.unlimited')}`
            : t('usage.ofLimit', { used, limit })}
        </Text>
      </XStack>

      {/*
        `limit == null` = KHÔNG giới hạn (bậc doanh nghiệp) ⇒ không vẽ thanh và không nhắc mua
        gói: một thanh 0% cho thứ không có trần là hình ảnh nói ngược với con chữ bên cạnh nó, và
        mời một gian hàng không giới hạn đi mua thêm chỗ là nói sai về hợp đồng của họ.
      */}
      {limit != null && limit > 0 ? (
        <>
          <ProgressBar
            percent={Math.min(100, Math.round((used / limit) * 100))}
            tone={full ? 'exception' : 'active'}
            size="sm"
            label={t('usage.fleetTotal')}
          />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('usage.fleetTotalHint', { limit })}
          </Text>
        </>
      ) : null}
    </YStack>
  );
}

/**
 * Còn bao nhiêu ngày, hoặc đang ở PHA nào.
 *
 * PHA đọc từ server (`/auth/me`), không suy từ `endsAt` bằng đồng hồ máy: `current` và `grace`
 * có cùng một `endsAt` trong quá khứ nhưng khác nhau ở toàn bộ quyền dùng Manage, và chỉ server
 * biết `graceDays` của gói là bao nhiêu (ADR 0038 điều 1).
 *
 * Số NGÀY thì tính bằng đồng hồ máy, và thế là đủ: nó chỉ để đọc. Máy lệch giờ làm con số lệch một
 * ngày, không làm ai mất tính năng.
 */
function TermRow({ endsAt }: { endsAt: string }) {
  const t = useTranslations('Subscription');
  const { tenant } = useTenantScope();
  const phase = (tenant?.billingPhase ?? null) as BillingPhase | null;
  const daysLeft = toAppTz(endsAt).diff(nowInAppTz(), 'day');

  const lapsed = phase === BILLING_PHASE.LAPSED;
  const grace = phase === BILLING_PHASE.GRACE;
  const urgent = lapsed || grace || daysLeft <= TERM_WARNING_DAYS;

  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {t('term.label')}
      </Text>
      <Text
        col={urgent ? colors.warning : colors.textMuted}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {lapsed
          ? t('term.lapsed')
          : grace
            ? t('term.grace')
            : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </Text>
    </XStack>
  );
}

/**
 * MỘT dòng cảnh báo khi đã dùng hết chỗ — và chỉ khi đó.
 *
 * Còn chỗ trống thì các dòng hạn mức ở trên đã nói đủ, và một dải "mọi thứ đều ổn" đứng thường
 * trực chỉ dạy người dùng bỏ qua vùng đó.
 */
function QuotaWarning({ fleetQuota }: { fleetQuota: MySubscription['fleetQuota'] }) {
  const t = useTranslations('Subscription');

  /*
   * MỘT trần cho cả đội xe (ADR 0041 điều 4): cả hai tuyến nay đếm TỔNG ô tô + xe máy, nên không
   * còn hai trần theo loại để gộp thành một danh sách.
   */
  const limit = fleetQuota.totalLimit;
  if (limit == null || limit <= 0 || fleetQuota.totalUsed < limit) return null;

  return (
    <Callout tone="warning" title={t('usage.atLimitTotal', { limit })}>
      {/*
        Câu TIẾP THEO tuỳ NGUỒN của trần, không tuỳ tuyến: trần đã trả tiền thì việc cần làm là
        nâng bậc; trần Owner Lite thì là mua gói lần đầu. Hai việc khác nhau, hai câu khác nhau.
      */}
      {fleetQuota.reason === 'plan' ? t('usage.atLimitUpgrade') : t('usage.atLimitBuyPlan')}
    </Callout>
  );
}

/**
 * Một dòng MỨC DÙNG theo loại xe — KHÔNG có trần, nên không có thanh tiến trình.
 *
 * ADR 0041 điều 4 gỡ trần theo loại: trần nay là MỘT con số tổng, và nó có dòng riêng
 * (`FleetTotalRow`) ngay phía trên. Viết trần tổng vào dòng của từng loại là màn hình nói "3 ô tô"
 * trong khi backend chặn ở "3 xe", và chủ xe sẽ đăng đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu
 * tiên bị từ chối — đúng lỗi mà điều 4 vừa gỡ bỏ.
 *
 * Dòng này vì thế chỉ trả lời "đang có mấy chiếc", tách bạch đội xe với số đang bán trên chợ.
 */
function UsageRow({ label, usage, icon }: { label: string; usage: SlotUsage; icon: IconName }) {
  const t = useTranslations('Subscription');

  return (
    /*
      Đĩa hình NHẠT dẫn đầu dòng: ô tô và xe máy là hai dòng chữ gần giống nhau, và hình là thứ
      phân biệt được trước khi mắt kịp đọc nhãn. Đặc (filled) thì hai dòng phụ này sẽ tranh chú ý
      với thẻ gói ở đầu màn.
    */
    <XStack ai="center" gap={space.sm}>
      <IconDisc icon={icon} tone={colors.info} surface={colors.infoSurface} />
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('usage.fleet')}: {usage.used}
          {LIST_SEPARATOR}
          {t('usage.onMarketplace')}: {usage.onMarketplace}
        </Text>
      </YStack>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {usage.used}
      </Text>
    </XStack>
  );
}

/** Một hoá đơn — năm cột của bảng web gập lại thành một thẻ đọc được trên màn hẹp. */
function InvoiceRow({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const copy = useCopy();

  const meta = SUBSCRIPTION_INVOICE_STATUS_META[invoice.status as SubscriptionInvoiceStatus];
  /* Vạch mép trái CÙNG màu với viên nhãn góc phải — một trạng thái, hai kênh, không lệch nhau. */
  const statusColor = meta?.color ?? STATUS_COLOR.NEUTRAL;

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={statusColor} />
        <YStack f={1} p={space.sm} gap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            {/*
              Mã và nút chép đi THÀNH MỘT CỤM, và cụm đó mới là thứ co giãn — không phải riêng
              dòng chữ. Để `f={1}` trên chữ thì mã bám mép trái còn nút chép bị đẩy sang giữa thẻ,
              đọc ra như một nút rời không biết nó chép cái gì.

              Mã đối soát là thứ người ta dán vào nội dung chuyển khoản hoặc đọc cho kế toán — gõ
              tay một chuỗi như vậy là một khoản tiền không khớp được.
            */}
            <XStack f={1} ai="center" gap={2} minWidth={0}>
              <Text
                col={colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.bold}
                numberOfLines={1}
                flexShrink={1}
              >
                {invoice.code}
              </Text>
              {/* `compact`: nút đứng SÁT chữ, ô 48dp quanh hình 20dp sẽ tạo lại đúng khoảng hở vừa bỏ. */}
              <IconButton
                icon="copy-outline"
                label={t('invoices.copyCode')}
                size={16}
                compact
                onPress={() => void copy(invoice.code)}
              />
            </XStack>
            <StatusBadge
              label={domainLabel('subscriptionInvoiceStatus', invoice.status, meta?.label)}
              color={statusColor}
              size="sm"
            />
          </XStack>

          <Divider />

          {/*
            SỐ TIỀN là thứ người ta dò khi lật lại lịch sử, nên nó ăn một bậc chữ to hơn kỳ hoá
            đơn bên trái thay vì cả hai cùng cỡ như bản trước.
          */}
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.textMuted} fos={fontSize.label}>
              {fmt.date(invoice.periodFrom)} → {fmt.date(invoice.periodTo)}
            </Text>
            <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
              {fmt.money(invoice.totalAmount)}
            </Text>
          </XStack>

          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('invoices.columns.createdAt')}: {fmt.date(invoice.createdAt)}
          </Text>
        </YStack>
      </XStack>
    </Card>
  );
}
