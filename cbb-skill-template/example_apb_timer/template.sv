// ============================================================
// 例化模板 apb_timer（Agent 填参数与端口连接即可生成合法例化）
// 注意：本模板是「用法示例」，不是模块实现。
// 实现代码位于内部 CBB 库，绝不进入本 Skill 包。
// ============================================================

// 最小例化（全部默认参数）
apb_timer u_apb_timer_0 (
    .PCLK      (PCLK),
    .PRESETn   (PRESETn),
    .PSEL      (psel_timer),
    .PENABLE   (penable),
    .PWRITE    (pwrite),
    .PADDR     (paddr_timer[3:0]),
    .PWDATA    (pwdata),
    .PRDATA    (prdata_timer),
    .PREADY    (pready_timer),
    .timer_irq (timer_irq)
);

// 参数化例化（8 位计数器，用于轻量看门狗场景）
apb_timer #(
    .WIDTH (8)
) u_watchdog (
    .PCLK      (PCLK),
    .PRESETn   (PRESETn),
    .PSEL      (psel_wd),
    .PENABLE   (penable),
    .PWRITE    (pwrite),
    .PADDR     (paddr_wd[3:0]),
    .PWDATA    (pwdata),
    .PRDATA    (prdata_wd),
    .PREADY    (pready_wd),
    .timer_irq (wd_irq)
);

// 使用建议：
// 1) 总线矩阵上 APB 从机的 PREADY 可以并联（本模块恒为 1）
// 2) timer_irq 建议接到中断控制器（如 PLIC）的对应通道
// 3) 若多个定时器共用一条 APB，PADDR 需由地址译码器区分解码
