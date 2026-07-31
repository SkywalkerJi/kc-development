<template>
  <div class="locale-switcher">
    <label for="locale">{{ $t('locale.label') }}</label>
    <select id="locale" :value="currentLocale" :disabled="localePending" @change="onChange">
      <option v-for="loc in LOCALES" :key="loc" :value="loc">{{ LOCALE_LABELS[loc] }}</option>
    </select>
    <!--
      失败提示与重试按钮是两个独立元素，不要把按钮塞进 .switch-failed 里：
      LocaleSwitcher.spec.ts 断言 .switch-failed 的 textContent 与消息表里
      的文案逐字相等，混进按钮文字会让那个断言的字符串比较失真。
    -->
    <template v-if="localeSwitchFailed">
      <span class="switch-failed">{{ $t('locale.switchFailed') }}</span>
      <button type="button" class="switch-retry" :disabled="localePending" @click="onRetry">
        {{ $t('locale.retry') }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { LOCALES, type Locale } from '@/i18n/types'
import {
  currentLocale, localePending, setLocale, t as $t,
  localeSwitchFailed, localeSwitchFailedAttempt,
} from '@/i18n'

// 各语言的自称，不随当前语言变化 —— 找自己母语的用户看不懂当前界面语言，
// 所以「日本語」永远写作「日本語」而不是「日文」
const LOCALE_LABELS: Record<Locale, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  en: 'English',
}

async function onChange(e: Event) {
  const next = (e.target as HTMLSelectElement).value as Locale
  const ok = await setLocale(next)
  // 失败时把 select 拨回当前语言：:value 绑的是 currentLocale，但切换失败时
  // 它没变，Vue 也就不会重渲染这个 DOM 属性，下拉框会停在用户刚选的那一项。
  if (!ok) (e.target as HTMLSelectElement).value = currentLocale.value
}

/**
 * 重试上一次失败的切换（不管那次是 initLocale 冷启动触发的还是本组件的
 * onChange 触发的——两者共享同一份 i18n 模块状态，见 index.ts）。
 *
 * 不能靠"用户在下拉框里重新选一次当前显示的选项"来触发重试：原生
 * <select> 在用户选中与当前显示值相同的选项时不会派发 change 事件（这是
 * 浏览器对"值没变"的原生抑制），而失败目标恰好等于当前显示值是完全可能
 * 发生的——典型例子是冷启动就沿用/探测到默认的 zh-Hans、且 zh-Hans 自己
 * 的名称表加载失败：select 显示的仍是 zh-Hans（onChange 从未被调用过，
 * 没有"拨回原语言"这一步），失败目标也是 zh-Hans，用户在下拉框里点不出
 * 任何变化，永远等不到 onChange 被调用。这个独立按钮不依赖 change 事件，
 * 直接调用 setLocale 就绕开了这个限制。
 *
 * target/persist 都从 localeSwitchFailedAttempt 里原样取，不用 currentLocale
 * 兜底、也不写死 persist——见 index.ts 里 failedAttempt 的注释。
 */
async function onRetry() {
  const attempt = localeSwitchFailedAttempt.value
  if (!attempt) return // 理论上不会发生：按钮只在 localeSwitchFailed 为真时可见
  await setLocale(attempt.target, attempt.persist)
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
.switch-retry { font-size: 0.9em; padding: 2px 8px; }
</style>
