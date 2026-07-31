/// <reference types="vite/client" />

import type { CryptoProDesktopAPI } from '@shared/contracts/desktop'

declare global {
  interface Window {
    cryptoPro?: CryptoProDesktopAPI
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  // The empty-object generics are the shape Vue's own SFC shim requires.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>
  export default component
}
