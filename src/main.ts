import { createApp } from 'vue'
import App from './App.vue'
import { initializeTheme } from './services/theme'
import './style.css'

initializeTheme()
createApp(App).mount('#app')
