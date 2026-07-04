/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 中文 subject 不强制英文大小写规则
    'subject-case': [0],
  },
}
