/**
 * dataSchema.js 的手写类型声明。
 *
 * 这个文件存在的唯一原因：dataSchema.js 必须是纯 JS（见该文件顶部注释——
 * scripts/sync-data.mjs 用 node 直接执行，没有构建步骤），但 src/stores/*.ts
 * 和各 *.spec.ts 仍然需要类型信息。TS 的 Bundler 模块解析在同目录同名的
 * .js/.d.ts 之间会优先用 .d.ts 提供类型，运行时仍然执行 .js 的实现，两边
 * 天然保持同一套逻辑，不需要额外的构建步骤或类型对齐工作。
 */

export interface ValidationResult {
  ok: boolean
  /** ok 为 true 时必为空数组；ok 为 false 时至少有一条。 */
  errors: string[]
}

export declare function validateStart2Payload(json: unknown): ValidationResult

export declare function validateCtypeMap(json: unknown): ValidationResult

export declare function validateDevelopmentPools(
  pools: unknown,
  validEquipIds?: Set<number> | null,
): ValidationResult
