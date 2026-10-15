import { gatewayReturnRedirect } from './return-link';

const TRIP = '01JQZX0000000000000000000R';
const ORDER = '01JTESTXRP0RDER00000000000';

describe('gatewayReturnRedirect', () => {
  it('deep link quay về từ cổng ⇒ màn thanh toán, giữ lượt', () => {
    const target = `/payment/${TRIP}?paymentOrder=${ORDER}`;
    expect(gatewayReturnRedirect(`xeprime://trips/${TRIP}?paymentOrder=${ORDER}`)).toBe(target);
    expect(gatewayReturnRedirect(`/trips/${TRIP}?paymentOrder=${ORDER}`)).toBe(target);
    expect(gatewayReturnRedirect(`trips/${TRIP}?x=1&paymentOrder=${ORDER}&y=2`)).toBe(target);
  });

  it('link chuyến thường hay tham số hỏng thì không đổi hướng', () => {
    expect(gatewayReturnRedirect(`xeprime://trips/${TRIP}`)).toBeNull();
    expect(gatewayReturnRedirect(`xeprime://trips/${TRIP}?paymentOrder=bad`)).toBeNull();
    expect(gatewayReturnRedirect(`xeprime://trips/bad?paymentOrder=${ORDER}`)).toBeNull();
    expect(gatewayReturnRedirect(`xeprime://listings/${TRIP}?paymentOrder=${ORDER}`)).toBeNull();
  });
});
