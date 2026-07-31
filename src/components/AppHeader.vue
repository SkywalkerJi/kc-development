<template>
  <header class="app-header">
    <div class="app-header-inner">
      <div class="brand">
        <!--
          与 public/favicon.svg 同一套形状，这里内联而不是 <img src>：内联的
          SVG 不额外发一次请求、也不会在弱网下先空一块再补上（页头是首屏最
          先看到的东西）。两处形状要一起改。
          aria-hidden：紧挨着的 h1 已经把站名念出来了，图标再被读一遍是噪音。
        -->
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="app-header-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#3f8bc8" />
              <stop offset="1" stop-color="#0e2a42" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill="url(#app-header-mark)" />
          <g
            fill="none" stroke="#eaf3fa" stroke-width="4.5"
            stroke-linecap="round" stroke-linejoin="round"
          >
            <circle cx="32" cy="14.5" r="4.75" />
            <path d="M32 19.5v33" />
            <path d="M20 25.5h24" />
            <path d="M13 35c0 11.5 8.5 17.5 19 17.5S51 46.5 51 35" />
          </g>
        </svg>
        <div class="brand-text">
          <!--
            全站唯一的 h1，用站名（title.app）而不是 title.development。
            DevelopmentView 里的 h2 仍然是「装备开发」——那是页内功能区的
            小标题，与站名是两件事，两者都叫「装备开发」时标签页标题里就没
            有任何信息说明这是舰队 Collection 的工具（见 zh-Hans.ts 里
            title.app 的注释）。
          -->
          <h1>{{ $t('title.app') }}</h1>
          <p class="tagline">{{ $t('title.tagline') }}</p>
        </div>
      </div>

      <div class="header-actions">
        <LocaleSwitcher />
        <nav class="header-links">
          <!--
            两个图标链接都没有可见文字，所以 aria-label 是**必需**的而不是
            锦上添花：没有它读屏软件只会念出 URL。title 让鼠标用户悬停时也
            能看到同一句话，两者取同一个 key，不会各说各的。

            rel="noopener"：target="_blank" 打开的页面能通过 window.opener
            反向操作本页，加上它切断这条引用（现代浏览器对 _blank 默认已经
            隐含 noopener，显式写出来是为了不依赖浏览器版本）。
            noreferrer 顺带不泄露来源页地址。
          -->
          <a
            class="icon-link"
            :href="REPO_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('link.github')"
            :title="$t('link.github')"
          >
            <!-- GitHub 官方 Octicon 的 mark-github 路径（16×16 网格） -->
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <a
            class="icon-link"
            :href="X_URL"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="$t('link.x')"
            :title="$t('link.x')"
          >
            <!-- X 的品牌标（24×24 网格） -->
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
            </svg>
          </a>
        </nav>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import LocaleSwitcher from './LocaleSwitcher.vue'
// 本地 import 而不是依赖 main.ts 挂到 globalProperties 的那份——同
// LocaleSwitcher.vue / FlagshipSearch.vue / DataInitializer.vue 的做法，
// 这样组件被 createApp(X).mount() 单独挂载时模板里的 $t 也解析得到。
import { t as $t } from '@/i18n'
// 站外地址集中在 @/links，页脚也从那里取同一份仓库地址，见该文件的注释
import { REPO_URL, X_URL } from '@/links'
</script>

<style scoped>
.app-header {
  background-color: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  box-shadow: var(--shadow-sm);
}

/*
 * max-width 与 DevelopmentView 的 .development-view 取同一个 1200px：页头
 * 内容的左右边缘要与下方主内容对齐，两个值必须一致（改一个就要改另一个）。
 * padding 比主内容大一点，让页头显得松一些。
 */
.app-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0; /* 允许下面的文字在窄屏收缩，否则 flex 项默认不小于内容宽度 */
}

.brand-mark {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 9px;
  box-shadow: var(--shadow-sm);
}

.brand-text {
  min-width: 0;
}

/*
 * h1 的字号刻意压到 1.15rem：这是个工具页，真正的主角是下面的表格与输入框，
 * 页头再大就会把首屏挤掉一截。语义上的"唯一 h1"与视觉上的"很大"是两件事。
 */
.brand-text h1 {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tagline {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--c-text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-links {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--c-text-muted);
  transition: color 0.15s ease, background-color 0.15s ease;
}

.icon-link svg {
  width: 19px;
  height: 19px;
}

.icon-link:hover {
  color: var(--c-text);
  background-color: var(--c-surface-2);
}

/*
 * 窄屏下副标题让位：页头在手机上应该只剩"图标 + 站名 + 三个控件"，
 * 一句完整的副标题会把它撑成两行、挤掉本就紧张的首屏高度。
 * 这句话在页面上不是唯一出处——<meta name="description"> 与分享卡片里都有，
 * 藏掉它不丢信息。
 */
@media (max-width: 560px) {
  .tagline {
    display: none;
  }

  .app-header-inner {
    padding: 10px 14px;
  }
}
</style>
