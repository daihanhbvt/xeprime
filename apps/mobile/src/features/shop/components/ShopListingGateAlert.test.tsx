import { render } from '@testing-library/react-native';
import { PACKAGE_SHOP_LISTING_REQUIREMENT } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { ShopListingGateAlert } from './ShopListingGateAlert';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ isFocused: () => true }),
}));

/**
 * Dải "hồ sơ gian hàng chưa đủ để gửi xe duyệt" (ADR 0040 điều 7).
 *
 * Nó luôn phải có LỐI ĐI TIẾP — đó là lý do nó là một dải chứ không phải một toast.
 */
describe('ShopListingGateAlert', () => {
  it('chỉ thiếu logo: một câu thẳng, không phải danh sách một dòng', async () => {
    const view = await render(
      withIntl(<ShopListingGateAlert missing={[PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO]} />),
    );

    expect(view.getByText('Gian hàng cần có logo trước khi gửi xe duyệt.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Tải logo' })).toBeTruthy();
  });

  it('thiếu nhiều mục: liệt kê từng mục bằng NHÃN, không in mã thô', async () => {
    const view = await render(
      withIntl(
        <ShopListingGateAlert
          missing={[
            PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO,
            PACKAGE_SHOP_LISTING_REQUIREMENT.PROVINCE,
            PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE,
          ]}
        />,
      ),
    );

    expect(view.getByText('Hồ sơ gian hàng còn thiếu thông tin')).toBeTruthy();
    expect(view.getByText('Logo gian hàng')).toBeTruthy();
    expect(view.getByText('Tỉnh/thành')).toBeTruthy();
    expect(view.getByText('Số điện thoại liên hệ')).toBeTruthy();
    /*
      Mã THÔ không được lọt ra giao diện — đúng lỗi `wardInvalid` từng gây ra ở một chỗ khác.

      Mục `ward` tự nó đã rời enum cùng ADR 0042 (ô Xã/phường bị bỏ khỏi mọi form địa chỉ CÓ
      GHIM), nên cổng đăng xe của gian hàng trả phí nay chấm năm mục.
    */
    expect(view.queryByText('province')).toBeNull();
    expect(view.getByRole('button', { name: 'Mở hồ sơ gian hàng' })).toBeTruthy();
  });
});
