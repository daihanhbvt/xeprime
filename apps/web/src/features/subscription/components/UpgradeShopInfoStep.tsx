'use client';

import { Alert, Button, Form, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PackageShopListingRequirement } from '@xeprime/types';

import { AddressField } from '@/components/form/AddressField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { TextField } from '@/components/form/TextField';
import { useBranches, useUpdateBranch } from '@/features/branches/hooks/use-branches';
import type { Branch } from '@/features/branches/types';
import { ShopDisplayNameField, ShopLogoField } from '@/features/shop/components/ShopDisplayFields';
import { useMyShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import {
  SHOP_ADDRESS_FIELD_NAMES,
  SHOP_ADDRESS_PIN_NAMES,
} from '@/features/shop/shop-profile-form';
import type { MyShop } from '@/features/shop/types';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  missingShopUpgradeFields,
  toShopUpgradeBranchBody,
  toShopUpgradeProfileBody,
  useShopUpgradeForm,
} from '../shop-upgrade-form';
import styles from './UpgradeShopInfoStep.module.css';

interface UpgradeShopInfoStepProps {
  /** Một dòng nhắc lại bậc + kỳ hạn + tổng tiền vừa chọn — bước này không được làm quên mất nó. */
  planSummary: string;
  /** Hoá đơn đang được tạo (mutation của nơi gọi). */
  submitting: boolean;
  purchaseError: string | null;
  onBack: () => void;
  /** Hồ sơ VÀ chi nhánh đã lưu xong — nơi gọi tạo hoá đơn. */
  onSaved: () => void;
}

/**
 * BƯỚC 2 của luồng nâng cấp: hoàn thiện mặt tiền gian hàng trước khi xuất hoá đơn.
 *
 * ## Đây là SỬA hồ sơ đang có, không phải đăng ký
 *
 * Tenant, chi nhánh mặc định và xe đã tồn tại — `ShopRegistration`/`POST /tenants` không xuất
 * hiện ở đây dưới bất kỳ hình thức nào. Form nạp hồ sơ thật và điền sẵn TẤT CẢ; việc của chủ xe
 * thường chỉ còn là đọc lại và bổ sung số điện thoại liên hệ.
 *
 * ## Vì sao chỉ có năm ô
 *
 * Đúng bộ `missingPackageShopRegistrationFields` (tên · SĐT · tỉnh · số nhà) cộng logo. Loại
 * hình, email, mã số thuế, giấy phép kinh doanh, tài khoản ngân hàng và thông tin xe đều KHÔNG
 * hỏi lại: không mục nào trong số đó cần để một chiếc xe hiện đúng trên chợ, và mỗi ô thêm vào
 * một màn đang trên đường ra hoá đơn là một lần chặn người đang muốn trả tiền.
 *
 * ## Hai bảng, hai lượt ghi, một thứ tự
 *
 * Tên/địa chỉ/logo đi `PATCH /shop/profile`; SĐT liên hệ thuộc CHI NHÁNH MẶC ĐỊNH nên đi
 * `PATCH /branches/:id` (ADR 0040 — `missingPackageShopListingRequirements` đọc SĐT từ chi nhánh,
 * không từ hồ sơ). Hai lượt chạy NỐI TIẾP và hoá đơn chỉ được tạo khi cả hai xong: một gian hàng
 * vừa trả tiền mà thiếu SĐT sẽ bị chính cổng đăng xe của mình từ chối.
 */
export function UpgradeShopInfoStep(props: UpgradeShopInfoStepProps) {
  const t = useTranslations('Subscription.upgrade');
  const tCommon = useTranslations('Common');

  const shop = useMyShop(true);
  const branches = useBranches({}, true);

  if (shop.isLoading || branches.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;

  if (shop.isError || branches.isError || !shop.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('shopInfo.loadError')}
        action={
          <Button
            size="small"
            onClick={() => {
              void shop.refetch();
              void branches.refetch();
            }}
          >
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  /*
   * Chi nhánh MẶC ĐỊNH là nơi SĐT liên hệ sống — và câu trả lời của SERVER thắng.
   *
   * `shop.defaultBranch` chính là `findFirst({ isDefault: true })` phía backend, nên khớp theo id
   * của nó là hỏi đúng nguồn; cờ `isDefault` trong danh sách chỉ là vế dự phòng khi hồ sơ cũ chưa
   * mang khối đó. KHÔNG rơi về "chi nhánh đầu tiên": ghi SĐT công khai của gian hàng lên một chi
   * nhánh tuỳ ý là một câu trả lời SAI trong im lặng, trong khi "không có chi nhánh nào" là một
   * câu sai nói thành tiếng — và nó đã có nhánh xử lý ngay bên dưới.
   */
  const items = branches.data?.items ?? [];
  const defaultBranchId = shop.data.defaultBranch?.id;
  const branch =
    items.find((item) => item.id === defaultBranchId) ??
    items.find((item) => item.isDefault) ??
    null;

  if (!branch) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('shopInfo.noBranch')}
        description={t('shopInfo.noBranchHint')}
      />
    );
  }

  return <UpgradeShopInfoForm {...props} shop={shop.data} branch={branch} />;
}

/**
 * Tách khỏi phần tải dữ liệu vì React Hook Form phải khởi tạo với hồ sơ THẬT: gọi
 * `useShopUpgradeForm` trên một `shop` còn `undefined` nghĩa là form mở ra trống rồi mới được
 * nhét dữ liệu vào — và mọi ô người dùng kịp gõ trong khoảnh khắc đó sẽ bị ghi đè.
 */
function UpgradeShopInfoForm({
  planSummary,
  submitting,
  purchaseError,
  onBack,
  onSaved,
  shop,
  branch,
}: UpgradeShopInfoStepProps & { shop: MyShop; branch: Branch }) {
  const t = useTranslations('Subscription.upgrade');
  const tBranch = useTranslations('Branches');
  const tGate = useTranslations('Shop.listingGate');
  const errorMessage = useErrorMessage();

  const { control, handleSubmit } = useShopUpgradeForm(shop, branch);
  const updateProfile = useUpdateShopProfile();
  const updateBranch = useUpdateBranch();

  /** Mục bắt buộc còn thiếu theo LUẬT DÙNG CHUNG — xem `missingShopUpgradeFields`. */
  const [missing, setMissing] = useState<PackageShopListingRequirement[]>([]);

  const saving = updateProfile.isPending || updateBranch.isPending;

  const submit = handleSubmit(async (values) => {
    const gaps = missingShopUpgradeFields(values);
    setMissing(gaps);
    if (gaps.length > 0) return;

    /*
     * `mutateAsync` + try/catch: hoá đơn CHỈ được tạo khi cả hai lượt ghi thành công. Lưu hỏng
     * một nửa thì người dùng đọc lỗi, sửa và bấm lại — không có khoản tiền nào đi trước.
     *
     * CHI NHÁNH ghi TRƯỚC, có chủ đích. Client không làm hai request thành một transaction được,
     * nên thứ tự quyết định nửa nào sống sót khi lượt thứ hai hỏng:
     *
     *   chi nhánh trước → hỏng ở hồ sơ ⇒ chỉ có SĐT liên hệ được cập nhật. Không ai thấy.
     *   hồ sơ trước     → hỏng ở chi nhánh ⇒ địa chỉ CÔNG KHAI của gian hàng đã dời (backend
     *                     chuyển tiếp địa chỉ cho chi nhánh mặc định và đồng bộ lại vị trí xe
     *                     trên chợ) trong khi SĐT vẫn trống — một nửa trạng thái nhìn thấy được
     *                     từ ngoài chợ.
     */
    try {
      await updateBranch.mutateAsync({ id: branch.id, ...toShopUpgradeBranchBody(values) });
      await updateProfile.mutateAsync(toShopUpgradeProfileBody(shop, values));
    } catch {
      return;
    }
    onSaved();
  });

  return (
    <div className={styles.step}>
      <p className={styles.planSummary}>{planSummary}</p>

      <div className={styles.intro}>
        <h3 className={styles.title}>{t('shopInfo.title')}</h3>
        <p className={styles.introText}>{t('shopInfo.intro')}</p>
      </div>

      {missing.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('shopInfo.missingTitle')}
          description={
            <ul className={styles.missingList}>
              {missing.map((key) => (
                // Nhãn dựng từ MÃ, dùng chung với cổng đăng xe — không in `details.missing` thô.
                <li key={key}>{tGate(`items.${key}`)}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      {updateProfile.isError ? (
        <Alert type="error" showIcon title={errorMessage(updateProfile.error)} />
      ) : null}
      {purchaseError ? <Alert type="error" showIcon title={purchaseError} /> : null}

      {/*
        `<Form component={false}>` chỉ CẤP NGỮ CẢNH bố cục cho `Form.Item` (nhãn nằm TRÊN ô nhập,
        dấu bắt buộc đặt SAU nhãn) — form thật vẫn là thẻ `<form>` của React Hook Form bên dưới.
      */}
      <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
        <form onSubmit={submit} noValidate className={styles.form}>
          <fieldset disabled={saving || submitting} className={styles.fieldset}>
            <ShopDisplayNameField control={control} />

            <AddressField
              control={control}
              names={SHOP_ADDRESS_FIELD_NAMES}
              pin={SHOP_ADDRESS_PIN_NAMES}
              required
              /* Xã/phường không còn được hỏi ở form địa chỉ CÓ GHIM (ADR 0042). */
              wardRequired={false}
              disabled={saving || submitting}
            />

            {/*
              Nhãn và gợi ý lấy từ namespace của CHI NHÁNH — giá trị này lưu ở đó, nên câu chữ
              cũng thuộc về đó. Một bản dịch thứ hai cho cùng một ô là một chỗ để hai màn gọi cùng
              một con số bằng hai cái tên.
            */}
            <TextField
              control={control}
              name="contactPhone"
              type="tel"
              label={tBranch('form.phoneLabel')}
              placeholder={tBranch('form.phonePlaceholder')}
              help={t('shopInfo.phoneHelp')}
              required
            />

            <ShopLogoField control={control} help={t('shopInfo.logoHelp')} />
          </fieldset>

          <div className={styles.actions}>
            <Button onClick={onBack} disabled={saving || submitting}>
              {t('back')}
            </Button>
            <Button type="primary" size="large" htmlType="submit" loading={saving || submitting}>
              {t('submit')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
