import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_MAX_COUNT } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { chatApi } from '@/features/chat/api';
import {
  ChatAttachmentRejectedError,
  pickImages,
  pickPdfFile,
  uploadAttachmentToR2,
} from '@/lib/r2-image-upload';
import { ChatComposer } from './ChatComposer';

/**
 * Ô soạn tin — gửi chữ, đính kèm, và thẻ ngữ cảnh xe.
 *
 * Nhóm đầu khoá ba chuyện MẤT DỮ LIỆU: không gửi được tin rỗng, một cú chạm chỉ gửi một tin, và
 * ô nhập được dọn ngay khi gửi (tin đã nằm trong danh sách ở trạng thái `pending`, giữ chữ lại
 * là mời người dùng gõ đè lên nội dung vừa gửi).
 *
 * Nhóm sau khoá phần đính kèm (COM-03), trong đó có một lỗi ĐÃ CÓ THẬT: bản trước gửi
 * `fileSize: 0` cho mọi tệp, nên metadata trong DB nói mọi đính kèm đều rỗng.
 */
const mockShowError = jest.fn();

jest.mock('@/components/feedback/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: jest.fn(), showError: mockShowError, showInfo: jest.fn() }),
}));

jest.mock('@/lib/r2-image-upload', () => {
  const actual = jest.requireActual('@/lib/r2-image-upload');
  return {
    ...actual,
    pickImages: jest.fn(),
    pickPdfFile: jest.fn(),
    uploadAttachmentToR2: jest.fn(),
  };
});

jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return { ...actual, chatApi: { presignAttachment: jest.fn() } };
});

const pick = pickImages as jest.MockedFunction<typeof pickImages>;
const pickPdf = pickPdfFile as jest.MockedFunction<typeof pickPdfFile>;
const upload = uploadAttachmentToR2 as jest.MockedFunction<typeof uploadAttachmentToR2>;
const api = chatApi as jest.Mocked<typeof chatApi>;

const PHOTO = { uri: 'file:///tmp/a.jpg', fileName: 'a.jpg', contentType: 'image/jpeg' };
const PDF = { uri: 'file:///tmp/hop-dong.pdf', fileName: 'hop-dong.pdf', contentType: 'application/pdf' };

/** Số byte THẬT do bước tải lên đo được — thứ bản trước gửi cứng thành 0. */
const REAL_BYTES = 482_133;

const uploaded = (file: { fileName: string; contentType: string }, size = REAL_BYTES) => ({
  url: `https://r2.example.com/chat/${file.fileName}`,
  fileType: file.contentType,
  fileName: file.fileName,
  fileSize: size,
});

beforeEach(() => {
  mockShowError.mockClear();
  pick.mockReset().mockResolvedValue([]);
  pickPdf.mockReset().mockResolvedValue(null);
  upload.mockReset();
  api.presignAttachment.mockReset();
});

/** Mở tấm chọn nguồn rồi bấm một trong hai mục — cùng thao tác người dùng thật làm. */
async function attach(
  view: ReturnType<typeof render> extends Promise<infer T> ? T : never,
  source: 'Ảnh' | 'Tệp PDF',
) {
  await fireEvent.press(view.getByRole('button', { name: 'Đính kèm' }));
  await fireEvent.press(await view.findByRole('button', { name: source }));
}

const PLACEHOLDER = 'Nhập tin nhắn của bạn…';

describe('ChatComposer', () => {
  it('nút gửi khoá khi chưa có gì để gửi', async () => {
    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));

    const send = view.getByRole('button', { name: 'Gửi' });
    expect(send.props.accessibilityState.disabled).toBe(true);
  });

  it('không gọi onSend với tin RỖNG hay chỉ có khoảng trắng', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const view = await render(withIntl(<ChatComposer onSend={onSend} />));

    await fireEvent.changeText(view.getByLabelText(PLACEHOLDER), '    ');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('gửi text đã cắt khoảng trắng, rồi DỌN ô nhập', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const view = await render(withIntl(<ChatComposer onSend={onSend} />));

    const input = view.getByLabelText(PLACEHOLDER);
    await fireEvent.changeText(input, '  Chào shop  ');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ text: 'Chào shop' }));
    expect(input.props.value).toBe('');
  });

  /** Chốt chống gửi đôi là một `ref`, không phải state — hai cú chạm liên tiếp chỉ ra một tin. */
  it('chạm hai lần thật nhanh chỉ gửi MỘT tin', async () => {
    let release: (() => void) | undefined;
    const onSend = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await fireEvent.changeText(view.getByLabelText(PLACEHOLDER), 'Bấm nhanh');

    const send = view.getByRole('button', { name: 'Gửi' });
    await fireEvent.press(send);
    await fireEvent.press(send);

    expect(onSend).toHaveBeenCalledTimes(1);
    // Thả cho lời gọi kết thúc TRONG `act`: nó còn một `setBusy(false)` ở nhánh `finally`, và
    // để nó chạy ngoài act là cảnh báo React trong log của mọi lần chạy sau.
    await act(async () => {
      release?.();
    });
  });

  it('`disabled` chặn cả gõ lẫn gửi — thread đang lỗi thì không soạn tin vào hư không', async () => {
    const onSend = jest.fn();
    const view = await render(withIntl(<ChatComposer onSend={onSend} disabled />));

    expect(view.getByLabelText(PLACEHOLDER).props.editable).toBe(false);
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('ChatComposer — đính kèm (COM-03)', () => {
  it('chọn ẢNH: tải lên rồi gửi kèm metadata ĐẦY ĐỦ, với số byte THẬT', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    pick.mockResolvedValue([PHOTO]);
    upload.mockResolvedValue(uploaded(PHOTO));

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await attach(view, 'Ảnh');

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        attachments: [
          {
            url: 'https://r2.example.com/chat/a.jpg',
            fileType: 'image/jpeg',
            fileName: 'a.jpg',
            fileSize: REAL_BYTES,
          },
        ],
      }),
    );
  });

  it('chọn TỆP PDF đi qua trình chọn tài liệu, không qua trình chọn ảnh', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    pickPdf.mockResolvedValue(PDF);
    upload.mockResolvedValue(uploaded(PDF, 1_204_887));

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await attach(view, 'Tệp PDF');

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(pick).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        attachments: [expect.objectContaining({ fileType: 'application/pdf', fileSize: 1_204_887 })],
      }),
    );
  });

  /** Nút Gửi phải KHOÁ trong lúc tệp còn đang bay — gửi sớm là gửi một tin thiếu đính kèm. */
  it('đang tải lên thì KHÔNG gửi được', async () => {
    const onSend = jest.fn();
    pick.mockResolvedValue([PHOTO]);
    upload.mockReturnValue(new Promise(() => undefined));

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await fireEvent.changeText(view.getByLabelText('Nhập tin nhắn của bạn…'), 'kèm ảnh nhé');
    await attach(view, 'Ảnh');

    await waitFor(() => expect(view.getByText('Đang tải lên…')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));
    expect(onSend).not.toHaveBeenCalled();
  });

  /**
   * Tệp SAI ĐỊNH DẠNG hay QUÁ NẶNG bị gỡ hẳn khỏi khay: chọn lại cũng ra đúng tệp đó, nên để nó
   * nằm lại ở trạng thái "lỗi" chỉ mời người dùng bấm thử một việc không bao giờ chạy.
   */
  it('tệp bị TỪ CHỐI thì báo đúng câu và gỡ khỏi khay', async () => {
    pick.mockResolvedValue([PHOTO]);
    upload.mockRejectedValue(new ChatAttachmentRejectedError('tooLarge'));

    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));
    await attach(view, 'Ảnh');

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Tệp vượt quá dung lượng cho phép.'),
    );
    expect(view.queryByText('a.jpg')).toBeNull();
  });

  it('định dạng không hỗ trợ có câu RIÊNG, không phải câu quá nặng', async () => {
    pick.mockResolvedValue([PHOTO]);
    upload.mockRejectedValue(new ChatAttachmentRejectedError('type'));

    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));
    await attach(view, 'Ảnh');

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Định dạng tệp không được hỗ trợ.'),
    );
  });

  /** Lỗi MẠNG thì GIỮ dòng lại — người dùng tự quyết gỡ hay để đó. */
  it('lỗi mạng khi tải lên thì giữ dòng ở trạng thái lỗi', async () => {
    pick.mockResolvedValue([PHOTO]);
    upload.mockRejectedValue(new Error('mất sóng'));

    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));
    await attach(view, 'Ảnh');

    expect(await view.findByText('Tải lên lỗi')).toBeTruthy();
    expect(view.getByText('a.jpg')).toBeTruthy();
  });

  it('gỡ một tệp khỏi khay thì nó không đi kèm tin nữa', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    pick.mockResolvedValue([PHOTO]);
    upload.mockResolvedValue(uploaded(PHOTO));

    const view = await render(withIntl(<ChatComposer onSend={onSend} />));
    await attach(view, 'Ảnh');
    await waitFor(() => expect(upload).toHaveBeenCalled());

    await fireEvent.press(view.getByRole('button', { name: 'Bỏ tệp a.jpg' }));
    await fireEvent.changeText(view.getByLabelText('Nhập tin nhắn của bạn…'), 'thôi không gửi ảnh');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ text: 'thôi không gửi ảnh' }));
  });

  it('chạm trần số tệp thì báo, và KHÔNG mở trình chọn nữa', async () => {
    pick.mockResolvedValue(
      Array.from({ length: CHAT_ATTACHMENT_MAX_COUNT }, (_, i) => ({
        ...PHOTO,
        fileName: `anh-${i}.jpg`,
      })),
    );
    upload.mockImplementation(async (file) => uploaded(file));

    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));
    await attach(view, 'Ảnh');
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(CHAT_ATTACHMENT_MAX_COUNT));

    pick.mockClear();
    await fireEvent.press(view.getByRole('button', { name: 'Đính kèm' }));

    expect(mockShowError).toHaveBeenCalledWith(
      `Mỗi tin nhắn gửi tối đa ${CHAT_ATTACHMENT_MAX_COUNT} tệp.`,
    );
    expect(pick).not.toHaveBeenCalled();
  });

  /** Chỗ còn trống truyền xuống trình chọn: chọn 6 khi đã có 4 là hai tệp bị rơi im lặng. */
  it('chỉ cho chọn đúng số chỗ CÒN LẠI', async () => {
    pick.mockResolvedValue([PHOTO, { ...PHOTO, fileName: 'b.jpg' }]);
    upload.mockImplementation(async (file) => uploaded(file));

    const view = await render(withIntl(<ChatComposer onSend={jest.fn()} />));
    await attach(view, 'Ảnh');
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    await fireEvent.press(view.getByRole('button', { name: 'Đính kèm' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Ảnh' }));

    expect(pick).toHaveBeenLastCalledWith('library', CHAT_ATTACHMENT_MAX_COUNT - 2);
  });

  /** Trần dung lượng của client và của DTO backend phải là MỘT hằng — không có số thứ hai. */
  it('dùng chung hằng trần với backend', () => {
    expect(CHAT_ATTACHMENT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('ChatComposer — ngữ cảnh xe', () => {
  const VEHICLE = { id: 'veh-1', name: 'VinFast VF8', imageUrl: null };

  it('gắn `vehicleId` vào câu ĐẦU TIÊN rồi gọi dọn thẻ', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const onClear = jest.fn();

    const view = await render(
      withIntl(
        <ChatComposer onSend={onSend} vehicleContext={VEHICLE} onClearVehicleContext={onClear} />,
      ),
    );

    expect(view.getByText('VinFast VF8')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Nhập tin nhắn của bạn…'), 'Xe này còn không?');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({ text: 'Xe này còn không?', vehicleId: 'veh-1' }),
    );
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('gửi HỎNG thì GIỮ thẻ lại — câu sau vẫn nói về đúng chiếc xe đó', async () => {
    const onSend = jest.fn().mockRejectedValue(new Error('mạng rớt'));
    const onClear = jest.fn();

    const view = await render(
      withIntl(
        <ChatComposer onSend={onSend} vehicleContext={VEHICLE} onClearVehicleContext={onClear} />,
      ),
    );
    await fireEvent.changeText(view.getByLabelText('Nhập tin nhắn của bạn…'), 'Xe này còn không?');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onClear).not.toHaveBeenCalled();
  });

  it('bấm X trên thẻ thì bỏ ngữ cảnh', async () => {
    const onClear = jest.fn();
    const view = await render(
      withIntl(
        <ChatComposer onSend={jest.fn()} vehicleContext={VEHICLE} onClearVehicleContext={onClear} />,
      ),
    );

    await fireEvent.press(view.getByRole('button', { name: 'Bỏ ngữ cảnh xe' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
