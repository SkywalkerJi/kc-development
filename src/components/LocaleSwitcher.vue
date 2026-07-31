<template>
  <div class="locale-switcher">
    <label for="locale">{{ $t('locale.label') }}</label>
    <select id="locale" :value="currentLocale" :disabled="localePending" @change="onChange">
      <option v-for="loc in LOCALES" :key="loc" :value="loc">{{ LOCALE_LABELS[loc] }}</option>
    </select>
    <span v-if="failed" class="switch-failed">{{ $t('locale.switchFailed') }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { LOCALES, type Locale } from '@/i18n/types'
import { currentLocale, localePending, setLocale, t as $t } from '@/i18n'

// 各语言的自称，不随当前语言变化 —— 找自己母语的用户看不懂当前界面语言，
// 所以「日本語」永远写作「日本語」而不是「日文」
const LOCALE_LABELS: Record<Locale, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  en: 'English',
}

const failed = ref(false)

async function onChange(e: Event) {
  const next = (e.target as HTMLSelectElement).value as Locale
  failed.value = !(await setLocale(next))
  // 失败时把 select 拨回当前语言：:value 绑的是 currentLocale，但切换失败时
  // 它没变，Vue 也就不会重渲染这个 DOM 属性，下拉框会停在用户刚选的那一项。
  if (failed.value) (e.target as HTMLSelectElement).value = currentLocale.value
}
</script>

<style scoped>
.locale-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.locale-switcher select { padding: 4px; }
.switch-failed { color: #c00; font-size: 0.9em; }
</style>
