import { createApp } from 'vue'
import App from './app/App.vue'
import { initializeTheme } from '@settings/services/theme'
import '@app/styles/index.css'

initializeTheme()
createApp(App).mount('#app')
