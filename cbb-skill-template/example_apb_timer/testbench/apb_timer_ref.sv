// ============================================================
// apb_timer_ref.sv —— 演示用参考实现（教学用途）
// !!! 真实部署：本文件替换为内部闭源 CBB 实现，代码不进 Skill 包 !!!
// 行为与 interface.json / docs.md 契约一致：
//   - 写 LOAD 且 enable=0 时预装载 COUNT
//   - enable=1 时每个 PCLK 递减；1→0 时重装 LOAD 并按 irq_en 产生单周期中断
// ============================================================
`timescale 1ns/1ps

module apb_timer #(parameter WIDTH = 32) (
  input             PCLK,
  input             PRESETn,
  input             PSEL,
  input             PENABLE,
  input             PWRITE,
  input  [3:0]      PADDR,
  input  [31:0]     PWDATA,
  output reg [31:0] PRDATA,
  output reg        PREADY,
  output reg        timer_irq
);

  reg [WIDTH-1:0] count;
  reg [WIDTH-1:0] load;
  reg             enable;
  reg             irq_en;

  assign PREADY = 1'b1;

  always @(posedge PCLK or negedge PRESETn) begin
    if (!PRESETn) begin
      enable    <= 1'b0;
      irq_en    <= 1'b0;
      load      <= {WIDTH{1'b0}};
      count     <= {WIDTH{1'b0}};
      timer_irq <= 1'b0;
    end else begin
      timer_irq <= 1'b0;

      // APB 写（ACCESS 周期）
      if (PSEL && PENABLE && PWRITE) begin
        case (PADDR[3:0])
          4'h0: begin
            enable <= PWDATA[0];
            irq_en <= PWDATA[1];
          end
          4'h4: begin
            load <= PWDATA[WIDTH-1:0];
            if (!enable) count <= PWDATA[WIDTH-1:0];  // 停止态写 LOAD 预装载
          end
        endcase
      end

      // 递减计数
      if (enable) begin
        if (count == {{(WIDTH-1){1'b0}}, 1'b1}) begin  // count == 1 → 到期
          count <= load;
          if (irq_en) timer_irq <= 1'b1;
        end else if (count != {WIDTH{1'b0}}) begin
          count <= count - 1'b1;
        end
      end
    end
  end

  // APB 读（组合）
  always @(*) begin
    PRDATA = 32'h0;
    if (PSEL && !PWRITE) begin
      case (PADDR[3:0])
        4'h0: PRDATA = {30'b0, irq_en, enable};
        4'h4: PRDATA = {{(32-WIDTH){1'b0}}, load};
        4'h8: PRDATA = {{(32-WIDTH){1'b0}}, count};
      endcase
    end
  end

endmodule
