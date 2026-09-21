'use client';

import { ArrowRightOutlined, CustomerServiceOutlined, SafetyOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';

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
import styles from './PackageUpgradeWizard.module.css';

/** Ba chặng của luồng nâng cấp, theo đúng thứ tự người dùng đi qua. */
const STEPS = ['plan', 'shopInfo', 'payment'] as const;
type UpgradeStep = (typeof STEPS)[number];

/**
 * Đích của CTA "Nâng cấp lên gian hàng" ở khối gói phía trên — `SubscriptionWorkspace` cuộn tới
 * đây. Hằng số dùng chung nên hai nơi không gõ tay cùng một chuỗi `id`: gõ sai là một nút cuộn
 * về hư không, và không có gì đỏ lên để báo.
 */
export const UPGRADE_TITLE_ID = 'xp-package-upgrade';

/**
 * NÂNG CẤP từ chủ xe tuyến hoa hồng lên gian hàng tuyến gói — ba bước, trên `/account/subscription`
 * (ADR 0028 điều 1 · ADR 0040).
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
 * tenant/chi nhánh/ví nào, và không đi qua `/manage/onboarding?track=package` — cột
 * `tenants.onboarding_state` của họ cũng KHÔNG bị client đụng tới (ADR 0040 điều 3: mốc hoàn tất
 * onboarding ghi trong CHÍNH transaction kích hoạt gói ở server). Bước 2 chỉ SỬA hồ sơ đang có.
 *
 * ## Bước 3 đến từ SERVER, không từ state
 *
 * Màn thanh toán hiện ra vì `GET /subscription/invoices/pending` trả về một hoá đơn, không vì
 * component nhớ rằng mình vừa bấm nút. Đó là lý do nó sống qua F5, qua việc đóng trình duyệt, và
 * qua một lần đăng nhập ở máy khác — với đúng mã đối soát cũ. Một `useState` ở đây sẽ mời người
 * dùng tạo hoá đơn thứ hai cho cùng một khoản.
 */
export function PackageUpgradeWizard() {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  /**
   * Người dùng chủ động quay lại SỬA trong khi đang có hoá đơn chờ.
   *
   * Đây là ngoại lệ DUY NHẤT của luật "bước đến từ server", và nó phải tường minh: mặc định hoá
   * đơn chờ luôn thắng, vì đó là thứ giữ cho màn thanh toán sống qua F5. Chỉ một cú bấm có chủ
   * ý ("Chọn lại gói") mới mở lại hai bước trước, và nó đi kèm cảnh báo mã cũ sẽ bị huỷ.
   */
  const [editing, setEditing] = useState(false);
  /** Bước người dùng đã bấm tới. Bước THẬT vẫn do dữ liệu quyết định — xem `step`. */
  const [reachedShopInfo, setReachedShopInfo] = useState(false);

  const pending = usePendingInvoice();
  const invoice = pending.data ?? null;
  /*
   * Danh mục gói chỉ tải khi bảng giá thật sự sắp hiện ra: chưa có hoá đơn chờ, HOẶC người dùng
   * vừa bấm "Chọn lại gói". Khi đang đứng ở màn chuyển khoản thì bảng giá không còn là thứ họ
   * đang quyết định, và một request nữa lúc đó chỉ làm màn thanh toán hiện ra chậm hơn.
   *
   * Thiếu vế `editing`, bấm "Chọn lại gói" sẽ mở ra một bảng giá RỖNG kèm câu "Chưa có gói nào
   * đang bán" — query vẫn tắt vì hoá đơn cũ chưa mất đi đâu cả.
   */
  const plans = useTenantPlans(!pending.isLoading && (invoice === null || editing));
  const selection = usePlanPurchase(plans.data ?? []);
  const purchase = usePurchaseSubscription();

  /*
   * Tiền về ⇒ hỏi lại `/auth/me`. Kích hoạt gói là việc của webhook SePay, và khi nó xong thì
   * tenant này thuộc về cổng quản lý: `shopAccountRedirect` đưa họ thẳng sang trang Cửa hàng,
   * section "Gói & hạn mức". Thiếu lượt làm mới đó, màn thanh toán lặng lẽ quay về bảng giá —
   * hoá đơn hết "chờ" trong khi scope vẫn nói họ ở tuyến hoa hồng.
   */
  useSyncScopeWhenInvoiceSettles();

  /*
   * Bước hiện tại là một hàm của DỮ LIỆU, không phải một biến state độc lập:
   *  - có hoá đơn chờ ⇒ luôn là bước thanh toán, kể cả khi nó được tạo ở tab khác hay ở lần truy
   *    cập trước;
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

  /** Đang ở bước hồ sơ ⇒ lùi về bảng giá là an toàn. */
  const canGoBackToPlan = step === 'shopInfo';

  if (pending.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (pending.isError && !pending.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('upgrade.loadError')}
        action={
          <Button size="small" onClick={() => void pending.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <section className={styles.wizard} aria-labelledby={UPGRADE_TITLE_ID}>
      <div className={styles.stepsCard}>
        {/*
          `tabIndex={-1}` để CTA ở khối gói phía trên ĐẶT ĐƯỢC TIÊU ĐIỂM vào đây, không chỉ cuộn
          tới. Cuộn không thôi thì người dùng bàn phím vẫn đứng ở nút cũ và phím Tab tiếp theo đưa
          họ đi chỗ khác — tức là CTA chỉ làm nửa việc nó hứa.
        */}
        <h2 id={UPGRADE_TITLE_ID} className={styles.title} tabIndex={-1}>
          {t('upgrade.title')}
        </h2>

        {/*
          Chỉ dẫn bước RẤT GỌN: ba chặng, một dòng. Không dùng `Steps` của AntD — nó vẽ mô tả,
          đường nối và icon trạng thái cho một luồng ba bước, và chiếm gần nửa chiều cao khung
          nhìn trên điện thoại ngay phía trên thứ người dùng phải đọc.
        */}
        <ol className={styles.steps}>
          {STEPS.map((name, index) => {
            const body = (
              <>
                <span className={styles.stepIndex} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.stepLabel}>{t(`upgrade.steps.${name}`)}</span>
              </>
            );
            return (
              <li
                key={name}
                className={cx(
                  styles.step,
                  name === step && styles.stepCurrent,
                  index < STEPS.indexOf(step) && styles.stepDone,
                )}
                aria-current={name === step ? 'step' : undefined}
              >
                {/*
                  Bước ĐÃ QUA bấm lùi được — nhưng chỉ khi chưa có hoá đơn.

                  Từ bước thanh toán thì không: hoá đơn đã tồn tại ở server với một mã đối soát
                  mà khách có thể đã chuyển khoản theo. Đổi gói lúc đó là phải huỷ nó, và huỷ là
                  việc của server chứ không phải hệ quả phụ của một cú bấm vào số "1".
                */}
                {canGoBackToPlan && name === 'plan' ? (
                  <button
                    type="button"
                    className={styles.stepBack}
                    onClick={() => setReachedShopInfo(false)}
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/*
        Đang sửa trong khi một mã vẫn chờ tiền: nói thẳng hệ quả TRƯỚC khi họ bấm tạo hoá đơn mới,
        và chừa đường quay lại chính mã đó.
      */}
      {editing && invoice ? (
        <Alert
          type="warning"
          showIcon
          title={t('upgrade.editWarnTitle', { code: invoice.code })}
          description={t('upgrade.editWarnBody')}
          action={
            <Button size="small" onClick={() => setEditing(false)}>
              {t('upgrade.backToInvoice')}
            </Button>
          }
        />
      ) : null}

      {renderStep()}

      {/*
        Lối liên hệ là một LIÊN KẾT tới trung tâm hỗ trợ, không phải một số điện thoại gõ tay ở
        đây: kênh liên hệ thật của nền tảng đã sống ở một chỗ có tên, và một số chép lại là một số
        sẽ sai vào ngày ops đổi tổng đài.
      */}
      <div className={styles.support}>
        <span className={styles.supportIcon} aria-hidden="true">
          <CustomerServiceOutlined />
        </span>
        <div className={styles.supportText}>
          <p className={styles.supportTitle}>{t('upgrade.supportTitle')}</p>
          <p className={styles.supportBody}>{t('upgrade.supportBody')}</p>
        </div>
        <Link href={ROUTES.SUPPORT} className={styles.supportAction}>
          <Button icon={<CustomerServiceOutlined />}>{t('upgrade.supportCta')}</Button>
        </Link>
      </div>
    </section>
  );

  /**
   * Thân của bước đang mở.
   *
   * Một HÀM TRẢ JSX, không phải một component lồng trong component: một component khai báo trong
   * thân hàm render mang identity mới ở mỗi lần render, nên React tháo và dựng lại cả cây con —
   * tức là form ở bước 2 mất sạch nội dung vừa gõ mỗi khi có gì đó ở trên re-render.
   */
  function renderStep(): ReactNode {
    /*
      Bước 2 và 3 đi trong một thẻ trắng; bước 1 thì KHÔNG — ba thẻ bậc gói đã là ba thẻ, và một
      khung nữa bọc ngoài chúng là hai lớp viền cho cùng một nội dung.
    */
    if (step === 'payment' && invoice) {
      return (
        <div className={styles.stepCard}>
          <InvoiceWaitingPanel invoice={invoice} />
          {/*
            Lối SỬA cho người chọn nhầm gói. Chỉ mở khi hoá đơn chưa nhận đồng nào — đã nhận một
            phần thì server từ chối tạo mã mới, và một nút dẫn tới lỗi đó là một nút nói dối.
          */}
          {canEditInvoice ? (
            <div className={styles.paymentActions}>
              <Button onClick={() => setEditing(true)}>{t('upgrade.editInvoice')}</Button>
            </div>
          ) : null}
        </div>
      );
    }

    const chosen = selection.selection;
    if (step === 'shopInfo' && chosen) {
      return (
        <div className={styles.stepCard}>
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
             * thành công. Lưu hỏng mà vẫn tạo hoá đơn là bán một gói cho một gian hàng chưa có
             * mặt tiền, và cổng đăng xe sẽ từ chối họ ngay sau khi tiền về.
             *
             * Không truyền giá: server đọc lại bảng giá của chính bậc + kỳ hạn này (ADR 0041 điều 2).
             */
            /*
             * `setEditing(false)` ngay khi hoá đơn mới về: không có nó, cờ sửa còn bật sẽ che
             * mất chính màn thanh toán của mã vừa tạo.
             */
            onSaved={() =>
              purchase.mutate(chosen.body, { onSuccess: () => setEditing(false) })
            }
          />
        </div>
      );
    }

    /*
     * Bảng giá và quy chế sàn dùng CHUNG với bước 2 của onboarding gian hàng trả phí. Khác biệt
     * nằm ở khu HÀNH ĐỘNG: ở đây nó là một dải có tổng tiền, ghi chú bảo mật và bước kế tiếp, và
     * cú bấm mở bước hồ sơ chứ KHÔNG tạo hoá đơn — tiền là việc của bước sau, sau khi mặt tiền
     * gian hàng đã đủ.
     */
    return (
      <div className={styles.stepCard}>
        <header className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>{t('upgrade.planTitle')}</h3>
          <p className={styles.sectionSubtitle}>{t('upgrade.planSubtitle')}</p>
        </header>

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
          Dải chốt đơn chỉ hiện khi đã chọn một bậc: trước đó không có tổng nào để nói, và một
          dải rỗng nằm sẵn chỉ chiếm chỗ của thứ người dùng đang đọc.
        */}
        {selection.planId != null ? (
          <div className={styles.checkoutBar}>
            <p className={styles.total} aria-live="polite">
              <span className={styles.totalLabel}>{t('upgrade.totalLabel')}</span>
              <span className={styles.totalValue}>
                {selection.total == null ? '—' : fmt.money(String(selection.total))}
              </span>
              <span className={styles.totalFor}>
                {selection.termMonths == null
                  ? t('purchase.pickTerm')
                  : t('upgrade.totalFor', { months: selection.termMonths })}
              </span>
            </p>

            <p className={styles.secure}>
              <SafetyOutlined aria-hidden="true" />
              <span>
                <strong>{t('upgrade.secureTitle')}</strong>
                <br />
                {t('upgrade.secureHint')}
              </span>
            </p>

            <div className={styles.checkoutAction}>
              <Button
                type="primary"
                size="large"
                disabled={!selection.selection}
                onClick={() => setReachedShopInfo(true)}
              >
                {t('upgrade.continue')} <ArrowRightOutlined aria-hidden="true" />
              </Button>
              <span className={styles.nextStep}>{t('upgrade.nextStep')}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}
