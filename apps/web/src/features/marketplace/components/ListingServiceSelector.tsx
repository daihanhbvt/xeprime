'use client';

import { Segmented } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SERVICE_TYPE, serviceTypeLabel } from '@xeprime/types';

/**
 * Bộ chọn dịch vụ trên trang chi tiết xe (17/08) — client island nhỏ cạnh khối giá.
 *
 * Ghi `?serviceType=` bằng router.replace: trang chi tiết là server component nên khối giá
 * lớn re-render theo dịch vụ mới, và props truyền vào popup thuê cũng đổi theo — selector,
 * giá và popup không bao giờ nói ba dịch vụ khác nhau. Rời `with_driver` thì `routeType`
 * (ngữ cảnh có tài xế) bị xoá khỏi URL.
 */
export function ListingServiceSelector({
  services,
  active,
}: {
  services: readonly string[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (services.length <= 1) return null;

  return (
    <Segmented
      value={active}
      onChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('serviceType', String(value));
        if (value !== SERVICE_TYPE.WITH_DRIVER) params.delete('routeType');
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      options={services.map((value) => ({ value, label: serviceTypeLabel(value) }))}
      aria-label="Chọn dịch vụ thuê"
    />
  );
}
