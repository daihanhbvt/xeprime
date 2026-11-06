import { CHAT_SIDE } from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  bookingPath,
  bookingRequestPath,
  listingPath,
  tripPath,
  vehiclePath,
} from '@/constants/routes';
import { chatThreadHref, messageTripHref, messageVehicleHref } from './chat-links';

const TRIP = { id: 'RQ1', bookingId: null, code: null, pickupAt: null, returnAt: null };

describe('messageVehicleHref', () => {
  it('khách mở tin đăng trên chợ', () => {
    expect(messageVehicleHref(CHAT_SIDE.CUSTOMER, 'V1')).toBe(listingPath.detail('V1'));
  });

  // Hồi quy: site partner không có `/listings/:id` — thẻ xe từng dẫn gian hàng vào 404.
  it('gian hàng / chủ xe mở chiếc xe của mình trong site partner', () => {
    expect(messageVehicleHref(CHAT_SIDE.SHOP, 'V1')).toBe(vehiclePath.detail('V1'));
    expect(messageVehicleHref(CHAT_SIDE.SHOP, 'V1')).not.toBe(listingPath.detail('V1'));
  });
});

describe('messageTripHref', () => {
  it('khách mở chuyến đi theo id yêu cầu, kể cả khi đã thành đơn', () => {
    expect(messageTripHref(CHAT_SIDE.CUSTOMER, TRIP)).toBe(tripPath.detail('RQ1'));
    expect(messageTripHref(CHAT_SIDE.CUSTOMER, { ...TRIP, bookingId: 'BK1' })).toBe(
      tripPath.detail('RQ1'),
    );
  });

  it('gian hàng: đã thành đơn ⇒ trang chi tiết đơn', () => {
    expect(messageTripHref(CHAT_SIDE.SHOP, { ...TRIP, bookingId: 'BK1', code: 'DH1' })).toBe(
      bookingPath.detail('BK1'),
    );
  });

  it('gian hàng: chưa thành đơn ⇒ "Đơn thuê xe" mở sẵn hộp chi tiết yêu cầu', () => {
    expect(messageTripHref(CHAT_SIDE.SHOP, TRIP)).toBe(bookingRequestPath.open('RQ1'));
  });
});

describe('chatThreadHref', () => {
  it('chỉ hội thoại', () => {
    expect(chatThreadHref(ROUTES.CHAT, 'C1')).toBe(`${ROUTES.CHAT}?c=C1`);
  });

  it('chuyến thắng xe — thẻ chuyến đã mang xe của chính chuyến đó', () => {
    expect(chatThreadHref(ROUTES.CHAT, 'C1', { vehicleId: 'V1', tripId: 'RQ1' })).toBe(
      `${ROUTES.CHAT}?c=C1&t=RQ1`,
    );
    expect(chatThreadHref(ROUTES.MANAGE.CHAT, 'C1', { vehicleId: 'V1' })).toBe(
      `${ROUTES.MANAGE.CHAT}?c=C1&v=V1`,
    );
  });
});
