import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { canHostDecideTrip, CUSTOMER_TRIP_STAGE, type CustomerTripStage } from '@xeprime/types';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import {
  bookingRequestsApi,
  type BookingRequestDecisionTarget,
  type BookingRequestItem,
} from '@/features/booking-requests/api';
import { ApproveSuccessSheet } from '@/features/booking-requests/components/ApproveSuccessSheet';
import { withIntl } from '@/i18n/test-utils';
import type { CustomerTripDetail } from '../api';
import { TripHostDecisions } from './TripHostDecisions';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const host = viTrips.host;

function trip(stage: CustomerTripStage): CustomerTripDetail {
  return {
    id: '01JQZX0000000000000000000R',
    stage,
    /*
     * `respondBy` CÓ mặt ở cả hai chặng — đó chính là điểm của bài test.
     *
     * Từ ADR 0044, cột này KHÔNG bị xoá khi chủ xe nhận chuyến. Bản trước của màn hỏi nó để quyết
     * định bày nút gì, nên một chuyến đã duyệt vẫn hiện nút "Duyệt" — và cú chạm đó chỉ trả về
     * một lỗi khó hiểu từ server.
     */
    respondBy: '2026-09-24T02:00:00.000Z',
    bookingId: null,
    vehicle: { id: '01JQZX0000000000000000000V', name: 'Toyota Vios 2022', plateNumber: '51A-123.45' },
    renter: { name: 'Nguyễn Văn An', phone: '0901234567' },
    serviceType: 'self_drive',
    deliveryRequested: false,
    longTermPackageMonths: null,
    pickupAt: '2026-09-25T02:00:00.000Z',
    returnAt: '2026-09-27T02:00:00.000Z',
  } as unknown as CustomerTripDetail;
}

/**
 * Bản thu nhỏ của `TripDetailScreen` — cổng `canHostDecideTrip` và tấm kết quả đặt ĐÚNG chỗ màn
 * thật đặt chúng.
 *
 * Dựng `TripHostDecisions` trần sẽ bỏ lọt đúng lớp lỗi đắt nhất ở đây: lượt duyệt làm `stage`
 * đổi, cổng trả `false`, và mọi thứ SỐNG BÊN TRONG cụm đó biến mất theo. Một bài test không có
 * cổng thì không bao giờ thấy điều đó.
 *
 * `onStageAfterApprove` mô phỏng nhịp refetch: hook duyệt invalidate nhánh `trips`, truy vấn chi
 * tiết chạy lại và trả về một chặng mới.
 */
function Harness({
  stage: initial,
  stageAfterApprove,
}: {
  stage: CustomerTripStage;
  stageAfterApprove?: CustomerTripStage;
}) {
  const [stage, setStage] = useState(initial);
  const [approved, setApproved] = useState<BookingRequestDecisionTarget | null>(null);

  return (
    <>
      {canHostDecideTrip(stage) ? (
        <TripHostDecisions
          trip={trip(stage)}
          onApproved={(record) => {
            setApproved(record);
            if (stageAfterApprove) setStage(stageAfterApprove);
          }}
        />
      ) : null}
      {approved ? (
        <ApproveSuccessSheet request={approved} onClose={() => setApproved(null)} />
      ) : null}
    </>
  );
}

async function renderBlock(stage: CustomerTripStage, stageAfterApprove?: CustomerTripStage) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return await render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <Harness
          stage={stage}
          {...(stageAfterApprove ? { stageAfterApprove } : {})}
        />
      </QueryClientProvider>,
    ),
  );
}

/**
 * HAI chặng, hai bộ nút — ADR 0045 điều 1.
 *
 * `pending_approval` (và `pending_approval_paid` LEGACY) còn chờ chủ xe quyết ⇒ Duyệt / Từ chối.
 * `awaiting_hold` thì họ đã nhận rồi, bóng ở chân khách ⇒ lối duy nhất còn lại là HUỶ.
 */
describe('TripHostDecisions — chuyến còn chờ chủ xe quyết', () => {
  it('bày Duyệt và Từ chối', async () => {
    const view = await renderBlock(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL);

    expect(await view.findByText(host.decisionTitle)).toBeTruthy();
    expect(view.queryByText(host.decisionHint)).not.toBeNull();
    expect(view.queryByText(host.approve)).not.toBeNull();
    expect(view.queryByText(host.reject)).not.toBeNull();
    expect(view.queryByText(host.cancel)).toBeNull();
  });

  /* Dữ liệu LEGACY ADR 0039: khách đã trả tiền trước, chủ xe vẫn còn phải quyết. */
  it('chặng LEGACY `pending_approval_paid` vẫn là hai nút quyết định', async () => {
    const view = await renderBlock(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID);

    expect(await view.findByText(host.approve)).toBeTruthy();
    expect(view.queryByText(host.cancel)).toBeNull();
  });
});

describe('TripHostDecisions — chuyến ĐÃ NHẬN, đang chờ khách thanh toán', () => {
  it('đổi hẳn sang câu "đã nhận" và chỉ còn nút Huỷ chuyến', async () => {
    const view = await renderBlock(CUSTOMER_TRIP_STAGE.AWAITING_HOLD);

    expect(await view.findByText(host.acceptedTitle)).toBeTruthy();
    expect(view.queryByText(host.acceptedHint)).not.toBeNull();
    expect(view.queryByText(host.cancel)).not.toBeNull();
  });

  /*
   * Nút "Duyệt" ở đây là lỗi tốn kém nhất của màn này: chủ xe bấm vào một chuyến mình vừa duyệt
   * và nhận một lỗi không giải thích được. `respondBy` vẫn còn nguyên nên phép kiểm cũ vẫn "đúng".
   */
  it('KHÔNG bày Duyệt/Từ chối dù `respondBy` vẫn còn nguyên', async () => {
    const view = await renderBlock(CUSTOMER_TRIP_STAGE.AWAITING_HOLD);

    await view.findByText(host.acceptedTitle);
    expect(view.queryByText(host.approve)).toBeNull();
    expect(view.queryByText(host.reject)).toBeNull();
    expect(view.queryByText(host.decisionTitle)).toBeNull();
  });
});

/**
 * CHUỖI đầy đủ: bấm Duyệt → server trả bản ghi → tấm kết quả chọn ĐÚNG một trong hai câu chuyện.
 *
 * Bốn bài dưới đây tồn tại vì các test tách rời KHÔNG bắt được lỗi thật: `ApproveSuccessSheet`
 * phân nhánh đúng khi được truyền đúng dữ liệu, nhưng nơi GỌI lại truyền `target` — bản ghi dựng
 * từ chuyến TRƯỚC khi duyệt, nơi `bookingId` luôn `null`. Mỗi mảnh đúng, chuỗi thì sai, và không
 * bài test nào đỏ.
 *
 * Vì thế ở đây spy thẳng vào `bookingRequestsApi.approve` và khẳng định trên MÀN HÌNH, không
 * khẳng định trên một prop.
 */
describe('TripHostDecisions — duyệt xong đọc `bookingId` của BẢN GHI SERVER TRẢ VỀ', () => {
  const approved = viBookingRequests.approved;

  /** Bản ghi server trả sau lượt duyệt — `bookingId` là thứ DUY NHẤT quyết định câu chuyện. */
  function approvedRecord(bookingId: string | null): BookingRequestItem {
    return { ...trip(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL), bookingId } as unknown as BookingRequestItem;
  }

  async function approveWith(bookingId: string | null, stageAfterApprove?: CustomerTripStage) {
    const spy = jest.spyOn(bookingRequestsApi, 'approve').mockResolvedValue(approvedRecord(bookingId));
    const view = await renderBlock(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL, stageAfterApprove);

    await fireEvent.press(await view.findByText(host.approve));
    /*
     * Tấm xác nhận mở trước; nút TRONG nó mới thật sự gọi API. Hai nút trùng nhãn ("Duyệt & giữ
     * xe" ở cả thẻ lẫn tấm), nên lấy cái SAU — cái vừa được dựng thêm.
     */
    const buttons = await view.findAllByText(viBookingRequests.approve.confirm);
    await fireEvent.press(buttons[buttons.length - 1]!);
    return { view, spy };
  }

  afterEach(() => jest.restoreAllMocks());

  it('CÓ `bookingId` ⇒ nói đã tạo đơn và mở được đơn đó', async () => {
    const { view } = await approveWith('01JQZX0000000000000000000B');

    expect(await view.findByText(approved.title)).toBeTruthy();
    expect(view.queryByText(approved.viewBooking)).not.toBeNull();
    expect(view.queryByText(approved.holdTitle)).toBeNull();
  });

  /*
   * Nhánh MẶC ĐỊNH của ADR 0044. Trước khi sửa nơi gọi, nhánh này KHÔNG BAO GIỜ đọc đúng — và
   * cũng không bao giờ đọc sai, vì `target` luôn `bookingId = null` nên mọi lượt duyệt rơi vào
   * đây, kể cả chuyến đã tạo đơn ngay.
   */
  it('KHÔNG có `bookingId` ⇒ nói đã nhận chuyến, chờ khách thanh toán', async () => {
    const { view } = await approveWith(null);

    expect(await view.findByText(approved.holdTitle)).toBeTruthy();
    expect(view.queryByText(approved.holdNext)).not.toBeNull();
    expect(view.queryByText(approved.viewBooking)).toBeNull();
    expect(view.queryByText(approved.title)).toBeNull();
  });

  /*
   * Toast `approve.success` nói "Đã giữ xe — đã tạo đơn thuê". Ở nhánh chờ thanh toán đó là một
   * lời khẳng định SAI, đúng câu ADR 0044 điều 2 sinh ra để chấm dứt. Web không có toast ở lượt
   * duyệt; mobile cũng không được có.
   */
  it('KHÔNG hiện toast "đã tạo đơn thuê" ở nhánh chờ thanh toán', async () => {
    const { view } = await approveWith(null);

    await view.findByText(approved.holdTitle);
    expect(view.queryByText(viBookingRequests.approve.success)).toBeNull();
    expect(view.queryByText(viBookingRequests.approve.successLongTerm)).toBeNull();
  });

  /*
   * LỖI VÒNG ĐỜI — bài test đắt nhất của file này.
   *
   * Nhánh không thu giữ chỗ tạo đơn ngay tại lượt duyệt, nên `stage` nhảy sang `ready` ở nhịp
   * refetch kế tiếp. `canHostDecideTrip(ready)` là `false` ⇒ cả cụm quyết định unmount. Nếu tấm
   * kết quả sống BÊN TRONG cụm đó, nó chớp lên rồi biến mất — và biến mất cùng nó là nút "Xem
   * chi tiết đơn", lối duy nhất sang đơn vừa tạo.
   *
   * Vì thế tấm phải nằm ở màn CHA, ngoài cổng. Bài test này đỏ nếu ai đó đẩy nó trở vào.
   */
  it('tấm kết quả SỐNG SÓT qua nhịp refetch làm cụm quyết định unmount', async () => {
    const { view } = await approveWith(
      '01JQZX0000000000000000000B',
      CUSTOMER_TRIP_STAGE.READY,
    );

    // Cụm quyết định đã biến mất (chặng mới không còn gì để quyết)…
    expect(view.queryByText(host.decisionTitle)).toBeNull();
    expect(view.queryByText(host.approve)).toBeNull();

    // …nhưng tấm kết quả VẪN còn, kèm lối sang đơn vừa tạo.
    expect(await view.findByText(approved.title)).toBeTruthy();
    expect(view.queryByText(approved.viewBooking)).not.toBeNull();
  });

  /* Nhánh có thu giữ chỗ: `stage` sang `awaiting_hold`, cụm ĐỔI nút chứ không unmount. */
  it('nhánh chờ thanh toán: cụm đổi sang nút Huỷ, tấm kết quả vẫn còn', async () => {
    const { view } = await approveWith(null, CUSTOMER_TRIP_STAGE.AWAITING_HOLD);

    expect(await view.findByText(approved.holdTitle)).toBeTruthy();
    expect(view.queryByText(host.cancel)).not.toBeNull();
    expect(view.queryByText(host.approve)).toBeNull();
  });

  /*
   * RANH GIỚI, khoá bằng một bài riêng: `TripHostDecisions` chỉ BÁO LÊN, tuyệt đối không tự dựng
   * tấm kết quả.
   *
   * Bài "sống sót qua refetch" ở trên đi qua `Harness`, mà `Harness` tự dựng tấm — nên nếu ai đó
   * đẩy tấm trở vào trong component, bài kia vẫn xanh. Bài này dựng component TRẦN nên nó đỏ ngay
   * ở đúng lúc ranh giới bị phá.
   */
  it('component KHÔNG tự dựng tấm kết quả — nó chỉ báo lên màn cha', async () => {
    jest
      .spyOn(bookingRequestsApi, 'approve')
      .mockResolvedValue(approvedRecord('01JQZX0000000000000000000B'));
    const onApproved = jest.fn();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = await render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <TripHostDecisions
            trip={trip(CUSTOMER_TRIP_STAGE.PENDING_APPROVAL)}
            onApproved={onApproved}
          />
        </QueryClientProvider>,
      ),
    );

    await fireEvent.press(await view.findByText(host.approve));
    const buttons = await view.findAllByText(viBookingRequests.approve.confirm);
    await fireEvent.press(buttons[buttons.length - 1]!);

    await waitFor(() =>
      expect(onApproved).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: '01JQZX0000000000000000000B' }),
      ),
    );
    expect(view.queryByText(approved.title)).toBeNull();
    expect(view.queryByText(approved.holdTitle)).toBeNull();
  });
});
