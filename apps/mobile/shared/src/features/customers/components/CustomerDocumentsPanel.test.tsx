import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CUSTOMER_DOCUMENT_TYPE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { customersApi, type CustomerDocument } from '../api';
import { CustomerDocumentsPanel } from './CustomerDocumentsPanel';

const CUSTOMER_ID = '01JQZX0000000000000000000C';

function doc(overrides: Partial<CustomerDocument> = {}): CustomerDocument {
  return {
    id: '01JQZX0000000000000000000D',
    documentType: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
    customTypeName: null,
    originalName: 'cccd.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    expiresAt: null,
    expiryStatus: 'no_expiry',
    uploadedByName: 'Nhân viên',
    verifiedAt: null,
    verifiedByName: null,
    verifyMethod: null,
    verifyNote: null,
    createdAt: '2026-08-01T02:00:00.000Z',
    ...overrides,
  };
}

async function renderPanel(
  perms: { canManage: boolean; canViewFiles: boolean; disabled?: boolean },
  documents: CustomerDocument[] = [doc()],
) {
  const listSpy = jest.spyOn(customersApi, 'documents').mockResolvedValue(documents);
  const downloadSpy = jest
    .spyOn(customersApi, 'documentDownload')
    .mockResolvedValue({
      downloadUrl: 'https://r2.test/signed',
      expiresAt: '2026-08-01T02:02:00.000Z',
    });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <CustomerDocumentsPanel
          customerId={CUSTOMER_ID}
          canManage={perms.canManage}
          canViewFiles={perms.canViewFiles}
          {...(perms.disabled === undefined ? {} : { disabled: perms.disabled })}
        />
      </QueryClientProvider>,
    ),
  );
  return { ...view, listSpy, downloadSpy };
}

/**
 * Ba mức quyền của giấy tờ khách tách nhau vì mức thiệt hại khác hẳn: THẤY có giấy tờ gì là một
 * chuyện, MỞ ĐƯỢC ảnh CCCD của mọi khách cũ là chuyện khác hẳn.
 */
describe('CustomerDocumentsPanel — quyền xem TỆP', () => {
  it('thiếu `customers.documents.view_files`: KHÔNG phát request xin signed URL nào', async () => {
    const view = await renderPanel({ canManage: true, canViewFiles: false });

    await view.findByText(/cccd/);
    // Metadata vẫn đọc được — chỉ nội dung tệp là không.
    expect(view.getByText(/cccd\.jpg/)).toBeTruthy();
    // Đây là điểm chính: mỗi signed URL là một dòng audit "đã xem giấy tờ của khách này".
    expect(view.downloadSpy).not.toHaveBeenCalled();
  });

  it('có quyền xem tệp: nạp ảnh thu nhỏ cho giấy tờ dạng ẢNH', async () => {
    const view = await renderPanel({ canManage: false, canViewFiles: true });

    await waitFor(() => expect(view.downloadSpy).toHaveBeenCalledTimes(1));
    expect(view.downloadSpy).toHaveBeenCalledWith(CUSTOMER_ID, '01JQZX0000000000000000000D');
  });

  it('PDF không có ảnh thu nhỏ nên KHÔNG nạp sẵn — chỉ xin URL khi bấm "Mở tệp"', async () => {
    const view = await renderPanel({ canManage: false, canViewFiles: true }, [
      doc({ mimeType: 'application/pdf', originalName: 'cccd.pdf' }),
    ]);

    await view.findByText(/cccd/);
    expect(view.downloadSpy).not.toHaveBeenCalled();

    await fireEvent.press(await view.findByRole('button', { name: /Mở tệp$/ }));
    await waitFor(() => expect(view.downloadSpy).toHaveBeenCalledTimes(1));
  });

  it('thiếu quyền xem tệp: PDF cũng KHÔNG có nút "Mở tệp"', async () => {
    const view = await renderPanel({ canManage: true, canViewFiles: false }, [
      doc({ mimeType: 'application/pdf', originalName: 'cccd.pdf' }),
    ]);

    await view.findByText(/cccd/);
    expect(view.queryByRole('button', { name: /Mở tệp$/ })).toBeNull();
  });
});

describe('CustomerDocumentsPanel — quyền QUẢN LÝ', () => {
  it('thiếu `customers.documents.manage`: không tải lên, không đối chiếu, không gỡ', async () => {
    const view = await renderPanel({ canManage: false, canViewFiles: true });
    await view.findByText(/cccd/);

    expect(view.queryByRole('button', { name: /Tải giấy tờ lên$/ })).toBeNull();
    expect(view.queryByRole('button', { name: /Đã đối chiếu$/ })).toBeNull();
    expect(view.queryByLabelText('Gỡ cccd.jpg')).toBeNull();
  });

  it('có quyền quản lý: đủ tải lên · đối chiếu · gỡ', async () => {
    const view = await renderPanel({ canManage: true, canViewFiles: true });
    await view.findByText(/cccd/);

    expect(view.getByRole('button', { name: /Tải giấy tờ lên$/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /Đã đối chiếu$/ })).toBeTruthy();
    expect(view.getByLabelText('Gỡ cccd.jpg')).toBeTruthy();
  });

  it('giấy tờ ĐÃ đối chiếu: nút đổi thành "Đối chiếu lại", trạng thái hạn vẫn hiện riêng', async () => {
    const view = await renderPanel({ canManage: true, canViewFiles: true }, [
      doc({ verifiedAt: '2026-08-02T02:00:00.000Z', verifyMethod: 'vneid' }),
    ]);
    await view.findByText(/cccd/);

    expect(view.getByRole('button', { name: /Đối chiếu lại$/ })).toBeTruthy();
    // Đối chiếu ≠ còn hạn: hai trạng thái hiện riêng, không gộp thành một dấu "ổn".
    expect(view.getByText('Không có hạn')).toBeTruthy();
  });

  it('hồ sơ LƯU TRỮ: xem được nhưng không tải lên / đối chiếu / gỡ', async () => {
    const view = await renderPanel({ canManage: true, canViewFiles: true, disabled: true });
    await view.findByText(/cccd/);

    expect(view.getByText(/cccd\.jpg/)).toBeTruthy();
    expect(view.queryByRole('button', { name: /Tải giấy tờ lên$/ })).toBeNull();
    expect(view.queryByRole('button', { name: /Đã đối chiếu$/ })).toBeNull();
    expect(view.queryByLabelText('Gỡ cccd.jpg')).toBeNull();
  });
});

describe('CustomerDocumentsPanel — trạng thái dữ liệu', () => {
  it('rỗng thật: nói rõ chưa có giấy tờ nào', async () => {
    const view = await renderPanel({ canManage: false, canViewFiles: false }, []);
    expect(await view.findByText('Chưa có giấy tờ nào của khách này')).toBeTruthy();
  });

  it('lỗi tải danh sách: hiện lỗi có nút thử lại, KHÔNG biến thành trạng thái rỗng', async () => {
    jest.spyOn(customersApi, 'documents').mockRejectedValue(new Error('boom'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <CustomerDocumentsPanel customerId={CUSTOMER_ID} canManage={false} canViewFiles={false} />
        </QueryClientProvider>,
      ),
    );

    expect(await view.findByText('Không tải được danh sách giấy tờ')).toBeTruthy();
    expect(view.queryByText('Chưa có giấy tờ nào của khách này')).toBeNull();
  });
});
