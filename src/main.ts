import { createApp } from 'vue'
import { createPinia } from 'pinia'

import './assets/base.css'
import App from './App.vue'
import router from './router'
import { initLocale, t } from './i18n'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 模板里直接用 $t('key')，不必每个 SFC 都 import 一次。
// 这一行提供的是与 vue-i18n 相同的人体工学，而不需要那 14–19 KB。
app.config.globalProperties.$t = t

app.mount('#app')

// 挂载之后再定语言：initLocale 里的 setLocale 要发请求，不该阻塞首屏。
// 首屏用默认的 zh-Hans 渲染，探测结果回来后响应式地换掉。
initLocale()
