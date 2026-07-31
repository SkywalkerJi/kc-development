<template>
  <footer class="app-footer">
    <div class="app-footer-inner">
      <p>
        <!--
          整行都是链接文字，没有拆成「前缀 + 专名 + 后缀」：那样每种语言的
          标点与语序都要单独拼一遍，收益只是让可点区域短一点。
          译名数据以 MIT 分发，这条署名是许可要求的，不是可选的装饰
          （见仓库根的 THIRD_PARTY_NOTICES）。
        -->
        <a :href="KC3_TRANSLATIONS_URL" target="_blank" rel="noopener noreferrer">
          {{ $t('footer.credit') }}
        </a>
      </p>
      <p>
        <a :href="LICENSE_URL" target="_blank" rel="noopener noreferrer">
          {{ $t('footer.license') }}
        </a>
      </p>
      <p class="disclaimer">{{ $t('footer.disclaimer') }}</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { t as $t } from '@/i18n'
import { KC3_TRANSLATIONS_URL, LICENSE_URL } from '@/links'
</script>

<style scoped>
.app-footer {
  /* margin-top: auto 由 body 的 flex 列布局配合（见 assets/base.css）——
     内容不足一屏时页脚被推到视口底部，而不是浮在内容正下方留一片空白。
     这里不需要写 margin-top，main 的 flex: 1 已经把剩余空间吃掉了。 */
  border-top: 1px solid var(--c-border);
  background-color: var(--c-surface);
  color: var(--c-text-muted);
  font-size: 0.8rem;
}

/* max-width 与页头 .app-header-inner、主内容 .development-view 同为
   1200px，三者左右边缘对齐；改一个要一起改 */
.app-footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 20px 22px;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 20px;
}

.app-footer p {
  margin: 0;
}

/* 免责声明单独占一行、颜色更淡：它不是链接，也不需要与前两条署名争注意力 */
.disclaimer {
  flex-basis: 100%;
  color: var(--c-text-faint);
}
</style>
