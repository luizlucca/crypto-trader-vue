import { defer, Observable, retry, timer } from 'rxjs'
import WebSocket, { type RawData } from 'ws'
import type {
  ConnectionStateHandler,
} from '../../provider'

const maximumBackoffMs = 15_000

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

    socket.once('open', () => {
      connectedOnce = true
      onState({ state: 'connected' })
    })
    socket.on('message', (data) => {
      try {
        subscriber.next(JSON.parse(messageText(data)) as T)
      } catch (error) {
        subscriber.error(error)
      }
    })
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
        onState({ state: 'reconnecting', message })
        const delay = Math.min(
          1_000 * (2 ** Math.min(retryCount - 1, 4)),
          maximumBackoffMs,
        )
        return timer(delay)
      },
    }),
  )
}
