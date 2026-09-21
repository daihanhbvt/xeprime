import { render } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { ShopWelcomeBanner } from './ShopWelcomeBanner';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({ isFocused: () => true }),
}));

async function renderBanner(props: { missingLogo: boolean; hasVehicle: boolean }) {
  return render(withIntl(<ShopWelcomeBanner {...props} onPickLogo={jest.fn()} />));
}

/**
 * Dải chào sau lượt thanh toán gói đầu tiên (ADR 0040).
 *
 * Ba hình dạng, và hình dạng IM LẶNG là hình dạng quan trọng nhất: một dải "mọi thứ đều ổn" đứng
 * thường trực chỉ dạy người dùng bỏ qua vùng ấy, và đúng lúc có tin xấu thì họ cũng không đọc nữa.
 */
describe('ShopWelcomeBanner', () => {
  it('thiếu logo: mời tải logo, KHÔNG mời đăng xe', async () => {
    const view = await renderBanner({ missingLogo: true, hasVehicle: false });

    expect(view.getByText('Còn 1 bước để đăng xe')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Tải logo' })).toBeTruthy();
    expect(view.queryByText('Gian hàng đã sẵn sàng')).toBeNull();
  });

  /**
   * Logo THẮNG cả khi đã có xe: nó là mục CHẶN của cổng đăng xe (ADR 0040 điều 7), nên nói về nó
   * trước là nói về thứ duy nhất đang cản đường.
   */
  it('thiếu logo vẫn nói về logo dù gian hàng đã có xe', async () => {
    const view = await renderBanner({ missingLogo: true, hasVehicle: true });

    expect(view.getByText('Còn 1 bước để đăng xe')).toBeTruthy();
  });

  it('đủ logo, chưa có xe: mời đăng chiếc xe đầu tiên', async () => {
    const view = await renderBanner({ missingLogo: false, hasVehicle: false });

    expect(view.getByText('Gian hàng đã sẵn sàng')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Đăng xe đầu tiên' })).toBeTruthy();
  });

  /**
   * Hình dạng THỨ BA — và là lý do `ShopProfileScreen` phải coi "đang tải" là ĐÃ CÓ xe: mặc định
   * sai chiều sẽ nháy đúng dòng "Đăng xe đầu tiên" vào mặt một gian hàng mười xe.
   */
  it('đủ logo và đã có xe: KHÔNG dựng gì', async () => {
    const view = await renderBanner({ missingLogo: false, hasVehicle: true });

    expect(view.queryByText('Gian hàng đã sẵn sàng')).toBeNull();
    expect(view.queryByText('Còn 1 bước để đăng xe')).toBeNull();
    // Không chỉ im về CHỮ: không còn nút nào cả (`withIntl` chỉ dựng provider, không dựng nút).
    expect(view.queryAllByRole('button')).toHaveLength(0);
  });
});
