import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { LicencePhoto } from './DriverLicenceVerifier';

/**
 * Ảnh bằng thu nhỏ có thử lại — bản native của các ca ảnh trong `DriverLicenceVerifier.test.tsx`
 * (web, PR #183). Trình xem được thay bằng một mock đọc `url` để biết nó có MỞ hay không.
 */
const mockPhoto: {
  data: { url: string } | undefined;
  isPending: boolean;
  isError: boolean;
  isStale: boolean;
  refetch: jest.Mock;
} = { data: undefined, isPending: false, isError: false, isStale: false, refetch: jest.fn() };

jest.mock('../hooks/use-driver-licence', () => ({
  useDriverLicence: jest.fn(),
  useRequestDriverLicenceReview: jest.fn(),
  useDriverLicenceImage: () => mockPhoto,
}));

jest.mock('@/components/ui/PhotoViewer', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    PhotoViewer: ({ url }: { url: string | null }) => (url ? <Text>{`viewer:${url}`}</Text> : null),
  };
});

beforeEach(() => {
  mockPhoto.data = undefined;
  mockPhoto.isPending = false;
  mockPhoto.isError = false;
  mockPhoto.isStale = false;
  mockPhoto.refetch.mockReset();
});
afterEach(cleanup);

describe('LicencePhoto', () => {
  it('ảnh thu nhỏ bị làm nhoè như web; trình xem nhận URL gốc (rõ)', async () => {
    mockPhoto.data = { url: 'https://r2.test/l1.jpg' };
    await render(withIntl(<LicencePhoto licenceId="L1" />));

    expect(screen.getByTestId('licence-photo-thumb').props.blurRadius).toBe(10);
    fireEvent.press(screen.getByLabelText('Xem ảnh bằng lái'));
    expect(await screen.findByText('viewer:https://r2.test/l1.jpg')).toBeTruthy();
  });

  it('URL còn mới: chạm khung là mở trình xem ngay, không xin lại', async () => {
    mockPhoto.data = { url: 'https://r2.test/l1.jpg' };
    await render(withIntl(<LicencePhoto licenceId="L1" />));

    expect(screen.queryByText('viewer:https://r2.test/l1.jpg')).toBeNull();
    fireEvent.press(screen.getByLabelText('Xem ảnh bằng lái'));
    expect(await screen.findByText('viewer:https://r2.test/l1.jpg')).toBeTruthy();
    expect(mockPhoto.refetch).not.toHaveBeenCalled();
  });

  it('URL đã cũ: xin URL mới rồi mới mở trình xem', async () => {
    mockPhoto.data = { url: 'https://r2.test/l1.jpg' };
    mockPhoto.isStale = true;
    mockPhoto.refetch.mockResolvedValue({ isSuccess: true });
    await render(withIntl(<LicencePhoto licenceId="L1" />));

    fireEvent.press(screen.getByLabelText('Xem ảnh bằng lái'));
    expect(mockPhoto.refetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('viewer:https://r2.test/l1.jpg')).toBeTruthy());
  });

  it('không tải được ảnh: khung báo lỗi, chạm là thử lại chứ không mở trình xem trống', async () => {
    mockPhoto.isError = true;
    await render(withIntl(<LicencePhoto licenceId="L1" />));

    expect(screen.getByText('Chưa tải được ảnh')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Tải lại ảnh bằng lái'));
    expect(mockPhoto.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/viewer:/)).toBeNull();
  });
});
