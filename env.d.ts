/// <reference types="vite/client" />

import type { MsgKey } from '@/i18n/types'

// 让模板里的 $t 有类型：不声明的话 vue-tsc 会报 "Property '$t' does not exist"
declare module 'vue' {
  interface ComponentCustomProperties {
    $t: (key: MsgKey) => string
  }
}

export {}
