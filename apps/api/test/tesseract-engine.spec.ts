import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorker } from 'tesseract.js';
import {
  DriverLicenceReaderError,
  READER_FAILURE,
} from '../src/modules/driver-licences/reader/driver-licence-reader';
import { TesseractDriverLicenceReader } from '../src/modules/driver-licences/reader/tesseract-driver-licence-reader';

jest.mock('tesseract.js', () => ({ createWorker: jest.fn(), OEM: { LSTM_ONLY: 1 } }));

/**
 * Vòng đời worker Tesseract (ADR 0057 điều 2b) — giả lập tesseract.js để tái hiện đúng các cách nó
 * hỏng ngoài đời: `createWorker` treo vĩnh viễn khi dữ liệu ngôn ngữ hỏng (chỉ gọi `errorHandler`),
 * `terminate()` không nhả việc đang dở, thread chết giữa chừng.
 *
 * Bất biến được khoá: KHÔNG lượt đọc nào treo quá hạn của nó, và một lần hỏng không làm cả hàng
 * đợi đứng — nếu không, mọi lượt nộp bằng lái sau đó kẹt ở "đang đọc" cho tới khi tiến trình chết.
 */

const createWorkerMock = createWorker as unknown as jest.Mock;
const IMAGE = readFileSync(join(__dirname, 'fixtures/driver-licences/vn-pet-b2-valid.jpg'));
const input = { image: IMAGE, mimeType: 'image/jpeg' as const };
const EMPTY_PAGE = { data: { blocks: [] } };

const never = () => new Promise<never>(() => undefined);

function fakeWorker(recognize: jest.Mock = jest.fn(async () => EMPTY_PAGE)) {
  return {
    /** Thread thật của worker_threads mà tesseract.js giữ ở `worker.worker`. */
    worker: new EventEmitter(),
    recognize,
    setParameters: jest.fn(async () => ({})),
    terminate: jest.fn(async () => ({})),
  };
}

/** Hạn ngắn cho test; lượt đọc thật (ảnh → 6 lần nhận dạng giả) cần vài trăm mili-giây. */
const LIMITS = {
  readTimeoutMs: 3_000,
  createTimeoutMs: 100,
  createBackoffMs: 60_000,
  idleShutdownMs: 60_000,
};

/** Bắt lỗi của một promise NGAY (không để thành unhandled rejection trong lúc chờ). */
const settle = (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

async function until(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('hết giờ chờ điều kiện');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const codeOf = (outcome: { ok: boolean; error?: unknown }) =>
  outcome.error instanceof DriverLicenceReaderError ? outcome.error.code : outcome.error;

afterEach(() => createWorkerMock.mockReset());

describe('TesseractEngine — không bao giờ treo', () => {
  it('nạp dữ liệu hỏng (createWorker treo, chỉ errorHandler kêu) ⇒ hỏng ngay; trong thời gian chờ không dựng lại', async () => {
    createWorkerMock.mockImplementation(
      (_lang: string, _oem: number, options: { errorHandler: (e: unknown) => void }) => {
        setTimeout(() => options.errorHandler('ENOENT: vie.traineddata.gz'), 10);
        return never();
      },
    );
    const reader = new TesseractDriverLicenceReader(LIMITS);

    expect(codeOf(await settle(reader.read(input)))).toBe(READER_FAILURE.PROVIDER_ERROR);
    expect(codeOf(await settle(reader.read(input)))).toBe(READER_FAILURE.PROVIDER_ERROR);
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    await reader.dispose();
  });

  it('createWorker treo im lặng ⇒ hết hạn khởi động; lượt sau không xếp hàng sau một lời hứa treo', async () => {
    createWorkerMock.mockImplementation(() => never());
    const reader = new TesseractDriverLicenceReader(LIMITS);
    const started = Date.now();

    expect(codeOf(await settle(reader.read(input)))).toBe(READER_FAILURE.TIMEOUT);
    expect((await settle(reader.read(input))).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
    await reader.dispose();
  });

  it('nhận dạng treo ⇒ hết giờ, bỏ worker đó; lượt sau dựng worker MỚI và chạy được', async () => {
    const stuck = fakeWorker(jest.fn(() => never()));
    const healthy = fakeWorker();
    createWorkerMock.mockResolvedValueOnce(stuck).mockResolvedValueOnce(healthy);
    // Hạn phải đủ cho lượt THỨ HAI (giải mã + sáu biến thể ảnh bằng sharp): trên runner CI 2 nhân
    // chạy song song các suite khác, 1,5s từng không đủ và lượt lành bị cắt thành TIMEOUT.
    const reader = new TesseractDriverLicenceReader({ ...LIMITS, readTimeoutMs: 5_000 });

    expect(codeOf(await settle(reader.read(input)))).toBe(READER_FAILURE.TIMEOUT);
    expect(stuck.terminate).toHaveBeenCalled();
    const second = await settle(reader.read(input));
    expect(second).toMatchObject({ ok: true, value: { readable: false } });
    expect(createWorkerMock).toHaveBeenCalledTimes(2);
    await reader.dispose();
  }, 20_000);

  it('thread chết giữa chừng ⇒ lượt đang chờ nó được nhả ngay, tiến trình không sập', async () => {
    const dying = fakeWorker(jest.fn(() => never()));
    createWorkerMock.mockResolvedValueOnce(dying);
    const reader = new TesseractDriverLicenceReader({ ...LIMITS, readTimeoutMs: 30_000 });

    const pending = settle(reader.read(input));
    await until(() => dying.recognize.mock.calls.length > 0);
    // Không có tai nghe 'error' thì dòng này NÉM (ERR_UNHANDLED_ERROR) và làm sập cả API.
    dying.worker.emit('error', new Error('RuntimeError: memory access out of bounds'));

    const outcome = await pending;
    expect(codeOf(outcome)).toBe(READER_FAILURE.PROVIDER_ERROR);
    await reader.dispose();
  });

  it('quá trần hàng đợi ⇒ OCR_BUSY ngay; tắt bộ đọc nhả mọi lượt đang chờ', async () => {
    const slow = fakeWorker(jest.fn(() => never()));
    createWorkerMock.mockResolvedValue(slow);
    const reader = new TesseractDriverLicenceReader({
      ...LIMITS,
      readTimeoutMs: 30_000,
      maxQueuedReads: 2,
    });

    const running = settle(reader.read(input));
    const waiting = settle(reader.read(input));
    expect(codeOf(await settle(reader.read(input)))).toBe(READER_FAILURE.BUSY);

    await until(() => slow.recognize.mock.calls.length > 0);
    await reader.dispose();
    expect((await running).ok).toBe(false);
    expect((await waiting).ok).toBe(false);
  });

  it('ảnh không giải mã được ⇒ OCR_IMAGE_UNDECODABLE; worker lành vẫn được giữ', async () => {
    const healthy = fakeWorker();
    createWorkerMock.mockResolvedValue(healthy);
    const reader = new TesseractDriverLicenceReader(LIMITS);

    const outcome = await settle(
      reader.read({ image: Buffer.from('not an image at all'), mimeType: 'image/jpeg' }),
    );
    expect(codeOf(outcome)).toBe(READER_FAILURE.IMAGE_UNDECODABLE);
    expect(healthy.terminate).not.toHaveBeenCalled();
    await reader.dispose();
  });
});
