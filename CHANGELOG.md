# 更新日志

本项目版本遵循语义化版本号；每个版本同步发布到
[GitHub Releases](https://github.com/zxysdtc/kankan-learn/releases)（附带可直接加载的 zip 安装包）。

## [v0.3.0] - 2026-06-10

### 新增
- 🔢 **数学练习模式（加减法）**：侧边栏新增「数学练习」入口，**不依赖视频、不需登录、纯本地生成**。
  - 支持加 / 减 / 加减混合，可选 20 以内 / 100 以内，并可优先出进位、退位题。
  - 大号展示算式 `8 + 5 = ?` 并自动朗读，从 4 个数字里点选。
  - 得数与选项一律由本地计算，**保证答案绝对正确**；干扰项贴近答案（±1、±2、±10）。
  - 可选「AI 配应用题情境」（需填 API 密钥），但判分始终用本地得数，AI 不参与判分。
- 数学题复用语音播报、奖励动画、错题本与做题记录。
- 家长设置页新增「数学练习」一栏：数值范围、运算类型、进退位、AI 情境开关。

### 优化
- 修正侧边栏误引入 `pinyin-pro` 依赖链导致体积膨胀的问题，数学相关代码分块仅约 1.6KB。

下载：[kankan-learn-v0.3.0.zip](https://github.com/zxysdtc/kankan-learn/releases/download/v0.3.0/kankan-learn-v0.3.0.zip)

## [v0.2.0] - 2026-06-10

### 新增 / 优化
- 例句遮挡逻辑修复（听词选词题不再泄题）。
- 新增音频自动 / 手动播放开关。
- 题库扩量：按设置题数放大成题库，每轮随机抽取，避免重复。
- 新增做题记录与错题本（含错题复习模式）。

下载：[kankan-learn-v0.2.0.zip](https://github.com/zxysdtc/kankan-learn/releases/download/v0.2.0/kankan-learn-v0.2.0.zip)

## [v0.1.0] - 2026-06-08

### 新增
- 首个版本：B站儿童拼音生字学习浏览器扩展。
- 看完带字幕的 B站视频后，根据字幕出拼音 / 生字小游戏，支持语音播报与奖励反馈。

下载：[kankan-learn-v0.1.0.zip](https://github.com/zxysdtc/kankan-learn/releases/download/v0.1.0/kankan-learn-v0.1.0.zip)

[v0.3.0]: https://github.com/zxysdtc/kankan-learn/releases/tag/v0.3.0
[v0.2.0]: https://github.com/zxysdtc/kankan-learn/releases/tag/v0.2.0
[v0.1.0]: https://github.com/zxysdtc/kankan-learn/releases/tag/v0.1.0
