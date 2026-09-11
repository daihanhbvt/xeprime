import { Pool, type PoolClient } from 'pg';

/**
 * Advisory lock của worker — CHẠY TRÊN KẾT NỐI RIÊNG, không dùng pool của Prisma.
 *
 * Vì sao không dùng `prisma.$queryRaw` như bản trước: `pg_try_advisory_lock` là khoá cấp
 * **SESSION**, nghĩa là nó thuộc về đúng kết nối đã giành nó. Prisma không hứa hai lệnh liên
 * tiếp đi qua cùng một kết nối vật lý, nên `SELECT pg_advisory_unlock(...)` ở khối `finally`
 * hoàn toàn có thể chạy trên một kết nối KHÁC. Khi đó Postgres trả `false` trong im lặng
 * (không có lỗi, không có cảnh báo) và khoá ở lại trên kết nối cũ cho tới khi kết nối đó chết.
 * Hậu quả không phải chạy chồng — mà ngược lại: job đó **không bao giờ chạy lại nữa** trên
 * tiến trình này. Đúng thứ khó phát hiện nhất, vì nhìn từ ngoài worker vẫn sống.
 *
 * Ở đây mỗi lượt lấy một client ra khỏi pool, giành khoá, chạy `fn`, nhả khoá và trả client —
 * tất cả trên MỘT session. Client bị giữ trong suốt `fn`, nhưng đó là một KẾT NỐI, không phải
 * một transaction: không có snapshot nào bị giữ, không chặn VACUUM, và một lời gọi mạng chậm
 * (Firestore, FCM) không kéo dài một transaction nghiệp vụ nào.
 *
 * Kết nối chết giữa chừng ⇒ huỷ hẳn client thay vì trả về pool. Postgres tự nhả mọi advisory
 * lock của một session khi session đó đóng, nên đó cũng là đường tự phục hồi.
 */
export interface AdvisoryLockRunner {
  /** `true` = đã giành được khoá và `fn` đã chạy; `false` = instance khác đang giữ. */
  run(key: number, fn: () => Promise<void>): Promise<boolean>;
  /** Đóng toàn bộ kết nối — Postgres nhả mọi khoá còn lại của chúng. */
  close(): Promise<void>;
}

export interface AdvisoryLockOptions {
  /**
   * Số kết nối tối đa. Phải LỚN HƠN số vòng lặp chạy song song, nếu không một vòng lặp sẽ đứng
   * chờ client trong khi vòng khác đang giữ khoá — nhìn từ ngoài giống hệt treo.
   */
  max?: number;
  /**
   * Số vòng lặp sẽ dùng runner này. Khai ra để việc thêm vòng lặp thứ (max+1) trở thành một lỗi
   * lúc KHỞI ĐỘNG, thay vì một vòng lặp treo im lặng mà một năm sau mới có người để ý.
   */
  loops?: number;
}

export function createAdvisoryLocks(
  connectionString: string,
  options: AdvisoryLockOptions = {},
): AdvisoryLockRunner {
  const max = options.max ?? 12;
  if (options.loops !== undefined && options.loops >= max) {
    throw new Error(
      `advisory lock: cần nhiều hơn ${options.loops} kết nối cho ${options.loops} vòng lặp ` +
        `(max hiện tại ${max}) — nếu không sẽ có vòng lặp đứng chờ client vô thời hạn.`,
    );
  }

  const pool = new Pool({
    connectionString,
    max,
    // Nhận diện được trong `pg_stat_activity` khi phải soi xem ai đang giữ khoá.
    application_name: 'xeprime-worker-locks',
    /*
     * Pool cạn ⇒ THẤT BẠI, không treo. Không có mốc này thì `pool.connect()` chờ vô hạn và vòng
     * lặp đứng im mà health check vẫn thấy "chưa có lỗi nào" — đúng loại sự cố khó nhất.
     */
    connectionTimeoutMillis: 10_000,
  });

  /*
   * BẮT BUỘC: `pg.Pool` là EventEmitter và nó phát `'error'` khi backend giết một client ĐANG
   * RỖI (Postgres khởi động lại, `pg_terminate_backend`, idle timeout). Không có listener thì
   * Node ném uncaught exception và worker chết — đúng tình huống mà cả file này sinh ra để sống
   * sót qua. Kết nối hỏng đã bị pool loại; ở đây chỉ cần ghi lại.
   */
  pool.on('error', (err) => {
    console.error('advisory lock: kết nối rỗi bị đóng —', String(err?.message ?? err).slice(0, 200));
  });

  const run = async (key: number, fn: () => Promise<void>): Promise<boolean> => {
    const client: PoolClient = await pool.connect();
    let broken = false;

    try {
      const acquired = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [key],
      );
      if (!acquired.rows[0]?.locked) return false;

      try {
        await fn();
      } finally {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [key]);
        } catch {
          /*
           * Không nhả được nghĩa là kết nối đã hỏng. Đánh dấu để HUỶ client thay vì trả nó về
           * pool: một kết nối còn giữ khoá mà quay lại pool sẽ khiến job này không bao giờ chạy
           * được nữa. Huỷ kết nối là cách duy nhất chắc chắn nhả khoá.
           */
          broken = true;
        }
      }
      return true;
    } finally {
      /*
       * Lỗi từ chính `fn` được ném thẳng lên vòng lặp — nó là lỗi nghiệp vụ, không phải việc của
       * lớp khoá. Nhưng client thì phải được trả về pool (hoặc HUỶ nếu kết nối đã hỏng) trong mọi
       * đường ra, kể cả đường ném lỗi.
       */
      client.release(broken ? new Error('advisory lock: kết nối hỏng, huỷ client') : undefined);
    }
  };

  return { run, close: () => pool.end() };
}
