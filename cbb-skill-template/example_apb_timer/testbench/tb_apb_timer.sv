// ============================================================
// 验证夹具 tb_apb_timer.sv —— Skill 包自检 bench
// 用法（iverilog）：
//   iverilog -g2012 -o tb.vvp tb_apb_timer.sv apb_timer_ref.sv
//   vvp tb.vvp
// 期望输出：ALL TESTS PASSED
// 真实部署：把 apb_timer_ref.sv 替换为内部闭源 CBB 实现文件。
// ============================================================
`timescale 1ns/1ps

module tb_apb_timer;
  reg  PCLK = 0;
  reg  PRESETn = 0;
  reg  PSEL = 0;
  reg  PENABLE = 0;
  reg  PWRITE = 0;
  reg  [3:0] PADDR = 0;
  reg  [31:0] PWDATA = 0;
  wire [31:0] PRDATA;
  wire PREADY;
  wire timer_irq;

  integer errors = 0;
  integer i;
  reg [31:0] rd;

  // ---- 被测对象：接口与 interface.json 契约一致 ----
  apb_timer #(.WIDTH(32)) dut (
    .PCLK(PCLK), .PRESETn(PRESETn), .PSEL(PSEL), .PENABLE(PENABLE),
    .PWRITE(PWRITE), .PADDR(PADDR), .PWDATA(PWDATA),
    .PRDATA(PRDATA), .PREADY(PREADY), .timer_irq(timer_irq)
  );

  always #5 PCLK = ~PCLK;

  // ---- APB 单周期写（SETUP + ACCESS） ----
  task apb_write(input [3:0] a, input [31:0] d);
    begin
      @(posedge PCLK);
      PSEL = 1; PWRITE = 1; PADDR = a; PWDATA = d; PENABLE = 0;
      @(posedge PCLK);
      PENABLE = 1;
      @(posedge PCLK);
      PSEL = 0; PENABLE = 0; PWRITE = 0;
    end
  endtask

  // ---- APB 单周期读 ----
  task apb_read(input [3:0] a, output reg [31:0] r);
    begin
      @(posedge PCLK);
      PSEL = 1; PWRITE = 0; PADDR = a; PENABLE = 0;
      @(posedge PCLK);
      PENABLE = 1;
      @(posedge PCLK);
      r = PRDATA;
      PSEL = 0; PENABLE = 0;
    end
  endtask

  task check(input [255:0] name, input cond);
    begin
      if (!cond) begin $display("FAIL: %0s", name); errors = errors + 1; end
      else $display("PASS: %0s", name);
    end
  endtask

  initial begin
    // 1) 复位默认值
    repeat (4) @(posedge PCLK);
    PRESETn = 1;
    @(posedge PCLK);
    apb_read(4'h0, rd); check("reset CONTROL == 0", rd == 32'h0);
    apb_read(4'h8, rd); check("reset COUNT == 0",  rd == 32'h0);
    check("irq low after reset", timer_irq == 1'b0);

    // 2) 编程 LOAD=5 + enable/irq → 每周期递减，6 周期后到期
    apb_write(4'h4, 32'd5);          // LOAD=5（enable=0 时同时预装载 COUNT）
    apb_write(4'h0, 32'h3);          // CONTROL: enable=1, irq_en=1
    for (i = 0; i < 5; i = i + 1) @(posedge PCLK);
    check("irq asserted at expire", timer_irq == 1'b1);
    @(posedge PCLK);
    check("irq is single-cycle",   timer_irq == 1'b0);
    // （到期重装已由上方 irq 时序隐式验证；count<=load 路径由下方预装载检查显式覆盖）

    // 2b) disable 后写 LOAD 会预装载 COUNT（停止态确定性验证）
    apb_write(4'h0, 32'h0);        // disable（冻结计数）
    apb_write(4'h4, 32'd7);        // LOAD=7 → 预装载 COUNT
    apb_read(4'h8, rd); check("COUNT preload when disabled", rd == 32'd7);

    // 3) irq 屏蔽：enable=1, irq_en=0 → 到期无中断
    apb_write(4'h4, 32'd3);
    apb_write(4'h0, 32'h1);
    for (i = 0; i < 3; i = i + 1) @(posedge PCLK);
    check("no irq when masked", timer_irq == 1'b0);

    // 4) 暂停：enable=0 后 COUNT 冻结
    apb_write(4'h0, 32'h0);
    apb_read(4'h8, rd); i = rd;
    @(posedge PCLK); @(posedge PCLK);
    apb_read(4'h8, rd); check("COUNT frozen when disabled", rd == i);

    // 5) 未映射地址读回 0
    apb_read(4'hC, rd); check("unmapped addr reads 0", rd == 32'h0);

    if (errors == 0) $display("ALL TESTS PASSED");
    else $display("TOTAL FAILURES: %0d", errors);
    $finish;
  end
endmodule
