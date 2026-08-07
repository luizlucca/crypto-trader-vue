import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  session,
  type IpcMainInvokeEvent,
} from 'electron'
import {
  DESKTOP_CHANNELS,
  isMarketPair,
  isMarketDataRequest,
  isSymbolSearchContext,
  type MarketDataEvent,
  type SymbolSelectionResult,
  type SymbolSearchContext,
} from '@shared/contracts/desktop'
import { MarketDataCoordinator } from './market-data/coordinator'
import { AccountProviderRegistry } from './providers/accountProvider'
import {
  BinanceAccountProvider,
} from './providers/binance/binanceAccountProvider'
import { registerSecurityIPC } from './security/registerSecurityIPC'
import { bindSecurityLifecycle } from './security/securityLifecycle'
import { SecurityPreferencesStore } from './security/securityPreferences'
import { ProviderConnectionCoordinator } from './security/providerConnectionCoordinator'
import { SecuritySession } from './security/securitySession'
import { VaultCrypto } from './security/vaultCrypto'
import { VaultRepository } from './security/vaultRepository'

let mainWindow: BrowserWindow | null = null
let searchWindow: BrowserWindow | null = null
let searchContext: SymbolSearchContext | null = null
let streamData: MarketDataCoordinator | undefined
let catalogData: MarketDataCoordinator | undefined
let securitySession: SecuritySession | undefined
let disposeSecurityIPC: (() => void) | undefined
let disposeSecurityLifecycle: (() => void) | undefined
let isQuitting = false

function rendererURL(view?: 'search'): string {
  const developmentURL = process.env.ELECTRON_RENDERER_URL
  if (!developmentURL) {
    return ''
  }
  const url = new URL(developmentURL)
  if (view) {
    url.searchParams.set('view', view)
  }
  return url.toString()
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.cjs')
}

function configureWebContents(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'CryptoPro',
    width: 1600,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    fullscreen: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#04131b',
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  configureWebContents(window)
  window.once('ready-to-show', () => {
    window.setFullScreen(false)
    window.show()
  })
  // Session ids belong to a renderer instance. A reload, a crash or a closed
  // window abandons every one of them, and the utility process would otherwise
  // keep those WebSockets open and streaming to nobody until the app quits.
  window.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      streamData?.stopAllStreams()
    }
  })
  window.webContents.on('render-process-gone', () => {
    streamData?.stopAllStreams()
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
      disposeSecurityLifecycle?.()
      disposeSecurityLifecycle = undefined
    }
    streamData?.stopAllStreams()
  })

  const developmentURL = rendererURL()
  if (developmentURL) {
    void window.loadURL(developmentURL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function bindMainSecurityLifecycle(window: BrowserWindow): void {
  disposeSecurityLifecycle?.()
  if (!securitySession) {
    return
  }
  disposeSecurityLifecycle = bindSecurityLifecycle({
    window,
    powerMonitor,
    session: securitySession,
    isQuitting: () => isQuitting,
    platform: process.platform,
  })
}

function openMainWindow(): BrowserWindow {
  const window = createMainWindow()
  mainWindow = window
  bindMainSecurityLifecycle(window)
  return window
}

function createSearchWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'CryptoPro · Selecionar mercado',
    parent: mainWindow ?? undefined,
    modal: false,
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#061c27',
    webPreferences: {
      preload: preloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  configureWebContents(window)
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    searchWindow = null
  })

  const developmentURL = rendererURL('search')
  if (developmentURL) {
    void window.loadURL(developmentURL)
  } else {
    void window.loadFile(
      join(__dirname, '../renderer/index.html'),
      { query: { view: 'search' } },
    )
  }
  return window
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const id = event.sender.id
  return id === mainWindow?.webContents.id
    || id === searchWindow?.webContents.id
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('Mensagem IPC rejeitada: origem não reconhecida')
  }
}

function broadcastMarketEvent(event: MarketDataEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(DESKTOP_CHANNELS.marketEvent, event)
  }
}

function registerIPC(): void {
  ipcMain.handle(
    DESKTOP_CHANNELS.marketRequest,
    async (event, request: unknown) => {
      assertTrustedSender(event)
      if (!isMarketDataRequest(request)) {
        throw new Error('Comando de market data inválido')
      }
      if (
        event.sender.id === searchWindow?.webContents.id
        && request.kind !== 'catalog'
        && request.kind !== 'symbols'
      ) {
        throw new Error('A janela de pesquisa não pode controlar streams')
      }
      const coordinator = request.kind === 'catalog'
        || request.kind === 'symbols'
        ? catalogData
        : streamData
      if (!coordinator) {
        throw new Error('Coordenador de market data indisponível')
      }
      return coordinator.request(request)
    },
  )

  ipcMain.handle(
    DESKTOP_CHANNELS.openSymbolSearch,
    (event, context: unknown) => {
      assertTrustedSender(event)
      if (event.sender.id !== mainWindow?.webContents.id) {
        throw new Error('A busca só pode ser aberta pela janela principal')
      }
      if (!isSymbolSearchContext(context)) {
        throw new Error('Contexto da busca de símbolos inválido')
      }
      searchContext = context
      if (!searchWindow || searchWindow.isDestroyed()) {
        searchWindow = createSearchWindow()
      } else {
        searchWindow.webContents.send(
          DESKTOP_CHANNELS.searchContext,
          searchContext,
        )
        searchWindow.show()
        searchWindow.focus()
      }
    },
  )

  ipcMain.handle(DESKTOP_CHANNELS.closeSymbolSearch, (event) => {
    assertTrustedSender(event)
    searchWindow?.close()
  })

  ipcMain.handle(DESKTOP_CHANNELS.getSearchContext, (event) => {
    assertTrustedSender(event)
    return searchContext
  })

  ipcMain.handle(
    DESKTOP_CHANNELS.symbolSelected,
    (event, item: unknown) => {
      assertTrustedSender(event)
      if (event.sender.id !== searchWindow?.webContents.id) {
        throw new Error('Seleção de símbolo originada fora da busca')
      }
      if (!isMarketPair(item)) {
        throw new Error('Símbolo selecionado inválido')
      }
      if (!searchContext) {
        throw new Error('A busca não possui uma aba de destino')
      }
      const result: SymbolSelectionResult = {
        tabId: searchContext.tabId,
        intent: searchContext.intent,
        item,
      }
      mainWindow?.webContents.send(DESKTOP_CHANNELS.symbolSelected, result)
      searchWindow?.close()
    },
  )

  ipcMain.on(DESKTOP_CHANNELS.favoritesChanged, (event, keys: string[]) => {
    const senderId = event.sender.id
    if (
      senderId !== mainWindow?.webContents.id
      && senderId !== searchWindow?.webContents.id
    ) {
      return
    }
    if (
      !Array.isArray(keys)
      || keys.length > 5_000
      || keys.some((key) => typeof key !== 'string' || key.length > 120)
    ) {
      return
    }
    for (const window of [mainWindow, searchWindow]) {
      if (
        window
        && !window.isDestroyed()
        && window.webContents.id !== senderId
      ) {
        window.webContents.send(DESKTOP_CHANNELS.favoritesChanged, keys)
      }
    }
  })
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    )
    streamData = new MarketDataCoordinator(
      broadcastMarketEvent,
      'CryptoPro Realtime Streams',
    )
    catalogData = new MarketDataCoordinator(
      () => {},
      'CryptoPro Symbol Catalog',
    )
    const userDataPath = app.getPath('userData')
    const providers = new AccountProviderRegistry([new BinanceAccountProvider()])
    securitySession = new SecuritySession({
      repository: new VaultRepository(join(userDataPath, 'credentials.v1.enc')),
      crypto: new VaultCrypto(),
      preferences: new SecurityPreferencesStore(
        join(userDataPath, 'security-preferences.v1.json'),
      ),
      connections: new ProviderConnectionCoordinator(providers),
      getSystemIdleTime: () => powerMonitor.getSystemIdleTime(),
    })
    await securitySession.initialize()
    disposeSecurityIPC = registerSecurityIPC({
      ipc: ipcMain,
      getMainWebContentsId: () => mainWindow?.webContents.id,
      session: securitySession,
      send: (snapshot) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(DESKTOP_CHANNELS.securityEvent, snapshot)
        }
      },
    })
    streamData.start()
    catalogData.start()
    registerIPC()
    openMainWindow()

    app.on('activate', () => {
      if (!mainWindow) {
        openMainWindow()
      }
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    securitySession?.shutdown()
    streamData?.shutdown()
    catalogData?.shutdown()
  })

  app.on('will-quit', () => {
    disposeSecurityLifecycle?.()
    disposeSecurityLifecycle = undefined
    disposeSecurityIPC?.()
    disposeSecurityIPC = undefined
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
