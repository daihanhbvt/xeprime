import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { TENANT_CUSTOMER_NOTE_TYPE } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import { withIntl } from '@/i18n/test-utils';
import { customersApi, type CustomerNote } from '../api';
import { CustomerNotesPanel } from './CustomerNotesPanel';

const CUSTOMER_ID = '01JQZX0000000000000000000C';

function note(overrides: Partial<CustomerNote> = {}): CustomerNote {
  return {
    id: '01JQZX0000000000000000000N',
    noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
    body: 'Khách quen, luôn trả xe đúng giờ',
    authorName: 'Nhân viên A',
    createdAt: '2026-08-01T02:00:00.000Z',
    ...overrides,
  };
}

async function renderPanel(
  { canManage, disabled }: { canManage: boolean; disabled?: boolean },
  notes: CustomerNote[] = [note()],
  total = notes.length,
) {
  const listSpy = jest.spyOn(customersApi, 'notes').mockResolvedValue({
    items: notes,
    meta: { page: 1, limit: 10, total, hasNext: total > 10 },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <CustomerNotesPanel
          customerId={CUSTOMER_ID}
          canManage={canManage}
          {...(disabled === undefined ? {} : { disabled })}
        />
      </QueryClientProvider>,
    ),
  );
  return { ...view, listSpy, queryClient };
}

/**
 * Ghi chú là DÒNG THỜI GIAN bất biến có tác giả + thời điểm, không phải một ô văn bản bị ghi đè.
 * Nội dung tuyệt đối nội bộ — khách không bao giờ đọc được.
 */
describe('CustomerNotesPanel — đọc', () => {
  it('hiện nội dung, loại ghi chú và tác giả + thời điểm', async () => {
    const view = await renderPanel({ canManage: false });

    expect(await view.findByText('Khách quen, luôn trả xe đúng giờ')).toBeTruthy();
    expect(view.getByText('Ghi chú chung')).toBeTruthy();
    expect(view.getByText(/Nhân viên A/)).toBeTruthy();
  });

  it('tác giả đã bị xoá tài khoản: nói rõ thay vì để trống', async () => {
    const view = await renderPanel({ canManage: false }, [note({ authorName: null })]);
    expect(await view.findByText(/Người dùng đã xoá/)).toBeTruthy();
  });

  it('rỗng thật: nói rõ chưa có ghi chú nào', async () => {
    const view = await renderPanel({ canManage: false }, [], 0);
    expect(await view.findByText('Chưa có ghi chú nào về khách này')).toBeTruthy();
  });

  it('lỗi tải: hiện lỗi có nút thử lại, KHÔNG biến thành trạng thái rỗng', async () => {
    jest.spyOn(customersApi, 'notes').mockRejectedValue(new Error('boom'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <CustomerNotesPanel customerId={CUSTOMER_ID} canManage={false} />
        </QueryClientProvider>,
      ),
    );

    expect(await view.findByText('Không tải được ghi chú')).toBeTruthy();
    expect(view.queryByText('Chưa có ghi chú nào về khách này')).toBeNull();
  });
});

describe('CustomerNotesPanel — quyền ghi', () => {
  it('thiếu `customers.manage`: CHỈ ĐỌC — không ô soạn, không nút gỡ', async () => {
    const view = await renderPanel({ canManage: false });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');

    expect(view.queryByText('Nội dung')).toBeNull();
    expect(view.queryByRole('button', { name: /Thêm ghi chú$/ })).toBeNull();
    expect(view.queryByLabelText(/^Gỡ ghi chú ngày/)).toBeNull();
  });

  it('hồ sơ LƯU TRỮ: đọc được ghi chú cũ nhưng KHÔNG thêm mới', async () => {
    const view = await renderPanel({ canManage: true, disabled: true });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');

    expect(view.queryByText('Nội dung')).toBeNull();
    expect(view.queryByRole('button', { name: /Thêm ghi chú$/ })).toBeNull();
  });

  it('có quyền: nói rõ khách không đọc được, và gửi được ghi chú mới', async () => {
    const add = jest.spyOn(customersApi, 'addNote').mockResolvedValue(note({ id: 'new' }));
    const view = await renderPanel({ canManage: true });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');

    expect(
      view.getByText('Ghi chú chỉ hiển thị trong gian hàng của bạn — khách không bao giờ nhìn thấy.'),
    ).toBeTruthy();

    await fireEvent.changeText(
      view.getByPlaceholderText('Ví dụ: khách quen, luôn trả xe đúng giờ; thích xe số sàn.'),
      'Hay trả xe muộn',
    );
    await fireEvent.press(view.getByRole('button', { name: /Thêm ghi chú$/ }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(CUSTOMER_ID, {
        noteType: TENANT_CUSTOMER_NOTE_TYPE.GENERAL,
        body: 'Hay trả xe muộn',
      }),
    );
  });

  it('nội dung rỗng bị chặn NGAY ở client — không gửi request', async () => {
    const add = jest.spyOn(customersApi, 'addNote');
    const view = await renderPanel({ canManage: true });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');

    await fireEvent.press(view.getByRole('button', { name: /Thêm ghi chú$/ }));

    expect(await view.findByText('Nhập nội dung ghi chú')).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it('gỡ ghi chú phải qua XÁC NHẬN, và mới gọi API sau khi xác nhận', async () => {
    const remove = jest.spyOn(customersApi, 'deleteNote').mockResolvedValue({ ok: true });
    const view = await renderPanel({ canManage: true });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');

    await fireEvent.press(view.getByLabelText(/^Gỡ ghi chú ngày/));
    // Hộp xác nhận mở ra; chưa gọi API nào.
    expect(await view.findByText('Gỡ ghi chú này?')).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Gỡ' }));
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(CUSTOMER_ID, '01JQZX0000000000000000000N'),
    );
  });

  it('thêm ghi chú xong: làm mới TOÀN BỘ nhánh sổ khách, không chỉ danh sách ghi chú', async () => {
    jest.spyOn(customersApi, 'addNote').mockResolvedValue(note({ id: 'new' }));
    const view = await renderPanel({ canManage: true });
    await view.findByText('Khách quen, luôn trả xe đúng giờ');
    const invalidate = jest.spyOn(view.queryClient, 'invalidateQueries');

    await fireEvent.changeText(
      view.getByPlaceholderText('Ví dụ: khách quen, luôn trả xe đúng giờ; thích xe số sàn.'),
      'Hay trả xe muộn',
    );
    await fireEvent.press(view.getByRole('button', { name: /Thêm ghi chú$/ }));

    // Một lần invalidate cho cả nhánh: danh sách, dải chỉ số và hồ sơ phải đổi cùng lúc.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.customers.all }),
    );
  });
});
