'use client';

import { ArrowLeftOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Popover, Spin } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import {
  REGISTRATION_TRACK,
  SUBSCRIPTION_INVOICE_STATUS,
  registrationTrackOf,
  tenantUsesManagePortal,
} from '@xeprime/types';
import { Logo } from '@/components/brand/Logo';
import { REGISTRATION_TRACK_PARAM, ROUTES, shopWelcomePath } from '@/constants/routes';
import { isPackageOnboarding, resolveWorkspaceHref } from '@/features/auth/post-auth-destination';
import { safeNextPath } from '@/features/auth/safe-next';
import { ShopRegistration } from '@/features/shop/components/ShopRegistration';
import { PackageShopCheckout } from '@/features/subscription/components/PackageShopCheckout';
import { usePendingInvoice } from '@/features/subscription/hooks/use-subscription';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/services/query-keys';
import styles from './onboarding.module.css';

/**
 * ONBOARDING — nơi DUY NHẤT render form tạo hồ sơ người cho thuê xe, cho CẢ HAI TUYẾN.
 *
 * Chỉ tới được đây bằng ý định tường minh: CTA chủ xe ("Trở thành chủ xe" / "Đăng xe cho thuê")
 * hoặc CTA gian hàng ("Đăng ký gian hàng", mang `?track=package`). Trước kia form này bật tự
 * động trong `AppShell` cho mọi user chưa có tenant — đó chính là lý do khách thuê xe tưởng mình
 * bị bắt mở gian hàng.
 *
 * Trang tự dựng thanh trên cùng của riêng nó: `AppShell` liệt kê route này là "bare" (chưa vào
 * được cổng quản lý thì cũng chưa có gì để điều hướng trong sidebar).
 *
 * ## Máy trạng thái, và nó SUY TỪ SERVER (ADR 0040)
 *
 * | Trạng thái thật | Màn hiện ra |
 * | --- | --- |
 * | chưa có gian hàng, `?track=commission` (mặc định) | form hồ sơ chủ xe → `?next=` |
 * | chưa có gian hàng, `?track=package` | **bước 1**: tạo gian hàng trả phí |
 * | `onboardingState = package_pending` | **bước 2**: chọn gói → QR chuyển khoản |
 * | gói đã hiệu lực | chuyển tới `/manage/shop?welcome=1` |
 * | tuyến hoa hồng (đã có gian hàng) | chuyển tới khu của họ (`/account/registration`) |
 *
 * `?track=` CHỈ có nghĩa ở dòng đầu và dòng thứ hai — tức khi CHƯA có gian hàng. Sau đó nguồn là
 * `tenants.onboarding_state`, nên F5, đóng trình duyệt hay đăng nhập trên máy khác đều rơi đúng
 * bước còn nợ. Đây là toàn bộ điểm của ADR 0040: bốn cách phân biệt hai tuyến ở client (prop
 * component, query tạm, state router, "đã có gói hay chưa") đều chết sau một lần tải lại trang.
 *
 * ## Vì sao KHÔNG có nhánh "vừa thanh toán xong" trong state của trang
 *
 * Điều kiện điều hướng là `/auth/me` THẬT SỰ đã nhận tuyến gói, không phải "hoá đơn vừa biến
 * khỏi danh sách chờ". Hai thứ đó cách nhau một round-trip, và nhảy sang `/manage/shop` trong
 * khoảng đó nghĩa là `AppShell` đọc scope cũ rồi đá người dùng ngược ra — một vòng nhấp nháy
 * ngay sau khoảnh khắc họ vừa trả tiền. Nên trang chỉ LÀM MỚI scope khi thấy hoá đơn rời trạng
 * thái chờ, còn điều hướng thì đợi scope mới về.
 */
export default function OwnerOnboardingPage() {
  const t = useTranslations('ShopOnboarding');
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();

  const tenant = user?.tenant ?? null;
  const hasTenant = tenant != null;
  const packagePending = isPackageOnboarding(user);
  /** Gian hàng đã có gói hiệu lực — onboarding xong, không còn gì để làm ở đây. */
  const packageReady = hasTenant && !packagePending && tenantUsesManagePortal(tenant);

  /** Cửa vào, chỉ đọc khi chưa có gian hàng — xem bảng trong docblock. */
  const track = registrationTrackOf(params.get(REGISTRATION_TRACK_PARAM));
  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;

  /*
   * Đích sau khi tạo hồ sơ TUYẾN HOA HỒNG. `safeNextPath` chỉ nhận đường dẫn NỘI BỘ — tham số
   * này đến từ URL, nên nó là bề mặt open-redirect nếu tin thẳng.
   *
   * Mặc định là `/account/registration` TƯỜNG MINH, không phải `paths.ownerProfile`.
   *
   * `workspacePaths` mặc định về khu QUẢN LÝ khi chưa biết người dùng thuộc đâu, và ở đúng lúc
   * hàm này chạy thì họ CHƯA có gian hàng — nên bảng đó trả `/manage/shop`, tức là người vừa tạo
   * hồ sơ chủ xe bị đẩy vào cổng quản lý rồi bị `AppShell` đá ra. Một tenant tuyến hoa hồng vừa
   * tạo thì luôn làm việc ở `/account/registration`; nói thẳng ra rẻ hơn một phép suy đi qua một
   * bảng không có đủ thông tin để trả lời.
   *
   * Tuyến GÓI thì bỏ qua `next` hoàn toàn: sau bước 1 của họ luôn là bước 2 ngay trên trang này,
   * và tôn trọng một `?next=` ở đó sẽ đưa người vừa tạo gian hàng đi khỏi màn thanh toán.
   */
  const commissionNext = safeNextPath(params.get('next'), ROUTES.ACCOUNT.REGISTRATION);
  /** Đến từ luồng đăng xe → dùng chữ dành cho chủ xe cá nhân, không phải chữ "mở gian hàng". */
  const personalWording = commissionNext.startsWith(ROUTES.LIST_YOUR_VEHICLE.ROOT);

  useSyncScopeWhenInvoiceSettles(packagePending, queryClient);

  useEffect(() => {
    if (!hasTenant || packagePending) return;
    /*
     * Gói đã bật ⇒ trang Cửa hàng kèm dải chào; còn lại (tuyến hoa hồng, hoặc nhân viên) ⇒ khu
     * làm việc của chính họ.
     *
     * `resolveWorkspaceHref` chứ không `paths.home`: đây là phép giải CHUẨN của câu hỏi đó, và nó
     * đọc thẳng scope thật thay vì một bảng đường dẫn mà provider có thể chưa kịp cập nhật.
     * `replace` chứ không `push`: bấm Quay lại phải về chỗ trước đó, không quay lại một màn
     * onboarding đã xong việc rồi bị đẩy ra lần nữa.
     */
    router.replace(
      packageReady ? shopWelcomePath() : (resolveWorkspaceHref(user) ?? ROUTES.ACCOUNT.ROOT),
    );
  }, [hasTenant, packagePending, packageReady, router, user]);

  // Đang nạp scope, hoặc đã có gian hàng và effect ở trên đang điều hướng ra khỏi đây.
  if (isLoading || !user || (hasTenant && !packagePending)) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  /** Bước đang mở — chỉ tuyến GÓI có hai bước; tuyến hoa hồng là một màn duy nhất. */
  const showSteps = isPackageTrack || packagePending;
  const currentStep = packagePending ? 2 : 1;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={ROUTES.HOME} aria-label={t('page.homeAriaLabel')} className={styles.brand}>
          <Logo size="md" />
        </Link>

        {/*
          Nền tảng chưa có trang trợ giúp riêng, nên "Hướng dẫn" mở ngay nội dung tại chỗ thay vì
          trỏ tới một URL chết — mấy bước này là toàn bộ thứ người mở hồ sơ cần biết ở đây.
        */}
        <Popover
          trigger="click"
          placement="bottomRight"
          title={isPackageTrack || packagePending ? t('guide.packageTitle') : t('guide.title')}
          content={
            <ol className={styles.guideList}>
              {(isPackageTrack || packagePending
                ? (['createShop', 'pay', 'logo', 'publish'] as const)
                : (['create', 'complete', 'prepare', 'publish'] as const)
              ).map((step) => (
                <li key={step}>{t(`guide.steps.${step}`)}</li>
              ))}
            </ol>
          }
        >
          <Button type="text" icon={<QuestionCircleOutlined />} className={styles.guideButton}>
            {t('guide.trigger')}
          </Button>
        </Popover>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>
              {isPackageTrack || packagePending ? t('packagePage.title') : t('page.title')}
            </h1>
            <p className={styles.desc}>
              {isPackageTrack || packagePending ? t('packagePage.subtitle') : t('page.subtitle')}
            </p>
          </div>
          <div className={styles.heroArt} aria-hidden="true" />
        </div>
      </section>

      <main className={styles.content}>
        {/*
          Chỉ dẫn bước RẤT GỌN: hai chặng, một dòng. Không dùng `Steps` của AntD — nó vẽ mô tả,
          đường nối và icon trạng thái cho một luồng chỉ có hai bước, và chiếm gần nửa chiều cao
          khung nhìn trên điện thoại ngay phía trên thứ người dùng phải điền.
        */}
        {showSteps ? (
          <ol className={styles.steps} aria-label={t('steps.label')}>
            {([1, 2] as const).map((step) => (
              <li
                key={step}
                className={step === currentStep ? styles.stepCurrent : styles.step}
                aria-current={step === currentStep ? 'step' : undefined}
              >
                <span className={styles.stepIndex} aria-hidden="true">
                  {step}
                </span>
                <span>{t(step === 1 ? 'steps.shopInfo' : 'steps.planPayment')}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {packagePending ? (
          <section className={styles.checkout} aria-label={t('steps.planPayment')}>
            <PackageShopCheckout />
          </section>
        ) : (
          <ShopRegistration
            track={track}
            personalWording={!isPackageTrack && personalWording}
            prefill={{ name: user.displayName, phone: user.phone, email: user.email }}
            /*
             * Tuyến GÓI: `useRegisterShop` đã làm mới `/auth/me`, nên scope quay về mang
             * `package_pending` và trang tự chuyển sang bước 2 — không điều hướng đi đâu.
             * Tuyến hoa hồng thì đi tiếp đúng chỗ người dùng đang làm dở.
             */
            onCreated={isPackageTrack ? undefined : () => router.replace(commissionNext)}
          />
        )}

        <div className={styles.back}>
          <Link href={ROUTES.HOME}>
            <Button type="text" icon={<ArrowLeftOutlined />}>
              {t('page.back')}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

/**
 * Hoá đơn vừa RỜI trạng thái chờ ⇒ hỏi lại scope thật.
 *
 * Tiền về là webhook SePay lật hoá đơn `paid`, bật thuê bao và hoàn tất onboarding trong MỘT
 * transaction (ADR 0040). Client không biết điều đó xảy ra lúc nào, nên `usePendingInvoice` hỏi
 * lại theo nhịp và tự dừng khi hoá đơn tới trạng thái kết thúc. Lượt hỏi CUỐI CÙNG đó — lượt trả
 * về `null` — là tín hiệu duy nhất đáng tin, và hook này biến nó thành một lần làm mới
 * `/auth/me`. Điều hướng thì để `useEffect` ở trang lo, sau khi scope mới thật sự về.
 *
 * `seenAwaiting` là thứ phân biệt "vừa trả xong" với "chưa bao giờ tạo hoá đơn": cả hai đều cho
 * `data === null`, và làm mới scope ở ca thứ hai là một lượt gọi vô ích mỗi lần trang mở.
 *
 * Cũng chạy đúng khi hoá đơn hết hạn (`void`): scope không đổi, màn hình quay về bộ chọn gói.
 */
function useSyncScopeWhenInvoiceSettles(
  enabled: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  const pending = usePendingInvoice(enabled);
  const status = pending.data?.status ?? null;
  const awaiting =
    status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
    status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const seenAwaiting = useRef(false);

  useEffect(() => {
    if (awaiting) {
      seenAwaiting.current = true;
      return;
    }
    if (!seenAwaiting.current) return;
    seenAwaiting.current = false;
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  }, [awaiting, queryClient]);
}
