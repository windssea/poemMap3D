/** 构建号（vite.config 里 define）：区块缓存按它作废 */
declare const __WORLD_BUILD__: string
/** 版本指纹（vite.config 里 define）：提交号、构建时间（北京时间）、世界构建号 */
declare const __BUILD_INFO__: { commit: string; builtAt: string; world: string }
