# apb_timer — 行为说明（docs.md）

> 本文件由「黑盒行为分析 + LLM 摘要草稿 + 工程师审核」生成，v1.2.0。

## 功能概述

32 位 APB 从机定时器。软件通过 APB 总线配置初值并启动计数；
计数器每个 PCLK 上升沿递减，到期（1→0）时自动重装初值，并按
CONTROL.irq_en 决定是否拉高 `timer_irq` 一个周期。

## 典型使用序列（软件视角）

1. 写 `LOAD` (0x4) = 期望计数值
2. 写 `CONTROL` (0x0) = 0x3（enable=1, irq_en=1）
3. 等待 `timer_irq` 上升沿（N 个 PCLK 后，N = LOAD 值）
4. 中断服务程序里重新写 LOAD 并保持 enable=1 即可继续周期性触发

## 行为细节

| 事件 | 行为 |
|---|---|
| 复位 (PRESETn=0) | CONTROL=0, LOAD=0, COUNT=0, timer_irq=0 |
| 写 CONTROL[0]=1 | 从当前 COUNT 开始递减 |
| 写 CONTROL[0]=0 | 暂停，COUNT 保持 |
| COUNT 1→0 | COUNT 重装为 LOAD；若 CONTROL[1]=1，timer_irq 拉高 1 周期 |
| APB 读 0x8 | 返回实时 COUNT 值 |

## 已知限制（黑盒验证确认）

- 无 PWM/输出波形能力（仅中断输出）
- 计数到 0 前写 LOAD 不会立即生效，需等待重装时刻（或先停再启动）
- PADDR 只译码低 4 位；未映射地址读回 0
- 不支持字节/半字写（PSTRB 未实现；写入按 32 位整字处理）

## 变更记录

| 版本 | 变更 | 审核 |
|---|---|---|
| 1.2.0 | 增加 8 位 WIDTH 参数支持；修复 irq 在复位期间可能误触发的问题 | （签名） |
| 1.1.0 | 初始封装 | （签名） |
