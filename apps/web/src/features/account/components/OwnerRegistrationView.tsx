'use client';

import { CarOutlined, PlusOutlined, ShoppingOutlined, SolutionOutlined } from '@ant-design/icons';
import { Alert, Button, Result, Skeleton, Steps } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  isEstablishedPackageShop,
  missingShopProfileRequirements,
  SHOP_PROFILE_REQUIREMENT,
  type ShopProfileRequirement,
  type VehiclePublicStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import {
  ACCOUNT_SECTION,
  ROUTES,
  accountSectionPath,
  ownerVehiclePath,
  type AccountSection,
} from '@/constants/routes';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useVehicles } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';

import { AccountPageHeader } from './AccountPageHeader';
import styles from './OwnerRegistrationView.module.css';

/**
 * Xe đang trên đường lên chợ, hoặc vừa bị trả về — bốn trạng thái này là "việc đang chạy hoặc
 * đang chờ chính chủ xe", không phải nháp bỏ quên.
 *
 * `draft` có mặt ở đây từ 14/09/2026, và đó là một sửa lỗi thật: với MỘT cổng duyệt, chiếc xe
 * nháp là thứ duy nhất đứng giữa chủ xe và marketplace. Bản cũ giấu nó đi, nên người vừa lưu
 * nháp xong mở màn tiến trình lên và không thấy chiếc xe của mình ở đâu cả.
 */
const IN_FLIGHT: readonly VehiclePublicStatus[] = [
  VEHICLE_PUBLIC_STATUS.DRAFT,
  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.REJECTED,
];

/**
 * Mục bắt buộc còn thiếu → section của "Hồ sơ chủ xe" nơi điền nó. Họ tên ở khối thông tin chủ xe,
 * SĐT là SĐT ĐĂNG NHẬP đã xác thực (đổi qua OTP), tỉnh ở địa chỉ. Tên trên chợ CHÍNH LÀ họ tên
 * chủ xe (ADR 0054) — nên mục đó cũng dẫn về khối thông tin chủ xe.
 * `Record` đầy đủ: thêm một mục bắt buộc mà quên chỗ điền sẽ đỏ ngay ở đây.
 */
const REQUIREMENT_SECTION: Readonly<Record<ShopProfileRequirement, AccountSection>> = {
  [SHOP_PROFILE_REQUIREMENT.OWNER_NAME]: ACCOUNT_SECTION.PROFILE,
  [SHOP_PROFILE_REQUIREMENT.OWNER_PHONE]: ACCOUNT_SECTION.LOGIN,
  [SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME]: ACCOUNT_SECTION.PROFILE,
  [SHOP_PROFILE_REQUIREMENT.PROVINCE]: ACCOUNT_SECTION.ADDRESS,
};

/**
 * Màn TIẾN TRÌNH ĐĂNG KÝ chủ xe — cửa duy nhất của bậc `registering`, và cũng là màn "Hồ sơ chủ
 * xe" của chủ xe đã xong vòng đăng ký.
 *
 * ## Ba bước, và bước 1 KHÔNG còn chờ ai duyệt (ADR 0036)
 *
 * Bản trước vẽ bước 1 là *"hồ sơ chủ xe — nền tảng duyệt"* và chỉ tính là xong khi
 * `tenants.status === 'active'`. Với tuyến hoa hồng, cột đó nay `active` ngay từ lúc mở hồ sơ, và
 * vòng duyệt duy nhất nằm ở bước 3. Giữ nguyên cách chấm cũ thì bước 1 luôn xanh và màn hình mất
 * khả năng nói cho chủ xe biết hồ sơ của họ còn thiếu gì.
 *
 * Nên bước 1 giờ chấm theo thứ nó THẬT SỰ đại diện: hồ sơ đã khai đủ trường bắt buộc chưa
 * (`missingShopProfileRequirements` — cùng hàm mà backend dùng làm cổng).
 *
 *  1. **Hồ sơ chủ xe** — chủ xe khai; xong khi đủ trường bắt buộc.
 *  2. **Đăng xe & gửi duyệt** — chủ xe khai và tự bấm gửi. Một nút, một lần.
 *  3. **Lên chợ** — nền tảng duyệt XE; `publicVehicleCount > 0` là lúc bậc đổi sang `owner` và
 *     menu chủ xe đầy đủ hiện ra.
 *
 * ## Màn này KHÔNG còn chứa form hồ sơ (06/10/2026)
 *
 * Hồ sơ sửa ở MỘT chỗ: "Hồ sơ chủ xe" (`/account` — `OwnerProfilePage`), nơi hồ sơ cá nhân và
 * trang chủ xe đã gộp làm một. Màn này là trang chủ ở bậc `registering` và chỉ trả lời "tôi đang ở
 * bước nào": bước 1 chưa xong thì một dải dẫn sang đó. Hai bản form của cùng bộ trường là hai chỗ
 * để checklist lệch khỏi `missingShopProfileRequirements` — đúng lỗi mà bản cũ đã phải tránh.
 */
export function OwnerRegistrationView() {
  const t = useTranslations('Account.registration');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const { paths } = useWorkspace();
  const router = useRouter();
  const { data: user } = useCurrentUser();

  /*
   * GIAN HÀNG TRẢ PHÍ KHÔNG BAO GIỜ THẤY MÀN NÀY (ADR 0040).
   *
   * `resolveWorkspaceHref` đã không dẫn họ tới đây, nhưng route vẫn gõ tay được — và một gian
   * hàng vừa hết gói thì `resolveOwnerStage` chấm là `registering` ngay khi chiếc xe cuối rời
   * chợ, nên `OwnerGate` cho họ qua. Màn này kể một câu chuyện ba bước dành cho người CHƯA bắt
   * đầu ("Hồ sơ chủ xe → Đăng xe đầu tiên → Lên chợ"); với một gian hàng 10 xe vừa cần gia hạn
   * thì đó là câu chuyện sai hoàn toàn.
   *
   * Điều hướng, không phải render một màn lỗi: họ có một khu làm việc hợp lệ, chỉ là không phải
   * khu này. `replace` để nút Quay lại không rơi vào đúng URL vừa bị đẩy ra.
   */
  const wrongWorkspace = isEstablishedPackageShop(user?.tenant);
  useEffect(() => {
    if (wrongWorkspace) router.replace(paths.vehicles);
  }, [wrongWorkspace, paths.vehicles, router]);

  const canView = has(PERMISSION.TENANT_VIEW);

  const { data: shop, isLoading, isError, refetch } = useMyShop(canView);
  /*
   * Chỉ cần BIẾT có xe nào và xe đang ở đâu, không cần bộ lọc URL của trang danh sách — nên gọi
   * thẳng `useVehicles` với trang đầu thay vì kéo `useVehicleFilters` vào một màn không có ô lọc.
   */
  const vehicles = useVehicles({ page: 1, limit: 20 });

  // Đang bị đẩy sang khu đúng của họ (effect ở trên) — không dựng gì của màn này.
  if (wrongWorkspace) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError && !shop) {
    return (
      <Result
        status="error"
        title={t('loadError')}
        extra={
          <Button type="primary" onClick={() => void refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  if (isLoading || !shop) {
    return (
      <div className={styles.page}>
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  const items: VehicleListItem[] = vehicles.data?.items ?? [];
  const publicCount = items.filter(
    (v) => v.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  ).length;
  const inFlight = items.filter((v) => IN_FLIGHT.includes(v.publicStatus as VehiclePublicStatus));

  /*
   * Bước 1 chấm theo HỒ SƠ ĐỦ, không theo một lần duyệt. Tỉnh hiệu lực nằm ở chi nhánh mặc định
   * — hai cột trên hồ sơ chỉ là bản sao, nên chấm theo bản sao là chấm nhầm nguồn (cùng thứ tự
   * ưu tiên mà `TenantsService.submitForReview` dùng).
   */
  const missing = missingShopProfileRequirements({
    // Mặt tiền cá nhân: tên khách thấy là họ tên tài khoản chủ (`storefrontIdentity`, ADR 0054).
    displayName: shop.ownerAccount.displayName,
    provinceCode: shop.defaultBranch?.provinceCode ?? shop.profile.provinceCode,
    // Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026) — cùng nguồn mà cổng gửi duyệt ở backend
    // dùng. Ba cột sao chép trên hồ sơ đã bị gỡ.
    ownerFullName: shop.ownerAccount.displayName,
    ownerPhone: shop.ownerAccount.phone,
  });
  const profileDone = missing.length === 0;
  // CTA đưa thẳng tới mục ĐẦU TIÊN còn thiếu, không bắt người dùng đi tìm trong sáu section.
  const firstMissing = missing[0];
  const profileCtaHref = firstMissing
    ? accountSectionPath(REQUIREMENT_SECTION[firstMissing])
    : ROUTES.MANAGE.ACCOUNT;
  const hasVehicle = items.length > 0;
  /*
   * Bước ĐANG mở, không phải "số bước đã xong": chừng nào chưa có xe nào trên chợ thì việc của
   * người dùng vẫn nằm ở bước 2, kể cả khi hồ sơ đã đủ.
   */
  const current = !profileDone ? 0 : publicCount > 0 ? 2 : 1;

  return (
    <div className={styles.page}>
      <AccountPageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        extra={
          <>
            <Link href={ROUTES.MANAGE.ACCOUNT}>
              <Button icon={<SolutionOutlined />}>{t('editProfile')}</Button>
            </Link>
            {hasVehicle ? (
              <Link href={paths.vehicleNew}>
                <Button icon={<PlusOutlined />}>{t('steps.vehicle.addMore')}</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <Steps
        className={styles.steps}
        current={current}
        direction="vertical"
        items={[
          {
            title: t('steps.profile.title'),
            description: t('steps.profile.description'),
            icon: <SolutionOutlined />,
          },
          {
            title: t('steps.vehicle.title'),
            description: t('steps.vehicle.description'),
            icon: <CarOutlined />,
          },
          {
            title: t('steps.live.title'),
            description: t('steps.live.description'),
            icon: <ShoppingOutlined />,
          },
        ]}
      />

      {/*
        Bước 1 chưa xong: dẫn thẳng tới "Hồ sơ chủ xe", nơi checklist nói đúng mục nào còn thiếu. Đặt
        TRƯỚC dải "chưa có xe" vì đó là thứ tự của ba bước.
      */}
      {!profileDone ? (
        <Alert
          className={styles.notice}
          type="warning"
          showIcon
          title={t('profileIncomplete.title')}
          description={t('profileIncomplete.body')}
          action={
            <Link href={profileCtaHref}>
              <Button type="primary" icon={<SolutionOutlined />}>
                {t('profileIncomplete.cta')}
              </Button>
            </Link>
          }
        />
      ) : null}

      {/*
        Chưa có xe nào: nói thẳng việc còn lại và dẫn tới wizard. Không phụ thuộc hồ sơ đã "duyệt"
        hay chưa nữa — chủ xe đăng được xe ngay, và bắt họ chờ một cái gật đầu không tồn tại là
        đúng bế tắc mà ADR 0036 gỡ.
      */}
      {!hasVehicle ? (
        <Alert
          className={styles.notice}
          type="info"
          showIcon
          title={t('noVehicle.title')}
          description={t('noVehicle.body')}
          action={
            <Link href={paths.vehicleNew}>
              <Button type="primary" icon={<PlusOutlined />}>
                {t('noVehicle.cta')}
              </Button>
            </Link>
          }
        />
      ) : null}

      {/*
        Xe đang trên đường lên chợ — danh sách NGẮN, chỉ trạng thái và lối vào sửa. Đây không phải
        bản thứ hai của `/account/vehicles`: nó chỉ trả lời "chiếc xe tôi vừa khai đang ở đâu",
        câu hỏi duy nhất người mới đăng ký có trong đầu.

        Lý do người duyệt trả xe về đi kèm ngay tại dòng đó: bắt chủ xe mở từng chiếc để tìm xem
        mình sai chỗ nào là biến một câu trả lời thành một cuộc đi tìm.
      */}
      {inFlight.length > 0 ? (
        <section className={styles.queue} aria-label={t('queue.title')}>
          <h2 className={styles.queueTitle}>{t('queue.title')}</h2>
          <ul className={styles.queueList}>
            {inFlight.map((vehicle) => (
              <li key={vehicle.id} className={styles.queueItem}>
                <Link href={ownerVehiclePath.detail(vehicle.id)} className={styles.queueName}>
                  {vehicle.name}
                </Link>
                <StatusTag
                  value={vehicle.publicStatus as VehiclePublicStatus}
                  meta={VEHICLE_PUBLIC_STATUS_META}
                  group="vehiclePublicStatus"
                />
                {vehicle.latestPublicReview?.reason ? (
                  <p className={styles.queueReason}>{vehicle.latestPublicReview.reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
