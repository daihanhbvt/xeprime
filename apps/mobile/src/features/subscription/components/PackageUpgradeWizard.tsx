import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

import { usePlanPurchase } from '../plan-purchase';
import {
  usePendingInvoice,
  usePurchaseSubscription,
  useSyncScopeWhenInvoiceSettles,
  useTenantPlans,
} from '../hooks/use-subscription';
import { InvoiceWaitingPanel } from './InvoiceWaitingPanel';
import { PlanPickerPanel } from './PlanPickerPanel';
import { UpgradeShopInfoStep } from './UpgradeShopInfoStep';

/** Ba chặng của luồng nâng cấp, theo đúng thứ tự người dùng đi qua. */
const STEPS = ['plan', 'shopInfo', 'payment'] as const;
type UpgradeStep = (typeof STEPS)[number];

/**
 * NÂNG CẤP từ chủ xe tuyến hoa hồng lên gian hàng tuyến gói — ba bước, trên `/account/subscription`
 * (ADR 0028 điều 1 · ADR 0040). Bản native của `PackageUpgradeWizard` bên web.
 *
 *   1. chọn bậc + kỳ hạn   2. hoàn thiện thông tin gian hàng   3. chuyển khoản
 *
 * ## Vì sao BẢNG GIÁ đứng trước FORM
 *
 * Người này đã có tenant, xe và chi nhánh — thứ duy nhất họ đang cân nhắc là *có đáng tiền
 * không*. Hỏi tên gian hàng và địa chỉ trước khi cho xem giá là dựng một bức tường trước một
 * quyết định chưa ai đưa ra. Form chỉ xuất hiện sau khi họ đã chọn xong bậc và kỳ hạn, và khi đó
 * nó là thủ tục của một việc họ đã quyết.
 *
 * ## Đây KHÔNG phải luồng đăng ký
 *
 * Tenant, chi nhánh mặc định và xe đã tồn tại. Không có `POST /tenants` ở đây, không tạo thêm
 * tenant/chi nhánh/ví nào, và cột `tenants.onboarding_state` của họ cũng KHÔNG bị client đụng tới
 * (ADR 0040 điều 3: mốc hoàn tất onboarding ghi trong CHÍNH transaction kích hoạt gói ở server).
 * Bước 2 chỉ SỬA hồ sơ đang có.
 *
 * ## Bước 3 đến từ SERVER, không từ state
 *
 * Màn thanh toán hiện ra vì `GET /subscription/invoices/pending` trả về một hoá đơn, không vì
 * component nhớ rằng mình vừa bấm nút. Đó là lý do nó sống qua một lần tắt app và qua một lần
 * đăng nhập ở máy khác — với đúng mã đối soát cũ. Một `useState` ở đây sẽ mời người dùng tạo hoá
 * đơn thứ hai cho cùng một khoản.
 */
export function PackageUpgradeWizard() {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  /**
   * Người dùng chủ động quay lại SỬA trong khi đang có hoá đơn chờ.
   *
   * Đây là ngoại lệ DUY NHẤT của luật "bước đến từ server", và nó phải tường minh: mặc định hoá
   * đơn chờ luôn thắng, vì đó là thứ giữ cho màn thanh toán sống qua một lần tắt app. Chỉ một cú
   * chạm có chủ ý ("Chọn lại gói") mới mở lại hai bước trước, và nó đi kèm cảnh báo mã cũ sẽ bị huỷ.
   */
  const [editing, setEditing] = useState(false);
  /** Bước người dùng đã chạm tới. Bước THẬT vẫn do dữ liệu quyết định — xem `step`. */
  const [reachedShopInfo, setReachedShopInfo] = useState(false);

  const pending = usePendingInvoice();
  const invoice = pending.data ?? null;
  /*
   * Danh mục gói chỉ tải khi bảng giá thật sự sắp hiện ra: chưa có hoá đơn chờ, HOẶC người dùng
   * vừa chạm "Chọn lại gói". Khi đang đứng ở màn chuyển khoản thì bảng giá không còn là thứ họ
   * đang quyết định, và một request nữa lúc đó chỉ làm màn thanh toán hiện ra chậm hơn.
   *
   * Thiếu vế `editing`, chạm "Chọn lại gói" sẽ mở ra một bảng giá RỖNG kèm câu "Chưa có gói nào
   * đang bán" — query vẫn tắt vì hoá đơn cũ chưa mất đi đâu cả.
   */
  const plans = useTenantPlans(!pending.isLoading && (invoice === null || editing));
  const selection = usePlanPurchase(plans.data ?? []);
  const purchase = usePurchaseSubscription();

  /*
   * Tiền về ⇒ hỏi lại `/auth/me`. Kích hoạt gói là việc của webhook SePay, và khi nó xong thì
   * tenant này thuộc về cổng quản lý. Thiếu lượt làm mới đó, màn thanh toán lặng lẽ quay về bảng
   * giá — hoá đơn hết "chờ" trong khi scope vẫn nói họ ở tuyến hoa hồng.
   */
  useSyncScopeWhenInvoiceSettles();

  /*
   * Bước hiện tại là một hàm của DỮ LIỆU, không phải một biến state độc lập:
   *  - có hoá đơn chờ ⇒ luôn là bước thanh toán, kể cả khi nó được tạo ở lần mở app trước;
   *  - mất lựa chọn (danh mục gói vừa đổi, bậc đang chọn ngừng bán) ⇒ rơi về bước 1 thay vì đứng
   *    ở một form mà nút cuối cùng không có gì để mua.
   */
  const step: UpgradeStep =
    invoice && !editing
      ? 'payment'
      : reachedShopInfo && selection.selection
        ? 'shopInfo'
        : 'plan';

  /**
   * Được phép quay lại SỬA khi đang chờ chuyển khoản.
   *
   * Chỉ với hoá đơn CHƯA nhận đồng nào: `purchase()` ở server void hoá đơn `issued` rồi tạo mã
   * mới, nhưng với `partially_paid` thì nó TỪ CHỐI (`SUBSCRIPTION_INVOICE_PARTIALLY_PAID`) và
   * bắt chuyển nốt theo mã cũ — void một hoá đơn đã nhận tiền là xoá dấu vết khoản khách đã
   * chuyển. Giao diện phải nói cùng một luật, nếu không người dùng đi hết hai bước rồi mới ăn lỗi.
   */
  const canEditInvoice = invoice?.status === SUBSCRIPTION_INVOICE_STATUS.ISSUED;

  if (pending.isLoading) return <MiniRowsSkeleton rows={6} />;

  if (pending.isError && !pending.data) {
    return (
      <Callout tone="danger" title={t('upgrade.loadError')}>
        <RetryButton onPress={() => void pending.refetch()} />
      </Callout>
    );
  }

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            {t('upgrade.title')}
          </Text>

          {/*
            Chỉ dẫn bước RẤT GỌN: ba chặng, một dải. Không dựng một `Steps` có mô tả, đường nối và
            icon trạng thái — ở 360dp nó chiếm gần nửa chiều cao khung nhìn ngay phía trên thứ
            người dùng phải đọc.
          */}
          <XStack gap={space.xs}>
            {STEPS.map((name, index) => (
              <StepPill
                key={name}
                index={index}
                label={t(`upgrade.steps.${name}` as never)}
                current={name === step}
                done={index < STEPS.indexOf(step)}
                /*
                  Bước ĐÃ QUA chạm lùi được — nhưng chỉ khi chưa có hoá đơn.

                  Từ bước thanh toán thì không: hoá đơn đã tồn tại ở server với một mã đối soát mà
                  khách có thể đã chuyển khoản theo. Đổi gói lúc đó là phải huỷ nó, và huỷ là việc
                  của server chứ không phải hệ quả phụ của một cú chạm vào số "1".
                */
                {...(step === 'shopInfo' && name === 'plan'
                  ? { onPress: () => setReachedShopInfo(false) }
                  : {})}
              />
            ))}
          </XStack>
        </YStack>
      </Card>

      {/*
        Đang sửa trong khi một mã vẫn chờ tiền: nói thẳng hệ quả TRƯỚC khi họ chạm tạo hoá đơn
        mới, và chừa đường quay lại chính mã đó.
      */}
      {editing && invoice ? (
        <Callout tone="warning" title={t('upgrade.editWarnTitle', { code: invoice.code })}>
          <CalloutBody>{t('upgrade.editWarnBody')}</CalloutBody>
          <Button
            label={t('upgrade.backToInvoice')}
            variant="accent"
            icon="arrow-back-outline"
            size="sm"
            onPress={() => setEditing(false)}
          />
        </Callout>
      ) : null}

      <Card>{renderStep()}</Card>

      {/*
        Lối liên hệ là một ĐƯỜNG DẪN tới trung tâm hỗ trợ, không phải một số điện thoại gõ tay ở
        đây: kênh liên hệ thật của nền tảng đã sống ở một chỗ có tên, và một số chép lại là một số
        sẽ sai vào ngày ops đổi tổng đài.
      */}
      <Card>
        <XStack ai="center" gap={space.md}>
          <YStack w={40} h={40} br={radius.md} bg={colors.surfaceMuted} ai="center" jc="center">
            <Ionicons
              name="headset-outline"
              size={iconSize.lg}
              color={colors.primaryActive}
              accessibilityElementsHidden
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('upgrade.supportTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('upgrade.supportBody')}
            </Text>
          </YStack>
        </XStack>
        <YStack pt={space.sm}>
          <Button
            label={t('upgrade.supportCta')}
            variant="accent"
            icon="headset-outline"
            size="sm"
            onPress={() => navigateOnce(ROUTES.support.home())}
          />
        </YStack>
      </Card>
    </YStack>
  );

  /**
   * Thân của bước đang mở.
   *
   * Một HÀM TRẢ JSX, không phải một component khai báo trong thân render: một component như vậy
   * mang identity mới ở mỗi lần render, nên React tháo và dựng lại cả cây con — tức là form ở
   * bước 2 mất sạch nội dung vừa gõ mỗi khi có gì đó ở trên render lại.
   */
  function renderStep(): ReactNode {
    if (step === 'payment' && invoice) {
      return (
        <YStack gap={space.md}>
          <InvoiceWaitingPanel invoice={invoice} />
          {/*
            Lối SỬA cho người chọn nhầm gói. Chỉ mở khi hoá đơn chưa nhận đồng nào — đã nhận một
            phần thì server từ chối tạo mã mới, và một nút dẫn tới lỗi đó là một nút nói dối.
          */}
          {canEditInvoice ? (
            <Button
              label={t('upgrade.editInvoice')}
              variant="accent"
              icon="create-outline"
              size="sm"
              onPress={() => setEditing(true)}
            />
          ) : null}
        </YStack>
      );
    }

    const chosen = selection.selection;
    if (step === 'shopInfo' && chosen) {
      return (
        <UpgradeShopInfoStep
          planSummary={t('upgrade.chosenPlan', {
            plan: selection.selected?.plan.name ?? '',
            months: chosen.body.termMonths,
            amount: fmt.money(String(chosen.total)),
          })}
          submitting={purchase.isPending}
          purchaseError={purchase.isError ? errorMessage(purchase.error) : null}
          onBack={() => setReachedShopInfo(false)}
          /*
           * Hoá đơn tạo SAU khi cả hồ sơ lẫn chi nhánh đã lưu xong — `onSaved` chỉ chạy ở nhánh
           * thành công. Lưu hỏng mà vẫn tạo hoá đơn là bán một gói cho một gian hàng chưa có mặt
           * tiền, và cổng đăng xe sẽ từ chối họ ngay sau khi tiền về.
           *
           * Không truyền giá: server đọc lại bảng giá của chính bậc + kỳ hạn này (ADR 0041 điều 2).
           *
           * `setEditing(false)` ngay khi hoá đơn mới về: không có nó, cờ sửa còn bật sẽ che mất
           * chính màn thanh toán của mã vừa tạo.
           */
          onSaved={() => purchase.mutate(chosen.body, { onSuccess: () => setEditing(false) })}
        />
      );
    }

    /*
     * Bảng giá và quy chế sàn dùng CHUNG với bước 2 của onboarding gian hàng trả phí. Khác biệt
     * nằm ở khu HÀNH ĐỘNG: ở đây nó là một dải có tổng tiền, ghi chú bảo mật và bước kế tiếp, và
     * cú chạm mở bước hồ sơ chứ KHÔNG tạo hoá đơn — tiền là việc của bước sau, sau khi mặt tiền
     * gian hàng đã đủ.
     */
    return (
      <YStack gap={space.md}>
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            {t('upgrade.planTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('upgrade.planSubtitle')}
          </Text>
        </YStack>

        <PlanPickerPanel
          plans={plans}
          state={selection}
          submitting={false}
          errorText={null}
          showSubmit={false}
          copy={{ loadError: t('purchase.loadError'), empty: t('purchase.empty') }}
          onSubmit={() => setReachedShopInfo(true)}
        />

        {/*
          Dải chốt đơn chỉ hiện khi đã chọn một bậc: trước đó không có tổng nào để nói, và một dải
          rỗng nằm sẵn chỉ chiếm chỗ của thứ người dùng đang đọc.
        */}
        {selection.planId != null ? (
          <YStack gap={space.sm} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('upgrade.totalLabel')}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                col={colors.price}
                fos={fontSize.h4}
                fow={fontWeight.bold}
              >
                {selection.total == null ? '—' : fmt.money(String(selection.total))}
              </Text>
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.label} ta="right">
              {selection.termMonths == null
                ? t('purchase.pickTerm')
                : t('upgrade.totalFor', { months: selection.termMonths })}
            </Text>

            <XStack gap={space.xs} ai="flex-start">
              <Ionicons
                name="shield-checkmark-outline"
                size={iconSize.sm}
                color={colors.success}
                accessibilityElementsHidden
              />
              <YStack f={1} minWidth={0}>
                <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                  {t('upgrade.secureTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('upgrade.secureHint')}
                </Text>
              </YStack>
            </XStack>

            <Button
              label={t('upgrade.continue')}
              icon="arrow-forward-outline"
              disabled={!selection.selection}
              onPress={() => setReachedShopInfo(true)}
            />
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('upgrade.nextStep')}
            </Text>
          </YStack>
        ) : null}
      </YStack>
    );
  }
}

/** Một chặng trên dải chỉ dẫn bước — số thứ tự + nhãn, đổi sắc theo trạng thái. */
function StepPill({
  index,
  label,
  current,
  done,
  onPress,
}: {
  index: number;
  label: string;
  current: boolean;
  done: boolean;
  onPress?: () => void;
}) {
  const active = current || done;
  const body = (
    <XStack
      f={1}
      ai="center"
      gap={space.xs}
      py={space.xs}
      px={space.sm}
      br={radius.sm}
      bg={current ? colors.primaryLight : colors.surfaceMuted}
    >
      <YStack
        w={20}
        h={20}
        br={10}
        ai="center"
        jc="center"
        bg={active ? colors.primaryActive : colors.border}
      >
        <Text col={active ? colors.onPrimary : colors.textMuted} fos={fontSize.label} fow={fontWeight.bold}>
          {index + 1}
        </Text>
      </YStack>
      <Text
        f={1}
        col={current ? colors.text : colors.textMuted}
        fos={fontSize.label}
        fow={current ? fontWeight.semibold : fontWeight.medium}
        numberOfLines={2}
      >
        {label}
      </Text>
    </XStack>
  );

  if (!onPress) return body;
  return (
    <XStack f={1} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </XStack>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  const tCommon = useTranslations('Common.actions');
  return <Button label={tCommon('retry')} variant="secondary" size="sm" onPress={onPress} />;
}
