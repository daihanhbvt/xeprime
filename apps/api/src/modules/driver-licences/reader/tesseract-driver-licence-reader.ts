import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Worker as NodeWorker } from 'node:worker_threads';
import { Logger } from '@nestjs/common';
import {
  DRIVER_LICENCE_QUALITY_ISSUE,
  type DriverLicenceQualityIssue,
  type ImageUploadMimeType,
} from '@xeprime/types';
import sharp, { type Sharp } from 'sharp';
import { createWorker, OEM, type Worker } from 'tesseract.js';
import {
  DriverLicenceReaderError,
  READER_FAILURE,
  type DriverLicenceReader,
  type DriverLicenceReading,
} from './driver-licence-reader';
import {
  analysePass,
  mergePasses,
  orientationScore,
  type OcrLine,
  type PassFindings,
} from './licence-text';

/**
 * Đọc ảnh bằng lái bằng Tesseract chạy NGAY TRONG tiến trình API — ADR 0057 điều 2b.
 *
 * Không khoá, không gọi ra ngoài, không tốn phí theo lượt: lõi Tesseract là WASM (`tesseract.js`)
 * chạy trong một worker thread, dữ liệu tiếng Việt (`@tesseract.js-data/vie`) đóng gói trong
 * node_modules. Ảnh khách KHÔNG rời máy chủ.
 *
 * Tesseract kém một mô hình thị giác ở ảnh điện thoại (nghiêng, loá, đọc nhầm chữ số), nên:
 *  - mỗi ảnh đọc BA lượt với ba cách xử lý ảnh khác nhau, rồi `mergePasses` bỏ phiếu từng trường;
 *  - ảnh chụp xoay ngang/dọc được thử ở các góc 90°/270°/180° khi lượt đầu không thấy chữ của
 *    một giấy tờ nào;
 *  - GPLX Việt Nam: đọc đủ trường rồi mới tự xác thực; bằng quốc tế / nước ngoài: chỉ cần nhận ra
 *    đúng là một tấm bằng lái (ADR 0057 điều 2c).
 */

/** Cạnh dài tối đa của ảnh đưa vào đọc — client đã nén về 2000px, đây là trần phòng thủ. */
const MAX_EDGE_PX = 2000;
/** Lượt đọc ảnh xám được phóng to tới cạnh dài này (Tesseract đọc chữ nhỏ kém). */
const UPSCALED_EDGE_PX = 2800;
/**
 * Trần số điểm ảnh sharp chịu giải mã. Client gửi ảnh ≤ 2000px (4MP); một PNG 5MB dựng sẵn để nở
 * ra hàng trăm megapixel thì bị từ chối trước khi chiếm RAM.
 */
const MAX_INPUT_PIXELS = 25_000_000;
/** Ngưỡng `orientationScore` để coi ảnh đúng chiều — xem `licence-text.ts`. */
const ORIENTATION_MIN_SCORE = 3;
/** Lượt đầu đọc rõ chừng này chữ thì ảnh chắc chắn đúng chiều (chữ xoay ngang thì Tesseract không đọc ra). */
const UPRIGHT_MIN_CONFIDENT_WORDS = 30;
/** Các mốc thời gian / trần của worker — chỉ test mới đổi (để không phải chờ 20 giây thật). */
export interface TesseractReaderLimits {
  /** Trần cho CẢ lượt đọc một ảnh (tối đa 7 lần nhận dạng: 4 chiều xoay + 3 lượt bỏ phiếu). */
  readTimeoutMs: number;
  /** Khởi động worker (nạp WASM + dữ liệu tiếng Việt) bình thường dưới 1 giây. */
  createTimeoutMs: number;
  /** Khởi động hỏng ⇒ các lượt trong khoảng này vào thẳng hàng đợi duyệt tay, không thử lại liên tục. */
  createBackoffMs: number;
  /**
   * Số lượt đang chạy + đang chờ tối đa. Một lượt ~2–5 giây; quá trần thì lượt mới sang người
   * duyệt ngay (`OCR_BUSY`) thay vì xếp hàng giữ ảnh trong RAM.
   */
  maxQueuedReads: number;
  /** Worker rảnh quá lâu thì tắt để trả RAM; lượt sau khởi động lại trong < 1 giây. */
  idleShutdownMs: number;
}

const DEFAULT_LIMITS: TesseractReaderLimits = {
  readTimeoutMs: 60_000,
  createTimeoutMs: 20_000,
  createBackoffMs: 60_000,
  maxQueuedReads: 20,
  idleShutdownMs: 3 * 60_000,
};

/**
 * Ngưỡng chất lượng ảnh — chỉ để GỢI Ý cách chụp lại khi đọc thiếu trường, không bao giờ tự chặn
 * một ảnh đọc đủ. Đo trên ảnh xám thu về cạnh dài 800px.
 */
const QUALITY = {
  /**
   * Tỉ lệ điểm ảnh có cạnh SẮC (|Laplace| > 25). Đo trên bộ mẫu: ảnh nhoè 0%, ảnh rõ — kể cả
   * chụp nghiêng, chụp tối — từ 3,3% trở lên. Ngưỡng đặt thấp hẳn để không gán "mờ" oan.
   */
  minStrongEdgeShare: 0.005,
  /** Độ sáng trung bình 0–255 của ảnh xám. */
  minBrightness: 60,
  /** Cạnh ngắn của ảnh gốc. */
  minShortEdgePx: 600,
} as const;

const DATA_PACKAGE = '@tesseract.js-data/vie';
const LANGUAGE = 'vie';

// sharp chỉ dùng ở đây, cho ảnh đọc một lần rồi bỏ — bộ nhớ đệm của libvips chỉ giữ RAM vô ích.
sharp.cache(false);

function resolveLangPath(): string {
  return join(dirname(require.resolve(`${DATA_PACKAGE}/package.json`)), '4.0.0_best_int');
}

/** Phiên bản thật đang chạy — ghi vào `ocr_model` để biết lượt đọc nào do bản nào làm. */
function packageVersion(name: string): string {
  try {
    const manifest = readFileSync(require.resolve(`${name}/package.json`), 'utf8');
    return (JSON.parse(manifest) as { version: string }).version;
  } catch {
    return '?';
  }
}

export class TesseractDriverLicenceReader implements DriverLicenceReader {
  readonly name = 'tesseract';
  readonly model = `tesseract.js ${packageVersion('tesseract.js')} · ${LANGUAGE} best_int`;
  readonly enabled = true;
  private readonly logger = new Logger(TesseractDriverLicenceReader.name);
  private readonly limits: TesseractReaderLimits;
  private readonly engine: TesseractEngine;

  constructor(limits: Partial<TesseractReaderLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.engine = new TesseractEngine(this.logger, this.limits);
  }

  /**
   * Đủ thứ để chạy không — gọi lúc dựng module. Thiếu dữ liệu ngôn ngữ (cài hỏng, image build
   * thiếu file) thì báo NGAY lúc khởi động, không phải ở lượt nộp đầu tiên của một khách.
   */
  static unavailableReason(): string | null {
    try {
      const file = join(resolveLangPath(), `${LANGUAGE}.traineddata.gz`);
      return existsSync(file) ? null : `thiếu ${file}`;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** `mimeType` không cần: sharp nhận dạng định dạng từ chính nội dung ảnh. */
  read(input: { image: Uint8Array; mimeType: ImageUploadMimeType }): Promise<DriverLicenceReading> {
    // Giải mã ảnh nằm TRONG hàng đợi: mỗi lúc chỉ một ảnh được bung ra RAM.
    return this.engine.exclusive(this.limits.readTimeoutMs, async (recognize) => {
      const prepared = await prepareImage(input.image);

      // 1) Lượt đầu trên ảnh gốc; không thấy giấy tờ nào ⇒ thử các chiều xoay khác.
      let rotation = 0;
      let first = analysePass(await recognize(await variantOriginal(prepared, 0)));
      // Đọc RÕ nhiều chữ ở chiều gốc nghĩa là ảnh đã đúng chiều (chỉ là không phải bằng lái) — xoay
      // thử một trang chữ dày là ba lần nhận dạng vô ích, mỗi lần vài giây.
      if (
        orientationScore(first) < ORIENTATION_MIN_SCORE &&
        first.confidentWords < UPRIGHT_MIN_CONFIDENT_WORDS
      ) {
        for (const angle of [90, 270, 180]) {
          const pass = analysePass(await recognize(await variantOriginal(prepared, angle)));
          if (orientationScore(pass) > orientationScore(first)) {
            first = pass;
            rotation = angle;
          }
          if (orientationScore(first) >= ORIENTATION_MIN_SCORE) break;
        }
      }
      // 2) Hai lượt nữa ở đúng chiều đó, mỗi lượt một cách xử lý ảnh — để bỏ phiếu.
      const passes: PassFindings[] = [
        first,
        analysePass(await recognize(await variantGrey(prepared, rotation))),
        analysePass(await recognize(await variantBinary(prepared, rotation))),
      ];
      const context = { qualityIssues: prepared.qualityIssues, rotation };
      const reading = mergePasses(passes, context);
      // 3) Mập mờ trên một GPLX mặt trước (một trường then chốt chỉ một lượt đọc được, hay các lượt
      //    lệch nhau): thêm MỘT lượt phân xử rồi bỏ phiếu lại. Chỉ ảnh khó mới tốn thêm lượt này.
      if (
        reading.confidence !== 'low' ||
        reading.documentKind !== 'vn' ||
        reading.side !== 'front'
      ) {
        return reading;
      }
      passes.push(analysePass(await recognize(await variantLocalContrast(prepared, rotation))));
      return mergePasses(passes, context);
    });
  }

  /** Tắt worker — `DriverLicencesService` gọi sau khi các lượt đọc dở đã xong (tắt tiến trình). */
  dispose(): Promise<void> {
    this.engine.dispose();
    return Promise.resolve();
  }
}

// ── Ảnh ───────────────────────────────────────────────────────────────────────────────────

interface PreparedImage {
  /** Đã xoay theo EXIF, thu về cạnh dài ≤ `MAX_EDGE_PX`, PNG. */
  png: Buffer;
  longEdge: number;
  qualityIssues: DriverLicenceQualityIssue[];
}

async function prepareImage(image: Uint8Array): Promise<PreparedImage> {
  try {
    const original = sharp(image, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    const meta = await original.metadata();
    const { data, info } = await original
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    const shortEdge = Math.min(meta.width ?? 0, meta.height ?? 0);
    return {
      png: data,
      longEdge: Math.max(info.width, info.height),
      qualityIssues: await measureQuality(data, shortEdge),
    };
  } catch (error) {
    // Đúng chữ ký định dạng nhưng nội dung hỏng, hoặc nở quá trần điểm ảnh.
    throw new DriverLicenceReaderError(
      READER_FAILURE.IMAGE_UNDECODABLE,
      `Không giải mã được ảnh: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function measureQuality(
  png: Buffer,
  shortEdge: number,
): Promise<DriverLicenceQualityIssue[]> {
  const grey = () => sharp(png).resize({ width: 800, height: 800, fit: 'inside' }).greyscale();
  // `.stats()` của sharp đo trên ảnh ĐẦU VÀO (bỏ qua resize/greyscale) — nên đo trên điểm ảnh thô.
  const [pixels, edges] = await Promise.all([
    grey().raw().toBuffer(),
    grey()
      .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
      .raw()
      .toBuffer(),
  ]);
  let sum = 0;
  for (const value of pixels) sum += value;
  let strong = 0;
  for (const value of edges) if (Math.abs(value - 128) > 25) strong += 1;

  const issues: DriverLicenceQualityIssue[] = [];
  if (edges.length > 0 && strong / edges.length < QUALITY.minStrongEdgeShare) {
    issues.push(DRIVER_LICENCE_QUALITY_ISSUE.BLURRY);
  }
  if (pixels.length > 0 && sum / pixels.length < QUALITY.minBrightness) {
    issues.push(DRIVER_LICENCE_QUALITY_ISSUE.TOO_DARK);
  }
  if (shortEdge > 0 && shortEdge < QUALITY.minShortEdgePx) {
    issues.push(DRIVER_LICENCE_QUALITY_ISSUE.LOW_RESOLUTION);
  }
  return issues;
}

/** Ảnh màu như khách chụp — Tesseract tự nhị phân hoá. */
function variantOriginal(image: PreparedImage, angle: number): Promise<Buffer> {
  return sharp(image.png).rotate(angle).png().toBuffer();
}

/** Xám, giãn tương phản, phóng to — đọc tốt nhất chữ nhỏ và chữ màu trên nền màu. */
function greyUpscaled(image: PreparedImage, angle: number): Sharp {
  const edge = Math.round(
    image.longEdge * Math.max(1, Math.min(2, UPSCALED_EDGE_PX / image.longEdge)),
  );
  return sharp(image.png)
    .rotate(angle)
    .resize({ width: edge, height: edge, fit: 'inside' })
    .greyscale()
    .normalise()
    .toColourspace('b-w');
}

function variantGrey(image: PreparedImage, angle: number): Promise<Buffer> {
  return greyUpscaled(image, angle).png().toBuffer();
}

/** Đen trắng cứng — mất chữ mảnh nhưng cắt được hoa văn nền và vết loá nhẹ. */
function variantBinary(image: PreparedImage, angle: number): Promise<Buffer> {
  return greyUpscaled(image, angle).threshold(140).png().toBuffer();
}

/**
 * Lượt phân xử: cân bằng sáng CỤC BỘ (CLAHE) — kéo chữ lên ở ảnh tối hay sáng không đều, chỗ mà
 * giãn tương phản toàn ảnh (`normalise`) bị vùng nền sáng/tối nhất "ăn" mất dải.
 */
function variantLocalContrast(image: PreparedImage, angle: number): Promise<Buffer> {
  const edge = Math.round(
    image.longEdge * Math.max(1, Math.min(2, UPSCALED_EDGE_PX / image.longEdge)),
  );
  return sharp(image.png)
    .rotate(angle)
    .resize({ width: edge, height: edge, fit: 'inside' })
    .greyscale()
    .clahe({ width: 64, height: 64 })
    .toColourspace('b-w')
    .png()
    .toBuffer();
}

// ── Worker ────────────────────────────────────────────────────────────────────────────────

type Recognize = (image: Buffer) => Promise<OcrLine[]>;

/**
 * Một worker đang sống. `aborted` bị reject khi worker bị bỏ (hết giờ, thread chết, tắt tiến
 * trình) — mọi lượt nhận dạng đang chờ nó nhả ra ngay. Không có nó, một lượt chờ worker đã chết
 * treo vĩnh viễn: `terminate()` của tesseract.js không reject việc đang dở.
 */
interface Generation {
  worker: Worker;
  aborted: Promise<never>;
  abort: (reason: Error) => void;
}

/** Lỗi đến từ chính worker (hết giờ, thread chết, nhận dạng hỏng) — worker đó phải bỏ. */
class WorkerFault extends DriverLicenceReaderError {}

/**
 * MỘT worker Tesseract cho cả tiến trình, chạy TUẦN TỰ (Tesseract dùng trọn một nhân CPU cho một
 * ảnh — chạy song song chỉ làm mọi lượt cùng chậm). Khởi động lười ở lượt đầu, tự tắt khi rảnh.
 *
 * Bất biến quan trọng nhất: KHÔNG có nhánh nào chờ một promise của tesseract.js mà không có hạn —
 * thư viện để `createWorker` treo vĩnh viễn khi nạp dữ liệu hỏng, và không reject việc đang dở khi
 * worker bị tắt. Một lần chờ như vậy là cả hàng đợi đứng mãi mãi.
 */
class TesseractEngine {
  private ready: Generation | null = null;
  private creating: Promise<Generation> | null = null;
  private createFailedAt = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    private readonly logger: Logger,
    private readonly limits: TesseractReaderLimits,
  ) {}

  exclusive<T>(timeoutMs: number, job: (recognize: Recognize) => Promise<T>): Promise<T> {
    if (this.queued >= this.limits.maxQueuedReads) {
      return Promise.reject(
        new DriverLicenceReaderError(READER_FAILURE.BUSY, 'Bộ đọc đang quá tải'),
      );
    }
    this.queued += 1;
    const run = this.tail
      .then(() => this.runWithTimeout(timeoutMs, job))
      .finally(() => {
        this.queued -= 1;
      });
    this.tail = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    this.disposed = true;
    this.clearIdle();
    this.discard(new Error('Bộ đọc đã tắt'));
  }

  private async runWithTimeout<T>(
    timeoutMs: number,
    job: (recognize: Recognize) => Promise<T>,
  ): Promise<T> {
    if (this.disposed) {
      throw new DriverLicenceReaderError(READER_FAILURE.PROVIDER_ERROR, 'Bộ đọc đã tắt');
    }
    if (Date.now() - this.createFailedAt < this.limits.createBackoffMs) {
      throw new DriverLicenceReaderError(
        READER_FAILURE.PROVIDER_ERROR,
        'Bộ đọc vừa khởi động hỏng — tạm thời không đọc tự động',
      );
    }
    this.clearIdle();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new WorkerFault(READER_FAILURE.TIMEOUT, 'Đọc ảnh quá lâu')),
        timeoutMs,
      );
      timer.unref();
    });
    try {
      const generation = await Promise.race([this.getGeneration(), timeout]);
      const recognize: Recognize = (image) =>
        Promise.race([recognizeLines(generation.worker, image), generation.aborted]).catch(
          (error: unknown) => {
            throw error instanceof DriverLicenceReaderError
              ? error
              : new WorkerFault(READER_FAILURE.PROVIDER_ERROR, describe(error));
          },
        );
      return await Promise.race([job(recognize), timeout]);
    } catch (error) {
      // Worker hết giờ / chết / nhận dạng hỏng: bỏ hẳn nó, lượt sau dựng worker mới. Lỗi của
      // CHÍNH ẢNH (không giải mã được) thì worker vẫn lành, giữ lại.
      if (error instanceof WorkerFault) this.discard(error);
      throw error;
    } finally {
      clearTimeout(timer);
      this.scheduleIdle();
    }
  }

  private getGeneration(): Promise<Generation> {
    if (this.ready) return Promise.resolve(this.ready);
    if (!this.creating) {
      const attempt: Promise<Generation> = this.create().then(
        (generation) => {
          // Bị bỏ trong lúc đang dựng (hết giờ, tắt tiến trình): không được thành worker hiện tại.
          if (this.creating !== attempt || this.disposed) {
            void generation.worker.terminate().catch(() => undefined);
            throw new WorkerFault(READER_FAILURE.PROVIDER_ERROR, 'Worker bị bỏ khi đang dựng');
          }
          this.creating = null;
          this.ready = generation;
          return generation;
        },
        (error: unknown) => {
          if (this.creating === attempt) this.creating = null;
          this.createFailedAt = Date.now();
          this.logger.error(`Không khởi động được Tesseract: ${describe(error)}`);
          throw error;
        },
      );
      attempt.catch(() => undefined);
      this.creating = attempt;
    }
    return this.creating;
  }

  /**
   * Dựng một worker có HẠN. tesseract.js chỉ reject `createWorker` khi bước nạp lõi hỏng; nạp dữ
   * liệu ngôn ngữ / khởi tạo hỏng thì nó chỉ gọi `errorHandler` và để promise treo — nên chính
   * `errorHandler` (lúc đang dựng) là thứ báo hỏng ở đây.
   */
  private create(): Promise<Generation> {
    return new Promise<Generation>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          error instanceof DriverLicenceReaderError
            ? error
            : new WorkerFault(READER_FAILURE.PROVIDER_ERROR, describe(error)),
        );
      };
      const timer = setTimeout(
        () => fail(new WorkerFault(READER_FAILURE.TIMEOUT, 'Khởi động Tesseract quá lâu')),
        this.limits.createTimeoutMs,
      );
      timer.unref();

      createWorker(LANGUAGE, OEM.LSTM_ONLY, {
        langPath: resolveLangPath(),
        gzip: true,
        // Không ghi bản giải nén của dữ liệu ngôn ngữ ra thư mục làm việc của tiến trình.
        cacheMethod: 'none',
        // Thiếu hàm này thì tesseract.js NÉM lỗi trong trình nhận message — sập tiến trình.
        errorHandler: (error: unknown) => {
          if (!settled) fail(error);
          else this.logger.warn(`Tesseract: ${describe(error)}`);
        },
      })
        .then(async (worker) => {
          // DPI khai sẵn: tránh Tesseract in "Estimating resolution…" ra stdout mỗi ảnh.
          if (!settled) await worker.setParameters({ user_defined_dpi: '300' });
          if (settled) {
            // Đã hết giờ trong lúc dựng: worker này không ai dùng nữa.
            void worker.terminate();
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(this.track(worker));
        })
        .catch(fail);
    });
  }

  /** Gắn tai nghe vào thread thật: thread chết thì mọi việc đang chờ nó được nhả ngay. */
  private track(worker: Worker): Generation {
    let abort: (reason: Error) => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => {
      abort = reject;
    });
    // Không ai race với nó lúc rảnh — đừng để một lần bỏ worker thành unhandled rejection.
    aborted.catch(() => undefined);
    const generation: Generation = { worker, aborted, abort };

    // tesseract.js gán `worker.onerror`, thứ KHÔNG tồn tại trên worker_threads của Node: không có
    // tai nghe 'error' thì một lỗi trong thread là `ERR_UNHANDLED_ERROR` làm sập cả API.
    const thread = (worker as unknown as { worker?: NodeWorker }).worker;
    thread?.on('error', (error) => {
      this.logger.error(`Thread Tesseract lỗi: ${describe(error)}`);
      this.discard(new WorkerFault(READER_FAILURE.PROVIDER_ERROR, describe(error)), generation);
    });
    thread?.on('exit', (code) => {
      this.discard(
        new WorkerFault(READER_FAILURE.PROVIDER_ERROR, `Thread Tesseract đã dừng (${code})`),
        generation,
      );
    });
    return generation;
  }

  /**
   * Bỏ worker hiện tại (hoặc đúng `only`, nếu worker đó còn là worker hiện tại). Đồng bộ và không
   * chờ gì: việc đang chờ được nhả qua `abort`, thread được tắt ở nền.
   */
  private discard(reason: Error, only?: Generation): void {
    const current = this.ready;
    if (current && (!only || only === current)) {
      this.ready = null;
      current.abort(reason);
      void current.worker.terminate().catch(() => undefined);
    } else if (only) {
      only.abort(reason);
    }
    if (!only) {
      // Đang dựng dở: bỏ đánh dấu là đủ — `getGeneration` tự tắt worker đó khi nó dựng xong.
      this.creating = null;
    }
  }

  private scheduleIdle(): void {
    this.clearIdle();
    if (this.disposed) return;
    this.idleTimer = setTimeout(() => {
      if (this.queued === 0) this.discard(new Error('Rảnh — tắt để trả RAM'));
    }, this.limits.idleShutdownMs);
    this.idleTimer.unref();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

async function recognizeLines(worker: Worker, image: Buffer): Promise<OcrLine[]> {
  const { data } = await worker.recognize(image, {}, { blocks: true, text: false });
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        lines.push(
          line.words.map((w) => ({
            text: w.text,
            confidence: w.confidence,
            symbols: w.symbols.map((sym) => ({ text: sym.text, confidence: sym.confidence })),
          })),
        );
      }
    }
  }
  return lines;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
