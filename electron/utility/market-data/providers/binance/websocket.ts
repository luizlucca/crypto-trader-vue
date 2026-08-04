import { defer, Observable, retry, timer } from 'rxjs'
import WebSocket, { type RawData } from 'ws'
import type {
  ConnectionStateHandler,
} from '../../provider'

const maximumBackoffMs = 15_000

/**
 * Consecutive failures before the state stops calling itself "reconnecting".
 *
 * Retrying itself stays unbounded — a stream that can come back has to come
 * back on its own, and a network outage is not a reason to give up on the
 * market. What changes is the claim. A permanently invalid stream, a delisted
 * symbol above all, fails identically forever, and reporting that as
 * "reconnecting" makes the interface unable to tell a blip from a dead stream.
 * With the backoff below, this lands after roughly a minute of silence.
 */
const failuresBeforeError = 6

/**
 * Binance sends a ping frame every three minutes on the market streams, so a
 * live connection is never quiet for longer than that no matter how illiquid
 * the pair is. Two missed windows mean the socket died without TCP ever saying
 * so: no close, no error, and a book frozen on the last frame it received.
 */
const idleTimeoutMs = 6 * 60_000

/**
 * Checked on a fixed interval rather than by rearming a timer per frame: the
 * depth stream delivers ten messages a second per session, and the liveness
 * check must not allocate on that path.
 */
const idleCheckIntervalMs = 30_000

function messageText(data: RawData): string {
  if (typeof data === 'string') {
    return data
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }
  return data.toString('utf8')
}

export function websocketJSON$<T>(
  url: string,
  onState: ConnectionStateHandler,
): Observable<T> {
  let connectedOnce = false

  return defer(() => new Observable<T>((subscriber) => {
    onState({
      state: connectedOnce ? 'reconnecting' : 'connecting',
    })

    const socket = new WebSocket(url, {
      handshakeTimeout: 10_000,
      maxPayload: 1 << 20,
      perMessageDeflate: false,
    })
    let disposed = false
    let lastActivityAt = Date.now()

    function noteActivity(): void {
      lastActivityAt = Date.now()
    }

    const idleCheck = setInterval(() => {
      if (!disposed && Date.now() - lastActivityAt >= idleTimeoutMs) {
        subscriber.error(new Error(
          'WebSocket Binance parou de entregar dados',
        ))
      }
    }, idleCheckIntervalMs)

    socket.once('open', () => {
      connectedOnce = true
      noteActivity()
      onState({ state: 'connected' })
    })
    socket.on('message', (data) => {
      noteActivity()
      try {
        subscriber.next(JSON.parse(messageText(data)) as T)
      } catch (error) {
        subscriber.error(error)
      }
    })
    // Control frames prove the peer is alive even when the pair is not trading.
    socket.on('ping', noteActivity)
    socket.on('pong', noteActivity)
    socket.once('error', (error) => {
      if (!disposed) {
        subscriber.error(error)
      }
    })
    socket.once('close', (code, reason) => {
      if (!disposed) {
        subscriber.error(new Error(
          `WebSocket Binance encerrado (${code}): ${reason.toString()}`,
        ))
      }
    })

    return () => {
      disposed = true
      clearInterval(idleCheck)
      socket.removeAllListeners()
      // Switching symbols can dispose a socket during its handshake. `ws`
      // reports that abort through `error`; retain a sink so it never becomes
      // an uncaught EventEmitter error in the isolated utility process.
      socket.on('error', () => {})
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate()
      }
    }
  })).pipe(
    retry({
      count: Number.POSITIVE_INFINITY,
      resetOnSuccess: true,
      delay: (error, retryCount) => {
        const message = error instanceof Error ? error.message : String(error)
        onState({
          state: retryCount >= failuresBeforeError ? 'error' : 'reconnecting',
          message,
        })
        const delay = Math.min(
          1_000 * (2 ** Math.min(retryCount - 1, 4)),
          maximumBackoffMs,
        )
        return timer(delay)
      },
    }),
  )
}
