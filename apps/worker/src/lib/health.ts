import { createServer, type Server } from 'node:http';

/**
 * Sức khoẻ của worker — thứ Docker và `deploy.sh` dùng để biết tiến trình này còn LÀM VIỆC,
 * không chỉ còn sống.
 *
 * Bài toán thật: worker không phục vụ request nào, nên `restart: unless-stopped` chỉ bắt được
 * trường hợp tiến trình chết. Một vòng lặp kẹt (kết nối DB treo, advisory lock không nhả, một
 * lời gọi mạng không có timeout) để lại một container "đang chạy" mà không đẩy tin nhắn, không
 * chiếu huy hiệu, và không ai biết cho tới khi người dùng phàn nàn.
 *
 * Nguyên tắc của cái ngưỡng: một vòng lặp CHỈ bị coi là hỏng khi nó im lặng lâu hơn HẲN nhịp của
 * chính nó. Đặt sát nhịp thì một lượt chạy chậm cũng thành "unhealthy", và một healthcheck hay
 * báo động giả là một healthcheck sẽ bị tắt đi.
 *
 * Không có gì nhạy cảm đi ra endpoint này: chỉ tên vòng lặp, mốc thời gian và số đếm. Không
 * token, không tên người dùng, không nội dung thông báo.
 */

/** Cổng nội bộ. Không publish ra ngoài — chỉ Docker healthcheck trong cùng container gọi tới. */
export const WORKER_HEALTH_PORT = 4100;

interface LoopState {
  /** Vòng lặp này có được tính vào kết luận healthy/unhealthy không. */
  critical: boolean;
  /** Im lặng quá bấy nhiêu mili-giây thì coi là hỏng. */
  staleAfterMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}

/**
 * Ba mức, và ranh giới giữa chúng là một quyết định vận hành chứ không phải chuyện đặt tên.
 *
 *  - `ok` — mọi thứ bình thường.
 *  - `degraded` — **bão hoà**: vòng lặp vẫn chạy nhưng không đuổi kịp (hàng đợi chiếu huy hiệu
 *    dồn). Endpoint vẫn trả **200**.
 *  - `unhealthy` — **chết**: một vòng lặp quan trọng im lặng quá ngưỡng của chính nó. Trả **503**.
 *
 * Vì sao bão hoà KHÔNG được trả 503: healthcheck này là cổng chặn của `deploy.sh`. Một đợt tồn
 * đọng — Firestore vừa hồi phục, hoặc lượt backfill đầu tiên sau rollout — sẽ giữ trạng thái bão
 * hoà vài phút, và nếu nó chặn deploy thì **không ai deploy được bản sửa cho chính sự cố đó**.
 * Đó là một vòng luẩn quẩn tự tạo ra.
 *
 * Bão hoà vẫn hiện rõ ở thân response và ở log (`badge: hàng đợi trễ …s`), tức là người trực vẫn
 * thấy — chỉ có cái cổng deploy là không bị nó khoá.
 */
export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthSnapshot {
  status: HealthStatus;
  uptimeMs: number;
  loops: Record<
    string,
    {
      critical: boolean;
      staleAfterMs: number;
      lastSuccessAgoMs: number | null;
      consecutiveFailures: number;
      lastError: string | null;
      stale: boolean;
    }
  >;
  gauges: Record<string, number | null>;
}

export class WorkerHealth {
  private readonly loops = new Map<string, LoopState>();
  private readonly gauges = new Map<string, number | null>();
  private readonly startedAt = Date.now();

  /**
   * Khai báo một vòng lặp. `critical: false` cho các việc theo giờ/ngày (ngày lễ, retention) —
   * chúng im lặng hàng giờ là bình thường, và kéo chúng vào kết luận sức khoẻ chỉ tạo báo động giả.
   */
  register(name: string, opts: { critical: boolean; staleAfterMs: number }): void {
    this.loops.set(name, {
      critical: opts.critical,
      staleAfterMs: opts.staleAfterMs,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      consecutiveFailures: 0,
    });
  }

  markSuccess(name: string): void {
    const loop = this.loops.get(name);
    if (!loop) return;
    loop.lastSuccessAt = Date.now();
    loop.consecutiveFailures = 0;
    loop.lastError = null;
  }

  markFailure(name: string, err: unknown): void {
    const loop = this.loops.get(name);
    if (!loop) return;
    loop.lastFailureAt = Date.now();
    loop.consecutiveFailures += 1;
    // Chỉ thông điệp, cắt ngắn — stack trace và payload không thuộc về một endpoint sức khoẻ.
    loop.lastError = String((err as Error)?.message ?? err).slice(0, 200);
  }

  /** Số đo phụ (vd độ trễ hàng đợi huy hiệu). `null` = chưa đo được / không áp dụng. */
  setGauge(name: string, value: number | null): void {
    this.gauges.set(name, value);
  }

  /**
   * Ngưỡng riêng cho một số đo — vượt là `degraded`. Dùng cho độ trễ hàng đợi: vòng lặp vẫn chạy
   * đều nhưng không đuổi kịp thì nhìn từ "lastSuccess" vẫn khoẻ, mà thực tế badge đang đứng im.
   */
  private readonly gaugeLimits = new Map<string, number>();

  limitGauge(name: string, maxValue: number): void {
    this.gaugeLimits.set(name, maxValue);
  }

  snapshot(): HealthSnapshot {
    const now = Date.now();
    const loops: HealthSnapshot['loops'] = {};
    let unhealthy = false;
    let saturated = false;

    for (const [name, loop] of this.loops) {
      /*
       * Trước lượt chạy THÀNH CÔNG đầu tiên, mốc so là lúc khởi động. Nếu không thì mọi vòng lặp
       * đều "chưa bao giờ thành công" và container mới lên luôn bị đánh unhealthy ngay — nên
       * `start_period` của Docker mới là chỗ xử lý giai đoạn khởi động, không phải chỗ này.
       */
      const since = loop.lastSuccessAt ?? this.startedAt;
      const stale = now - since > loop.staleAfterMs;
      if (loop.critical && stale) unhealthy = true;

      loops[name] = {
        critical: loop.critical,
        staleAfterMs: loop.staleAfterMs,
        lastSuccessAgoMs: loop.lastSuccessAt === null ? null : now - loop.lastSuccessAt,
        consecutiveFailures: loop.consecutiveFailures,
        lastError: loop.lastError,
        stale,
      };
    }

    const gauges: Record<string, number | null> = {};
    for (const [name, value] of this.gauges) {
      gauges[name] = value;
      const limit = this.gaugeLimits.get(name);
      if (limit !== undefined && value !== null && value > limit) saturated = true;
    }

    return {
      status: unhealthy ? 'unhealthy' : saturated ? 'degraded' : 'ok',
      uptimeMs: now - this.startedAt,
      loops,
      gauges,
    };
  }
}

/**
 * Server sức khoẻ nội bộ. Trả **503 chỉ khi `unhealthy`** (một vòng lặp quan trọng đã chết);
 * `degraded` vẫn là 200 — xem docblock của `HealthStatus` về vòng luẩn quẩn mà nó tránh.
 *
 * Docker healthcheck chỉ nhìn mã trạng thái, còn thân response là để người trực đọc khi đi tìm
 * nguyên nhân.
 */
export function startHealthServer(health: WorkerHealth, port = WORKER_HEALTH_PORT): Server {
  const server = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    const snapshot = health.snapshot();
    res.writeHead(snapshot.status === 'unhealthy' ? 503 : 200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(snapshot));
  });

  // Chỉ loopback: endpoint này không có xác thực, và nó không cần rời khỏi container.
  server.listen(port, '127.0.0.1');
  server.unref();
  return server;
}
