# -*- coding: utf-8 -*-
"""批量下载 AI x RTL 调研报告的论文 PDF 到本地 papers/ 目录。
用法: python download_all.py
"""
import os, sys, time, urllib.request

OUT = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}

# (本地文件名, 下载 URL, 备注)
PAPERS = [
    ("ChipNeMo_2311.00176.pdf", "https://arxiv.org/pdf/2311.00176", "NVIDIA ChipNeMo：Domain-Adapted LLMs for Chip Design"),
    ("RTLCoder_2312.08645.pdf", "https://arxiv.org/pdf/2312.08645", "RTLCoder：Outperforming GPT-3.5 in Design RTL Generation"),
    ("MG-Verilog_2407.01910.pdf", "https://arxiv.org/pdf/2407.01910", "MG-Verilog：多粒度 RTL 数据集（LAD'24 最佳论文）"),
    ("HiVeGen_2412.05393.pdf", "https://arxiv.org/pdf/2412.05393", "HiVeGen：层次化 LLM Verilog 生成"),
    ("ScaleRTL_2506.05566.pdf", "https://arxiv.org/pdf/2506.05566", "ScaleRTL：推理数据 + 测试时计算"),
    ("ProtocolLLM_2506.07945.pdf", "https://arxiv.org/pdf/2506.07945", "ProtocolLLM：通信协议 SystemVerilog 生成基准"),
    ("ChiseLLM_2504.19144.pdf", "https://arxiv.org/pdf/2504.19144", "ChiseLLM：推理 LLM 用于 Chisel 敏捷开发"),
    ("ReChisel_2505.19734.pdf", "https://arxiv.org/pdf/2505.19734", "ReChisel：LLM with Reflection 生成 Chisel（DAC 2025）"),
    ("VeriMind_2503.16514.pdf", "https://arxiv.org/pdf/2503.16514", "VeriMind：Agentic LLM 自动生成 Verilog"),
    ("AutoVeriFix_2509.08416.pdf", "https://arxiv.org/pdf/2509.08416", "AutoVeriFix：自动修复 LLM 生成 Verilog"),
    ("LLM-VeriPPA_2510.15899.pdf", "https://arxiv.org/pdf/2510.15899", "LLM-VeriPPA：PPA 感知 Verilog 生成"),
    ("DeepV_2510.05327.pdf", "https://arxiv.org/pdf/2510.05327", "DeepV：RAG + 知识库增强 Verilog 生成"),
    ("Backtrack-ToT_2511.13139.pdf", "https://arxiv.org/pdf/2511.13139", "Backtrack-ToT：自解耦自验证 RTL 设计"),
    ("AgenticEDA_2512.23189.pdf", "https://arxiv.org/pdf/2512.23189", "The Dawn of Agentic EDA 综述"),
    ("IBM_Invertible_2512.03053.pdf", "https://arxiv.org/pdf/2512.03053", "IBM：缓解 LLM 可逆问题幻觉与遗漏"),
    ("ChipBench_2601.21448.pdf", "https://arxiv.org/pdf/2601.21448", "ChipBench：AI 辅助芯片设计下一代基准"),
    ("VeriGraphi_2604.14550.pdf", "https://arxiv.org/pdf/2604.14550", "VeriGraphi：层次化 RTL 多智能体生成"),
    ("ChipCraftBrain_2604.19856.pdf", "https://arxiv.org/pdf/2604.19856", "ChipCraftBrain：验证优先多智能体 RTL 生成"),
    ("ChipMATE_2605.12857.pdf", "https://arxiv.org/pdf/2605.12857", "ChipMATE：RL 多智能体 RTL 生成"),
    ("PyHDL-Eval_MLCAD2024.pdf", "https://www.csl.cornell.edu/~cbatten/pdfs/batten-pyhdl-eval-mlcad2024.pdf", "PyHDL-Eval：LLM 生成 Python HDL 评测（Cornell）"),
    ("DVCon2025_VerificationLLM.pdf", "https://dvcon-proceedings.org/wp-content/uploads/1016-Towards-Automated-Verification-IP-Instantiation-via-LLMs.pdf", "DVCon 2025：LLM 自动化验证 IP 实例化"),
]

def fetch(url, dest, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            if data[:4] == b"%PDF" and len(data) > 10000:
                with open(dest, "wb") as f:
                    f.write(data)
                return True, len(data)
            return False, "not a PDF (%d bytes)" % len(data)
        except Exception as e:
            if i == retries - 1:
                return False, str(e)
            time.sleep(3)
    return False, "unknown"

ok, fail = 0, []
for name, url, note in PAPERS:
    dest = os.path.join(OUT, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        print("[skip] %s (exists)" % name); ok += 1; continue
    success, info = fetch(url, dest)
    if success:
        print("[ OK ] %s  (%d KB)  %s" % (name, info // 1024, note)); ok += 1
    else:
        print("[FAIL] %s  %s  %s" % (name, info, url)); fail.append(name)
print("\nDone: %d ok, %d failed" % (ok, len(fail)))
if fail:
    print("Failed:", ", ".join(fail))
sys.exit(0 if not fail else 1)
