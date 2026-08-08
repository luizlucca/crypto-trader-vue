// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TestEnvironmentBadge from './TestEnvironmentBadge.vue'

describe('test environment badge', () => {
  /*
   * Silence is the normal state. A permanent banner in production would be
   * ignored by habit, and the habit would carry into the one case that
   * matters.
   */
  it('renders nothing at all in production', () => {
    const wrapper = mount(TestEnvironmentBadge, {
      props: { environment: 'live' },
    })

    expect(wrapper.text()).toBe('')
    expect(wrapper.find('.test-environment-badge').exists()).toBe(false)
  })

  it('marks the chart and warns about synthetic data in test', () => {
    const wrapper = mount(TestEnvironmentBadge, {
      props: { environment: 'test' },
    })

    expect(wrapper.text()).toContain('Ambiente de testes')
    expect(wrapper.text()).toContain('sintéticos')
  })

  it('lets the operator dismiss the warning but keeps the marker', async () => {
    const wrapper = mount(TestEnvironmentBadge, {
      props: { environment: 'test' },
    })

    await wrapper
      .find('.test-environment-badge__notice button')
      .trigger('click')

    expect(wrapper.find('.test-environment-badge__notice').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ambiente de testes')
  })

  /*
   * Dismissal lasts for this visit, not forever. Leaving the venue and coming
   * back is a new decision to trade against synthetic prices.
   */
  it('brings the warning back on the next entry into test', async () => {
    const wrapper = mount(TestEnvironmentBadge, {
      props: { environment: 'test' },
    })
    await wrapper
      .find('.test-environment-badge__notice button')
      .trigger('click')
    expect(wrapper.find('.test-environment-badge__notice').exists()).toBe(false)

    await wrapper.setProps({ environment: 'live' })
    await wrapper.setProps({ environment: 'test' })

    expect(wrapper.find('.test-environment-badge__notice').exists()).toBe(true)
  })
})
