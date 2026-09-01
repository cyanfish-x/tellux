# Clock 统一场景时钟

## 状态

已采用，2026-09-01。

## 背景

旧 `Clock` 实际只通过构造函数回调更新太阳方向，但又作为公共类和 `viewer.clock` 暴露。它缺少 Viewer 初始化配置与公共事件，同时存在 `animate`、`hourUTC`、属性 setter 和 `setXxx()` 等重叠入口。Timeline 还持有 `currentTime`、播放状态和倍率的另一套初始配置，使同一状态有两个所有者。

## 决策

- `viewer.clock` 是统一的场景模拟时间源；大气是当前内置消费者，而不是 Clock 的内部职责。
- `ViewerOptions.clock` 负责初始化。`currentTime` 在配置边界接受 `Date | string | number`，运行时属性只接受有效 `Date`。
- Clock 复制所有输入和输出 `Date`，避免调用方原地修改绕过事件。
- `shouldAnimate` 表达是否推进时间；`multiplier` 支持有限负数以允许倒放。
- `change` 暴露有效状态变化及原因；`tick` 暴露每次推进调用、真实时间增量与模拟时间增量。
- Timeline 只显示和控制 Clock，不再拥有当前时间、播放状态或倍率的初始化配置。
- Viewer 在启用 Timeline 且 `clock.shouldAnimate` 未配置时，将其解析为 `true`；结合 Clock 的默认当前系统时间和 `1×` 倍率，表现为默认跟随真实时间流动。显式值始终优先。该默认值由组合根决定，Timeline 挂载过程不改写 Clock 初始状态。

## 时间与时区边界

- `Clock.currentTime` 使用 JavaScript `Date` 表达绝对时间点，不附带展示时区。
- Timeline 是面向用户的民用时间控件，日期、时刻、年内日和默认日范围统一使用浏览器本地时区；界面只显示当前日期对应的 UTC 偏移量（如 `+8`），不暴露 IANA 区域名。
- 默认日范围按相邻两个本地午夜计算，不假设一天固定为 24 小时；跨夏令时边界时允许 23 或 25 小时。
- 显式传入 `startTime` / `endTime` 时仍按对应绝对时间点定义自定义范围。

## 移除的旧入口

- `new Clock(onChange)`
- `clock.animate`
- `clock.hourUTC` / `setHourUTC()`
- `setCurrentTime()`
- `TimelineOptions.currentTime/animate/multiplier`

本次是明确接受的破坏式重构，不保留兼容别名。示例应通过 `ViewerOptions.clock` 初始化，或在运行时给 `viewer.clock.currentTime` 赋值新的 `Date`。

## 暂不纳入

Clock 暂不提供 `startTime`、`stopTime`、范围循环、数据缓冲门控或多种步进模式；Tellux 也暂不自动驱动轨迹、实体和图层时间动画。真实时序数据源接入后，再根据其边界扩展这些能力。
