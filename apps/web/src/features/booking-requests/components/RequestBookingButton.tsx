'use client';

import { CarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { RequestBookingPrefill } from '../types';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  bookingDraftSavedAt,
  clearBookingDraft,
  serverBookingDraftSavedAt,
  subscribeBookingDraft,
} from '../booking-draft';
import { RequestBookingModal } from './RequestBookingModal';

/**
 * CTA vào luồng thuê + modal — client island nhúng vào trang chi tiết xe (Server Component).
 *
 * **Ranh giới thuật ngữ (Wave 11.1).** Nút này nói `Chọn thuê`, không phải `Yêu cầu thuê`: ở
 * bước này khách mới chọn chiếc xe muốn thuê, chưa gửi gì cả. Đặt tên hành động theo kết quả
 * cuối làm khách tưởng bấm là đã gửi yêu cầu. Còn `Yêu cầu thuê` vẫn là TÊN NGHIỆP VỤ của thực
 * thể — tiêu đề modal `Yêu cầu thuê xe` và nút chốt `Gửi yêu cầu thuê` giữ nguyên, vì đó mới là
 * lúc khách thật sự gửi đi.
 *
 * Chỉ trang CHI TIẾT xe mới có CTA này. Thẻ xe ở marketplace không mở luồng thuê: quyết định
 * thuê cần giá theo ngày, chính sách cọc và điều kiện giao nhận — những thứ chỉ có ở trang chi
 * tiết.
 *
 * `listing` truyền xuống khi nơi gọi ĐÃ có hồ sơ xe đầy đủ, để modal khỏi tải lại.
 *
 * Icon để `aria-hidden`: `@ant-design/icons` render ra `<span role="img" aria-label="car">`, và
 * nếu không ẩn thì tên khả truy cập của nút thành `car Chọn thuê` — trình đọc màn hình đọc thừa
 * một từ vô nghĩa, và mọi truy vấn theo nhãn nút đều trượt.
 *
 * **Quay về sau đăng nhập** (ADR 0060). Khách chưa đăng nhập mở hộp thì luồng kiểm chuyến, giữ bản
 * nháp cho xe này (`booking-draft.ts`) rồi mời đăng nhập. Google/Facebook RỜI TRANG và quay về
 * đúng trang xe — có bản nháp của xe này + đã có phiên thì hộp tự mở lại, và luồng bên trong đi
 * tiếp từ bản nháp. Khách tự đóng hộp ⇒ bỏ bản nháp: lần ghé trang sau không bị hộp bật lên.
 */
export function RequestBookingButton({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing,
  pickupAt,
  returnAt,
  serviceType,
  routeType,
  deliveryProvinceCode,
  prefill,
  beforeOpen,
  block,
  size,
  className,
}: {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  listing?: PublicListingDetail | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
  serviceType?: string | null;
  routeType?: string | null;
  /** Tỉnh gợi ý cho ô địa chỉ giao xe — địa chỉ khách đã nhớ vẫn THẮNG nó (ADR 0035). */
  deliveryProvinceCode?: string | null;
  /**
   * TOÀN BỘ chuyến khách đã chọn ở thẻ đặt xe — hộp mở thẳng ở màn Xem lại từ đó, không có bước chọn
   * lại (xem `RequestBookingPrefill`).
   */
  prefill?: RequestBookingPrefill | null;
  /**
   * Cổng trước khi mở hộp — `false` thì KHÔNG mở. Thẻ đặt xe dùng nó để chỉ ra phần chuyến còn thiếu
   * (địa chỉ, ngày nhận…) ngay tại thẻ, vì hộp không còn biểu mẫu nào để điền chúng.
   */
  beforeOpen?: () => boolean;
  block?: boolean;
  size?: 'small' | 'middle' | 'large';
  className?: string;
}) {
  const t = useTranslations('BookingRequests.flow');
  const [open, setOpen] = useState(false);
  const meQuery = useCurrentUser();
  const me = meQuery.data;
  /*
   * `useSyncExternalStore` chứ không đọc `sessionStorage` trong render: HTML dựng ở server không có
   * bản nháp nào (`serverBookingDraftSavedAt`), nên lần hydrate đầu luôn khớp; client đọc bản thật
   * ngay sau đó.
   */
  const draftSavedAt = useSyncExternalStore(
    subscribeBookingDraft,
    () => bookingDraftSavedAt(vehicleId),
    serverBookingDraftSavedAt,
  );
  // Mở lại NGAY TRONG render (mẫu "điều chỉnh state theo dữ liệu") — không có nhịp nào nút hiện
  // ra rồi hộp mới bật lên. Chỉ khi đã có phiên: chưa đăng nhập thì khách tự bấm "Chọn thuê" và
  // luồng tự điền lại từ bản nháp.
  //
  // "Đã có phiên" = `/auth/me` nạp SAU lúc ghi bản nháp. Bản nháp ghi lúc phiên vừa chết (401) mà
  // cache còn giữ người dùng CŨ thì bản cũ đó không được tính — nếu không, hộp tự mở rồi đi tiếp
  // sau lưng hộp đăng nhập bằng một phiên không còn (ADR 0060 §7).
  if (draftSavedAt !== null && me && meQuery.dataUpdatedAt > draftSavedAt && !open) setOpen(true);

  function close() {
    clearBookingDraft();
    setOpen(false);
  }

  return (
    <>
      <Button
        type="primary"
        icon={<CarOutlined aria-hidden />}
        block={block}
        size={size}
        className={className}
        onClick={() => {
          if (beforeOpen && !beforeOpen()) return;
          setOpen(true);
        }}
      >
        {t('cta')}
      </Button>
      <RequestBookingModal
        vehicleId={vehicleId}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleImageUrl}
        listing={listing}
        pickupAt={pickupAt}
        returnAt={returnAt}
        serviceType={serviceType}
        routeType={routeType}
        deliveryProvinceCode={deliveryProvinceCode}
        prefill={prefill}
        open={open}
        onClose={close}
      />
    </>
  );
}
