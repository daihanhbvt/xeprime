'use client';

import { Form } from 'antd';
import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
import type { PolicySection } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { PolicySectionCard } from '@/features/rental-policies/components/ShopPolicyBlocks';
import type { VehiclePricingFormApi } from '@/features/rental-policies/hooks/use-vehicle-pricing-form';
import type { PolicyFormValues } from '@/features/rental-policies/schema';
import { useAvailableHref } from '@/features/tenant-support/support-session';

/** Các ô của một mục, nối với ĐÚNG form: form của xe, hoặc bản chỉ đọc của gian hàng khi kế thừa. */
export interface SectionBinding {
  control: Control<PolicyFormValues>;
  disabled: boolean;
  inherited: boolean;
}

/**
 * Thẻ một mục chính sách ở màn sửa xe (ADR 0112 điều 1): cùng thẻ với trang Chính sách thuê, cộng
 * công tắc "Áp dụng chính sách của gian hàng" của RIÊNG mục đó. Đang kế thừa ⇒ các ô vẽ số của gian
 * hàng và khoá; tắt công tắc ⇒ các ô của xe mở ra để sửa. Chủ xe tuyến hoa hồng (chế độ `direct`)
 * không có trang chính sách gian hàng nên không có công tắc - sửa thẳng.
 */
export function VehiclePolicySection({
  api,
  section,
  canUpdate,
  id,
  title,
  titleExtra,
  subtitle,
  badge,
  children,
}: {
  api: VehiclePricingFormApi;
  section: PolicySection;
  canUpdate: boolean;
  id?: string;
  title: string;
  titleExtra?: ReactNode;
  subtitle?: ReactNode;
  badge?: (binding: SectionBinding) => ReactNode;
  children: (binding: SectionBinding) => ReactNode;
}) {
  const available = useAvailableHref();
  const inherited = api.isInherited(section);
  const binding: SectionBinding = {
    control: (inherited ? api.shopForm.control : api.form.control) as unknown as Control<
      PolicyFormValues
    >,
    disabled: !canUpdate || inherited,
    inherited,
  };
  return (
    <PolicySectionCard
      id={id}
      title={title}
      titleExtra={titleExtra}
      subtitle={subtitle}
      badge={badge?.(binding)}
      inherit={
        api.direct
          ? undefined
          : {
              checked: inherited,
              disabled: !canUpdate || api.submitting,
              onChange: (next) => api.setSectionInherited(section, next, title),
              policiesHref: available(ROUTES.MANAGE.SHOP_POLICIES),
            }
      }
    >
      {/*
        Đổi nguồn (form xe ↔ bản của gian hàng) là một bộ ô KHÁC: dựng lại thay vì để `useController`
        giữ đăng ký với form cũ.
      */}
      <Form
        key={inherited ? 'shop' : 'own'}
        component={false}
        layout="vertical"
        colon={false}
        disabled={binding.disabled}
      >
        {children(binding)}
      </Form>
    </PolicySectionCard>
  );
}

