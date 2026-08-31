// ============================================================
// example_top.sv —— SoC 装配示例骨架
// 演示 Agent 如何用 template.sv 把 apb_timer 装进子系统：
// 本例 = 简单 APB 总线 + 两个定时器（32 位主定时器 + 8 位看门狗）
// 真实项目中 APB 主机/译码器来自其他 CBB Skill，此处以注释占位。
// ============================================================

module soc_timer_subsystem (
  input             PCLK,
  input             PRESETn,
  // APB 总线（来自总线矩阵 / APB 主机）
  input             apb_psel,
  input             apb_penable,
  input             apb_pwrite,
  input      [15:0] apb_paddr,
  input      [31:0] apb_pwdata,
  output reg [31:0] apb_prdata,
  output            apb_pready,
  // 中断输出
  output            timer0_irq,
  output            wdt_irq
);

  // ---- 地址译码（2 个从机，各 16 字节） ----
  wire psel_timer0 = apb_psel && (apb_paddr[15:4] == 12'h000);
  wire psel_wdt    = apb_psel && (apb_paddr[15:4] == 12'h001);

  wire [31:0] prdata_timer0;
  wire [31:0] prdata_wdt;
  wire        pready_timer0;
  wire        pready_wdt;

  // ---- 例化 CBB：32 位主定时器（来自 Skill: apb_timer v1.2.0） ----
  apb_timer #(
    .WIDTH (32)
  ) u_timer0 (
    .PCLK      (PCLK),
    .PRESETn   (PRESETn),
    .PSEL      (psel_timer0),
    .PENABLE   (apb_penable),
    .PWRITE    (apb_pwrite),
    .PADDR     (apb_paddr[3:0]),
    .PWDATA    (apb_pwdata),
    .PRDATA    (prdata_timer0),
    .PREADY    (pready_timer0),
    .timer_irq (timer0_irq)
  );

  // ---- 例化 CBB：8 位看门狗（参数化例化示例） ----
  apb_timer #(
    .WIDTH (8)
  ) u_wdt (
    .PCLK      (PCLK),
    .PRESETn   (PRESETn),
    .PSEL      (psel_wdt),
    .PENABLE   (apb_penable),
    .PWRITE    (apb_pwrite),
    .PADDR     (apb_paddr[3:0]),
    .PWDATA    (apb_pwdata),
    .PRDATA    (prdata_wdt),
    .PREADY    (pready_wdt),
    .timer_irq (wdt_irq)
  );

  // ---- 读数据回选 + PREADY 合并 ----
  always @(*) begin
    apb_prdata = 32'h0;
    if (psel_timer0) apb_prdata = prdata_timer0;
    else if (psel_wdt) apb_prdata = prdata_wdt;
  end
  assign apb_pready = pready_timer0 & pready_wdt; // 本模块恒 1

endmodule
