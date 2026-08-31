# CBB Skill 模板 —— 把闭源已验证模块封装成 AI 可调用的 Skill

> 配套报告：《AI × RTL 调研 · 实战方案：CBB Skill × AgentTeam 组装 SoC》（index.html 第 09 章）

## 这套模板解决什么问题

你手里有大量**闭源、已验证、但内部逻辑未完全掌握**的 CBB（Common Building Blocks）代码。
直接喂给 LLM 有 IP 外泄风险；让 LLM 重新生成又不可信。
本模板把每个 CBB 封装成一个 **Skill 包**：LLM 只看到「接口契约 + 例化模板 + 验证夹具」，
通过「实例化 → 仿真验证」间接使用代码，**源码永不进入 AI 上下文**。

## 目录结构

```
cbb-skill-template/
├── README.md                  # 本文件
└── example_apb_timer/         # 完整示例：虚构的 APB 32 位定时器 CBB
    ├── skill.json             # ① 元数据：功能摘要/适用场景/依赖
    ├── interface.json         # ② 接口契约：端口/参数/寄存器/时序（最重要）
    ├── template.sv            # ③ 例化模板：Agent 填参数即得合法例化
    ├── docs.md                # ④ 行为说明/已知限制
    ├── testbench/
    │   └── tb_apb_timer.sv    # ⑤ 验证夹具（iverilog 可编译运行）
    └── examples/
        └── example_top.sv     # ⑥ 顶层装配示例
```

## 四步套用法（把任意 CBB 变成 Skill）

1. **复制模板**：`example_apb_timer/` 整个目录复制为 `cbb_<你的模块名>/`。
2. **填接口契约（interface.json）**：这是唯一必须由人准确填写的文件——
   端口方向/位宽/协议、参数、寄存器映射、时序要求。可以从模块头注释、例化处、
   寄存器手册中提取；若文档缺失，用黑盒激励扫描（见下）辅助推断。
3. **生成功能卡（skill.json + docs.md）**：让 LLM（本地私有模型）读源码生成
   「功能摘要草稿」，或对模块跑自动激励扫描归纳行为；**资深工程师审核签名后**才可上线。
4. **验证夹具（testbench/）**：写一个最小自检 bench，能跑通并给出 PASS/FAIL。
   Agent 每次装配完模块都会运行它——夹具通过 = 集成成功。

## Agent 调用一个 Skill 的典型流程（工具调用序列）

```
1. tool: skill_search(query="APB timer")          → 命中 apb_timer
2. tool: skill_read(skill="apb_timer", file="interface.json")   → 端口/寄存器表
3. tool: skill_read(skill="apb_timer", file="template.sv")      → 例化模板
4. 生成例化代码：apb_timer #(.WIDTH(32)) u_timer (...);
5. tool: run_lint(design=top.sv)                  → 反馈报错（如有）
6. tool: run_sim(harness="apb_timer/tb_apb_timer.sv", design=top.sv) → PASS/FAIL
7. FAIL → 读取报错 → 调整参数/互连 → 重跑（Repair 闭环）
```

## 黑盒行为分析（不理解代码时如何写功能卡）

```
1. 静态线索：端口命名（axi_awvalid）、参数名、寄存器地址映射
2. 动态扫描：自动生成随机/定向激励 → 观察输出/波形规律 → LLM 归纳行为
3. 双轨交叉：LLM 读码摘要（本地模型） vs 黑盒扫描结果，人工审核差异
4. 兜底：即使描述有偏差，验证夹具保证「误用会被仿真抓住」
```

## 红线清单

- [ ] `.sv` 源码永不写入 skill 包，不进入任何 prompt
- [ ] interface.json 由资深工程师审核签名（skill.json 中记录 reviewer）
- [ ] CBB 升级 → skill 卡版本号 +1 → 全库回归
- [ ] 验证夹具必须可在内部服务器运行（iverilog/verilator/商业工具）
- [ ] 本地私有模型推理，IP 不出域

## 配套文件

- 报告网页：`../index.html`（第 09 章 · Playbook）
- 论文参考（`../papers/`）：Agentic EDA 综述（2512.23189）、Design Conductor（2603.08716）、HWE-Bench（2604.14709）、DeepV（2510.05327）
