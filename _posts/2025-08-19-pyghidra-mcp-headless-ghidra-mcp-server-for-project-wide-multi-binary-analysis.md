---
layout: post
title: 'pyghidra-mcp: Headless Ghidra MCP Server for Project-Wide, Multi-Binary Analysis'
date: 2025-08-19 15:56 +0000
description: Unlock project-wide, multi-binary analysis with pyghidra-mcp, a headless Ghidra MCP server for automated, LLM-assisted reverse engineering.
image:
  path: "/assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*g7a9a07bIfmd_1mqzM_AIA.jpeg"
  src: "/assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*g7a9a07bIfmd_1mqzM_AIA.jpeg"
  alt: Leveraging the power of inter-connected analysis!
  lquip: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAYACgMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AP4QNHXQYfCl5dXNpnX75de0vS5/7Pjv7RI7GxstQvry8+36kYYL02t8dO0yax0zzLJnOpLKt9awO4B59QB//9k=
  mermaid: true
category:
- ghidra
- MCP
tags:
- LLMs
- AI
- vibe-reversing
mermaid: true
---

> **TL;DR** This post introduces pyghidra-mcp, a new headless Model Context Protocol (MCP) server for Ghidra designed for automation. It exposes an entire Ghidra project for analysis, enabling an LLM to trace function calls across multiple interdependent binaries in a single session. This moves beyond single-file analysis to ecosystem-aware reverse engineering. You can check out the beta release at [github.com/clearbluejar/pyghidra-mcp](https://github.com/clearbluejar/pyghidra-mcp)

Picture this: you’re reverse engineering a complex application, tracing a function call from the main executable into a shared library, which then jumps to another system component. Suddenly, you’re juggling three different analysis sessions, trying to piece together a single execution flow.

>  **This is the way.** 

Real-world software is inherently interconnected:

- **Firmware** spans multiple components and bootloaders
- **Malware** often consists of droppers, payloads, and injected libraries
- **Enterprise applications** rely on dozens of interdependent DLLs
- **System-level analysis** requires tracing calls from userland through kernel boundaries

The first wave of AI reverse engineering tools were impressive. You could throw a complex function at an LLM and get back clean, commented code that actually made sense. But, most were implemented to operate on a single binary. The moment you need to follow a call chain across multiple files? You’re back to manual detective work, trying to remember what you found three binaries ago.

**What if an AI could analyze your entire software ecosystem at once, tracing function calls across any number of binaries in a single session?**

This is one of the primary issues we set out to solve with **pyghidra-mcp**: a new, headless Model Context Protocol (MCP) server for Ghidra. It’s built from the ground up for automation (think command-line and agentic workflows) with a singular, powerful feature at its core: the ability to expose an **entire Ghidra project** for analysis in a single, LLM-assisted reversing session.

---

### Ghidra, MCP, and the Leap to Project-Wide Analysis

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*O_X4Q16n1SPcTc_WAsL5jw.png)

Let’s quickly define the key players. **Ghidra** is the powerful, open-source SRE framework from the NSA. The **Model Context Protocol (MCP)** is a standardized interface (think of it as a universal translator) that allows development tools, analysis engines, and Large Language Models (LLMs) to communicate.

#### Enter pyghidra-mcp: Project-Wide AI Analysis

GhidraMCP opened up our eyes to the power of using LLMs with our favorite (yes this is a biased opinion) SRE toolkit. Inspired by LaurieWired’s groundbreaking GhidraMCP, `pyghidra-mcp` takes the concept toward automation and increases the scope. While GhidraMCP demonstrated the power of connecting LLMs to Ghidra’s analysis capabilities, it maintained a one-to-one mapping: one MCP server per binary, one code browser per file. (See my [previous post](https://medium.com/@clearbluejar/supercharging-ghidra-using-local-llms-with-ghidramcp-via-ollama-and-openweb-ui-794cef02ecf7) with details on how to run Ghidra MCP with openweb-ui and ollama, your own private RE stack.) 

But! Ghidra already has a fantastic way to organize collections of files, the **project manager**. A simple and intuitive feature envied by several other SRE frameworks. 

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*sS6O6xnypLJTx3jf_ffTMQ.png)_Ghidra Project Manager — Multi-Binary View_

  
The goal became clear: build a tool that leverages Ghidra's project-level view and exposes it through MCP. `pyghidra-mcp` leverages this existing concept and exposes the entire Ghidra project through a single MCP interface.

#### Key Design Principles

  
🏗️ **Project-First Architecture**  
Instead of analyzing individual files, pyghidra-mcp treats the Ghidra project as the primary unit of analysis. Load a project containing dozens of related binaries, and your AI assistant can seamlessly query and cross-reference between any of them.

🤖 **Headless by Design**  
Powered by pyghidra and jpype, the server runs entirely from the command line. No GUI required, making it perfect for automated pipelines, Docker containers, and server environments.

🔗 **Cross-Binary Intelligence**  
The real magic happens when your LLM can trace a function call from an application executable into its dependencies, understanding the full execution flow without manual intervention.

⚡ **Automation-Ready**  
Built with robust testing and designed for programmatic control, pyghidra-mcp integrates seamlessly into CI/CD pipelines for security testing and vulnerability research.

### Tracing an API Call from Application to Kernel

Let’s walk through a concrete example that showcases `pyghidra-mcp`’s capabilities. We’ll trace what happens when `notepad.exe` creates a file. This seemingly simple operation actually traverses multiple layers of the Windows API demonstrating the power of multi binary analysis. 

**The Scenario**: An analyst wants to understand what happens “under the hood” when `notepad.exe` creates a file. This involves tracing the call from `notepad.exe` → `kernel32.dll` → `ntdll.dll`.

**The Ghidra Project**: A project containing `notepad.exe`, `kernel32.dll`, and `ntdll.dll`.

#### Step 1: Launch the Multi-Binary Server

First, the analyst starts the `pyghidra-mcp` server from the terminal, pointing it to the binaries that make up the project.

```shell
$ pyghidra-mcp /path/to/notepad.exe /path/to/kernel32.dll /path/to/ntdll.dll
```

The server initializes, loads all three binaries into a unified Ghidra project, and exposes the complete analysis surface through MCP.

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*BIKzsKWRUY26Q4mJKM1KBw.gif){: .shadow }_uvx pygihdra-mcp /path/to/notepad.exe /path/to/kernel32.dll /path/to/ntdll.dll_

The `pyghidra-mcp` server will be available with all of it’s listed tools.

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*kZuwN9G1aPeJhx8wuck-2g.png){: .shadow }_Current list of MCP tools at beta release_

#### Step 2: AI-Powered Cross-Binary Analysis

With an LLM connected to the `pyghidra-mcp` server, the analyst can now ask high-level questions that span multiple binaries:

- The analyst starts with a high-level goal: **“Find where** `notepad.exe` **creates files."** First the LLM must discover the project binaries.

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*6aFi4EpUKGG1fR9L9wpRZg.png){: .shadow }_LLM discovers it must first list the project binaries, in order to call the tools correctly. See the correction on “list_imports” call._

- The LLM translates this single prompt into multiple tool calls and eventually a command to find cross-references to the `CreateFileW` function within `notepad.exe`. 

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*pFWfEIBxXFrbchZl-gfOmg.png){: .shadow }_LLM finds the crossreferences to CreateFile._

- The tool confirms `CreateFileW` is being used in `notepad.exe` and also knows about its import. The analyst pivots: **"Now, decompile the `CreateFileW` function inside `kernel32.dll`."** The LLM issues the command, and the result reveals this function is mostly a wrapper and actually lives in `kernelbase.dll` !

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*5viQ5MoEtWq9Sr7tBZJOZQ.png){: .shadow }

- **Aside:** Pivoting to `KernelBase.dll` is a non-trivial step. While this is likely familiar to an experienced Windows reverse engineer, it’s worth calling out: although `Kernel32.dll` still contains some code, it primarily serves as a forwarder for functions now implemented in `KernelBase.dll`. The model was able to make this pivot because it had access to (and could correlate across) multiple files.

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*3XctsQiC1Iv1ZvjeVZmjaQ.png){: .shadow }_LLM pivots from kernel32 to kernelbase to find the CreateFileW implementation_

- Inside the decompiled code of `kernelbase!CreateFileW`, the analyst spots a call to a lower-level function, `NtCreateFile`, which resides in `ntdll.dll`.

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*WtSY4r_IrBICoi2HIfGejQ.png){: .shadow }

- The final step: **“Okay, decompile the** `NtCreateFile` **function and explain"** 

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*AzV5Eq2rH29kq2_b23N_gw.png){: .shadow }

- This reveals the code that prepares the actual system call (syscall) into the Windows kernel.

### The Complete Picture

In a single analysis session, we’ve traced a file creation operation through four distinct layers:

1. **Application Layer**: `notepad.exe` calls the Windows API
2. **API Wrapper**: `kernel32.dll` forwards to the actual implementation
3. **Implementation**: `kernelbase.dll` handles the logic and calls the NT API
4. **System Interface**: `ntdll.dll` prepares the kernel system call

This end-to-end understanding would typically require multiple analysis sessions, manual correlation, and significant domain expertise to piece 

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*M-H2JUWBVdFE0BSLVGjHPA.png){: .shadow }_The complete picture of a Windows API Call_

### One-Shot Analysis

For advanced users, `pyghidra-mcp` enables even more powerful workflows. With the **right prompt engineering and a capable model**, you can ask the LLM to perform the entire analysis in a single query:

> _“I want to understand what happens under the hood when a Windows application calls a high-level file API. How does notepad.exe actually ask the kernel to create a file? can you figure this out using the binaries in my project? Please show details of code from the binaries and how they are related.”_

The result is a comprehensive analysis report that spans multiple binaries, complete with decompiled functions and architectural insights — all generated automatically.

Here are some screen shots from a successful one-shot session:

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/0_us-nLpkDe5SlQ_Tm.jpg){: .shadow }_kicking off the 1-shot_

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/0_vhqAWZriex5mOjCE.jpg){: .shadow }_getting to the answer…_

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/0_X9mvrCJPMUy0Nsna.jpg){: .shadow }_22 tool calls later we have a final picture of the transfer from user to kernel mode_

Here is the full 1-shot chat response: [https://gist.github.com/clearbluejar/09294e170b5de4bef7bf8f4d65c82751](https://gist.github.com/clearbluejar/09294e170b5de4bef7bf8f4d65c82751) 

<!-- {% include embed/youtube.html id='oWCiRQ1qhV4' %} -->

Here is a concise summary of the 1-shot multi-binary reversing session:

![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/1*69ZN9jCdB3i9m-RvfKp_mw.png){: .shadow }_22 tool calls to answer_

> **Effective AI-Powered Reverse Engineering:** The session is a compelling example of an LLM successfully performing a complex reverse engineering task. It navigated errors, corrected its own assumptions, and synthesized information from multiple sources (different binaries and function calls) to build a complete and accurate picture of a core operating system process. — gemini

---

### The Future is Automated and Project-Wide

`pyghidra-mcp` proves a step more than just a technical improvement; it’s a paradigm shift toward **ecosystem-aware analysis**. Instead of treating binaries as isolated artifacts, we can now approach reverse engineering the way software actually works: as interconnected systems with complex interdependencies.

This approach opens new possibilities:

- **Vulnerability Research**: Trace attack surfaces across entire application stacks
- **Malware Analysis**: Understand multi-stage payloads and their interactions
- **Firmware Security**: Analyze bootloader chains and embedded system components
- **CI/CD Integration**: Automate security assessments of complex software builds

#### Getting Started

```shell
$ uvx pyghidra-mcp -t streamable-http /path/to/your/bin1 /path/to/your/bin2
```

`pyghidra-mcp` is currently in beta and available on GitHub. The project includes comprehensive documentation, examples, and test suites to help you get started with multi-binary analysis.

**Key Features at a Glance**:

- 📦 **Project-Wide Analysis**: Load entire Ghidra projects with multiple related binaries
- 🐍 **Headless Operation**: CLI-driven server perfect for automation
- 🤖 **Agent-Ready Protocol**: Designed for programmatic control and LLM integration
- ✅ **CI/CD Friendly**: Robust testing and reliable operation for automated pipelines

👉 **Try it now**: [github.com/clearbluejar/pyghidra-mcp](https://github.com/clearbluejar/pyghidra-mcp) (give it a ⭐️!)

  

[![](assets/img/2025-08-19-pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/0_Oyox-dU-yKygnLmz.png){: .shadow }_pyghidra-mcp_](https://github.com/clearbluejar/pyghidra-mcp)



---

