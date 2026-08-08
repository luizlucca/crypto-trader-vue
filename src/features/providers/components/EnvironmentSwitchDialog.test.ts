// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ProviderAccountSummary } from '@shared/contracts/security'
import EnvironmentSwitchDialog from './EnvironmentSwitchDialog.vue'

const target: ProviderAccountSummary = {
  accountId: 'test-one',
  provider: 'binance',
  environment: 'test',
  label: 'Minha testnet',
  markets: ['spot'],
  apiKeySuffix: '••••1234',
  connection: 'disconnected',
}

/**
 * The dialog teleports to `body`, so its markup is not inside the wrapper.
 * Text and elements are read from the document; emitted events still come
 * from the component instance.
 */
function open(props: Partial<{
  target: ProviderAccountSummary
  openTabs: number
  pending: boolean
}> = {}) {
  document.body.innerHTML = ''
  const wrapper = mount(EnvironmentSwitchDialog, {
    props: { target, openTabs: 3, pending: false, ...props },
  })
  return {
    wrapper,
    text: () => document.body.textContent ?? '',
    click: (selector: string) => {
      document.querySelector(selector)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      return wrapper.vm.$nextTick()
    },
    escape: () => {
      document.querySelector('.environment-switch-dialog')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      return wrapper.vm.$nextTick()
    },
  }
}

describe('environment switch confirmation', () => {
  it('says where it is going and what it will destroy', () => {
    const text = open().text()

    expect(text).toContain('Trocar para Testes?')
    expect(text).toContain('Minha testnet')
    expect(text).toContain('As 3 abas abertas serão fechadas')
  })

  it('warns that testnet data is not the market', () => {
    expect(open().text()).toContain('não reflete o mercado')
  })

  it('does not threaten the drawings, which survive the reset', () => {
    expect(open().text()).toContain('desenhos ficam guardados por')
  })

  it('agrees with itself when a single tab is open', () => {
    expect(open({ openTabs: 1 }).text())
      .toContain('A aba aberta será fechada')
  })

  /*
   * "Cancelar não deixa rastro" is guaranteed structurally — the switch runs
   * only from `@confirm`. These pin the half of that guarantee that lives in
   * this component: every exit that is not the primary button emits `cancel`
   * and never `confirm`.
   */
  it.each([
    ['botão Cancelar', 'footer button:not(.primary)'],
    ['clique fora do diálogo', '.environment-switch-scrim'],
  ])('emits only cancel from the %s', async (_label, selector) => {
    const dialog = open()

    await dialog.click(selector)

    expect(dialog.wrapper.emitted('cancel')).toHaveLength(1)
    expect(dialog.wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits cancel on Escape', async () => {
    const dialog = open()

    await dialog.escape()

    expect(dialog.wrapper.emitted('cancel')).toHaveLength(1)
    expect(dialog.wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm only from the primary button', async () => {
    const dialog = open()

    await dialog.click('footer button.primary')

    expect(dialog.wrapper.emitted('confirm')).toHaveLength(1)
    expect(dialog.wrapper.emitted('cancel')).toBeUndefined()
  })

  /* A second click while the switch is running must not start another one. */
  it('accepts no further input while the switch is running', async () => {
    const dialog = open({ pending: true })

    await dialog.click('footer button.primary')
    await dialog.click('footer button:not(.primary)')

    expect(dialog.wrapper.emitted('confirm')).toBeUndefined()
    expect(dialog.wrapper.emitted('cancel')).toBeUndefined()
    expect(dialog.text()).toContain('Trocando…')
  })
})
