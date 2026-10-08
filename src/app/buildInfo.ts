/** 本次构建的版本指纹（设置面板底部、出错页的诊断信息都用它） */
export const BUILD: { commit: string; builtAt: string; world: string } = typeof __BUILD_INFO__ === 'object' ? __BUILD_INFO__ : { commit: 'dev', builtAt: '', world: '' }

/** 「版本 abc1234 · 2026-10-08 12:00」 */
export const buildLabel = (): string => `版本 ${BUILD.commit}${BUILD.builtAt ? ` · ${BUILD.builtAt}` : ''}`
