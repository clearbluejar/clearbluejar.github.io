---
layout: post
title: 'pyghidra-mcp Meets Ghidra GUI: Drive Project-Wide RE with Local AI'
date: 2026-05-05 08:00 +0100
description: "pyghidra-mcp v0.2.0 ships a GUI-backed mode that lets a local LLM drive a live Ghidra CodeBrowser at full project scope. Renames, plate comments, and cross-binary pivots land in real time, with every edit tagged in Ghidra's undo history while the session is alive."
image:
  path: "/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/hero-dragon.jpg"
  src: "/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/hero-dragon.jpg"
  alt: Stone-carved dragon, close up
  lqip: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAcACgMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APAf2T/ij4U12RfGOm/sxfDj4N/DzW9D8PaR/aXw816wNl4v8TP4X0p/tuhfDW18FaFZ+B7STSnubbVozq0FvLq9uk2n2KWNxcvdgHsWofEX4efb777Hd3KWn2y5+ypFDqixpbec/kLGs1iZVRYtoRZSZAoAclsmgD//2Q==
category:
- ghidra
- MCP
tags:
- LLMs
- AI
- local-llm
- reverse-engineering
- vibe-reversing
- pyghidra-mcp
- CVE-2024-3273
---

> **TL;DR** [pyghidra-mcp](https://github.com/clearbluejar/pyghidra-mcp) v0.2.0 introduces a `--gui` mode. The same headless pyghidra-mcp server that ships an entire Ghidra project to an LLM can now drive a live Ghidra CodeBrowser window. In this post, I drive an LLM session with OpenWebUI (local Gemma4) against D-Link DNS-320L firmware, watching the agent rename functions, write plate comments, and pivot across two binaries to fully annotate the [CVE-2024-3273](https://nvd.nist.gov/vuln/detail/CVE-2024-3273) RCE chain end to end. Every edit lands live in the listing and shows up in Ghidra's undo history while the session is alive.

![Hero: pyghidra-mcp driving Ghidra's CodeBrowser live](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-01-hero.png){: .shadow }
_OpenWebUI on the left, real Ghidra CodeBrowser on the right. Same project, same program, live edits._

When the [first pyghidra-mcp post](/posts/pyghidra-mcp-headless-ghidra-mcp-server-for-project-wide-multi-binary-analysis/) shipped back in August, the pitch was project-wide, multi-binary analysis from a headless server. That part is still the core of the tool. What was missing was a way for the human reverse engineer to *see* what the agent was doing without paging through a wall of tool-call JSON.

This post is about filling that gap, and about what multi-binary reverse engineering looks like when the agent and the human share one window.

## The Problem with Headless-Only

Headless works great for CI, Docker, and one-shot "analyze this whole firmware dump" scripts. It is the wrong fit when I am actively reversing something and I want to read the listing, follow an xref, set a bookmark, or sanity-check that the agent renamed the thing I thought it did. Before GUI mode, the project file was a black box until I closed the server and reopened it manually. By then the session context was gone, including any chance to catch the agent in the act when it sounded confident and was wrong.

The fix is straightforward in retrospect. I had filed GUI mode away as impossible because Ghidra's project lock means two separate JVMs cannot open the same `.gpr` at the same time. Walking through the Ghidra source turned that into the obvious answer: do not run them as separate processes. Run `pyghidra-mcp` and `ghidra.GhidraRun` inside the same JVM, share one project, share one set of `Program` objects, and every MCP write lands in the GUI.

## What I Wanted from a Ghidra MCP

I wanted GUI mode because I had already seen what it felt like from the other side. [LaurieWired](https://x.com/lauriewired)'s [GhidraMCP](https://github.com/LaurieWired/GhidraMCP) was the first project I saw that put an LLM inside Ghidra's CodeBrowser as a plugin, and watching the listing update under tool calls stuck with me. `pyghidra-mcp` came at the same problem from the other end, headless-first for project-wide visibility across many binaries, scriptable batch analysis, and Docker-friendly CI.

## What Shipped in v0.2.0

`pyghidra-mcp --gui` starts the server and launches Ghidra's CodeBrowser against the same project the MCP tools are operating on. They share the open `Program` objects, so any write performed through an MCP tool lands in the GUI instantly.

```bash
$ uvx pyghidra-mcp --gui --transport http --port 8337 \
    --project-path /path/to/dns320l_research.gpr
```

![Server startup with GUI flag](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-02-server-startup.png){: .shadow }
_`pyghidra-mcp --gui` starting up: the server logs `GUI-backed server initialized` and the CodeBrowser launches against the project._

On the tool side, GUI mode adds a handful of new MCP tools that only make sense once you have a window to drive:

- [`open_program_in_gui`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L232) opens a binary in CodeBrowser
- [`set_current_program`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L247) switches the active program when more than one is loaded
- [`goto`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L254) scrolls the listing to a function name or hex address
- [`rename_function`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L266), [`set_comment`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L344), [`rename_variable`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L285), [`set_function_prototype`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L325), [`set_variable_type`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L305) perform writes that land live in the GUI
- [`import_binary`](https://github.com/clearbluejar/pyghidra-mcp/blob/c25f192388f1d8b2ba6f190688944f3bbf8ce7e9/src/pyghidra_mcp/mcp_tools.py#L487) adds a binary to the project from a file path

GUI mode requires `--transport http`. Ghidra captures `stdout` and `stderr` for its own logging the moment the CodeBrowser comes up, so the MCP server has to speak over a socket rather than fighting Ghidra for stdio. Stdio is still the default for headless workflows.

## The Setup: Local Agent, Local GUI

Three processes, three ports:

```bash
# pyghidra-mcp with GUI
$ uvx pyghidra-mcp --gui --transport http --port 8337 \
    --project-path /path/to/dns320l_research.gpr

# MCPO fronts the streamable-http MCP as OpenAPI
$ uvx mcpo --port 8200 --server-type streamable-http -- http://localhost:8337/mcp

# OpenWebUI (already running) at http://localhost:9099/, configured with the
# OpenAPI tools panel pointed at http://localhost:8200
```

Model: `google/gemma-4-31b-it`, running locally. No API keys, no cloud calls, the agent and the GUI both sit on my laptop.

![OpenWebUI Tools panel showing pyghidra-mcp registered through MCPO](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-02b-openwebui-tools.png){: .shadow }
_OpenWebUI's Tools panel sees `pyghidra-mcp` as an OpenAPI tool server at `http://localhost:8200`._

## The Target: CVE-2024-3273 in the DNS-320L Firmware

![D-Link product page for the DNS-320L showing End of Life status](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-03a-dns320l-eol.png){: .shadow }
_D-Link's own product page for the DNS-320L, marked End of Life._

D-Link's [DNS-320L](https://www.dlink.com/en/consumer) is end of life. The vendor [classified the affected NAS line as EOL/EOS](https://supportannouncement.us.dlink.com/security/publication.aspx?name=sap10383) and declined to patch [CVE-2024-3273](https://nvd.nist.gov/vuln/detail/CVE-2024-3273), recommending users "retire and replace" instead. [Censys clocked 92,000+ exposed devices](https://censys.com/advisory/cve-2024-3273) at the time of disclosure. Two years on the count has dropped sharply (Shodan and ZoomEye now show hundreds, not tens of thousands), but the bug never got patched, so any unit still online is still vulnerable. The legacy firmware archive still serves the vulnerable image, so anyone can download the same binaries this post analyzes. The device is a NAS, which means it ships dozens of CGI binaries, a web stack, and a pile of shared libraries. Perfect for project-wide analysis.

The bug itself is well documented by netsecfish's [advisory](https://github.com/netsecfish/dlink): unauthenticated RCE in `nas_sharing.cgi` via a Base64-encoded shell payload in the `system` parameter when `cmd=15`. The chain lives in one function. The auth is bypassed because the `messagebus` account is created at boot with an empty password and the blocklist does not include it. `system()` is called directly on attacker-controlled bytes after a "sanitizer" that turns out not to sanitize (we will get there).

I knew the bug was in `nas_sharing.cgi:FUN_0000f43c` going in. The follow-up post in this series walks through how an unprimed local model finds it from scratch. Here, the goal is not the discovery, it is the workflow: drive the entire chase from chat, watch the GUI keep up, and see how a human in the loop catches the agent when it slips.

The project starts with six binaries pre-imported: `account_mgr.cgi`, `libsafe_system.so`, `system_mgr.cgi`, `login_mgr.cgi`, `lighttpd`, `nas_sharing.cgi`. (Spoiler: those are not the right six. We will fix it.)

![Project window with the original six DNS-320L binaries](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-03-project-window.png){: .shadow }
_Project window after startup with six binaries staged, none of them the library `nas_sharing.cgi` actually links against for "sanitization."_

## The Prompts

Each section below captures my exact prompts and the response from Gemma4 31b.

### 1. Orient

> List the binaries in this Ghidra project.

A warm-up. Gemma calls `list_project_binaries` and returns the six. This proves that pyghidra-mcp is setup properly and ready to work.

![Prompt 1: list_project_binaries returns the six DNS-320L binaries](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-04-prompt1-list.png){: .shadow }
_OpenWebUI showing the tool call and Gemma's summary._

### 2. Open and Explore the Suspect Function

> Open `nas_sharing.cgi` in the Ghidra GUI, navigate to `FUN_0000f43c`, and explore it. Try to understand what the function does.

Gemma chains `open_program_in_gui` → `goto` → three `decompile_function` calls → three `read_bytes` calls.

![OpenWebUI logging Gemma's tool chain for prompt 2](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-05-prompt2-tools.png){: .shadow }
_OpenWebUI logs the chain: `open_program_in_gui`, `goto`, three `decompile_function` calls, three `read_bytes`._

She walks the function in chat, naming the inputs, the auth flow, and the command-execution mechanism:

![Gemma's structured analysis breakdown](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-05b-prompt2-analysis.png){: .shadow }
_Input retrieval, authentication, and command execution, broken out one at a time._

Then the verdict:

![Prompt 2: Gemma's RCE summary](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-05-prompt2-explore.png){: .shadow }
_Gemma's verdict at the end of prompt 2._

> *"This function implements a Remote Code Execution (RCE) feature. It requires a valid username/password (or a bypassed check), expects a Base64 encoded command in the `system` POST/GET parameter, and executes that command with the privileges of the web server."*

A CodeBrowser is now open on `nas_sharing.cgi`, scrolled to `FUN_0000f43c`.

![Ghidra CodeBrowser landed on nas_sharing.cgi at FUN_0000f43c](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-05a-prompt2-codebrowser.png){: .shadow }
_CodeBrowser landed on `nas_sharing.cgi:FUN_0000f43c`, before any renames._

Worth calling out that the actual analysis happens in MCP tool calls (decompile, read_bytes), not in the GUI. The CodeBrowser is just where the result lands.

### 3. Rename to Reflect Behavior

> Based on what you found, rename `FUN_0000f43c` to a name that reflects its behavior, confirm the rename worked.

She picks `auth_system_exec_rce` and re-decompiles to confirm. The rename lands in the Symbol Tree, the Listing header updates, and every other function that called `FUN_0000f43c` now calls `auth_system_exec_rce` everywhere. Headless edit, GUI feedback.

![Prompt 3: rename to auth_system_exec_rce](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-06-prompt3-rename.png){: .shadow }
_The rename propagates through the listing and the symbol tree the instant the tool call returns._

### 4. Pin the Reasoning to the Function

> Add a plate comment to the function that captures what you just told me. describe the inputs, the auth flow, and why this is RCE

Gemma writes a structured plate comment. It is good, with three numbered sections (Inputs, Auth Flow, RCE Mechanism), the specific data reference (`DAT_00023a5c`) and the helper functions (`FUN_00016868`, `FUN_00016858`) all named without being asked.

![Prompt 4: plate comment landed at the top of auth_system_exec_rce](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-07-prompt4-comment.png){: .shadow }
_The plate comment renders in the listing exactly like any human-authored comment, three sections plus a verdict._

### 5. Rename the Helper

> Decompile `FUN_00016858`, figure out what it does, and rename it.

Gemma chains `decompile_function` → `rename_function` and reports:

> *"The function `FUN_00016858` is a simple wrapper that calls `__b64_pton(param_2, param_1)`, which performs a Base64 decoding of the input string. I have renamed the function to `base64_decode_wrapper` to reflect this behavior."*

The call site now reads as a clean RCE chain in three lines.

![Prompt 5: the call chain now reads as prose](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-08-prompt5-chain.png){: .shadow }

### 6. Ask the Question That Matters

> Take me to the `system()` call inside `auth_system_exec_rce` and find out if it's vulnerable.

The wording matters. "Find out if it's vulnerable" pushes Gemma past restating the prompt-4 plate comment and into actually checking whether `fix_path_special_char` sanitizes anything useful at the sink.

She chains `goto` → two `decompile_function` calls → `search_symbols_by_name` → `list_imports`, and reports:

> *"External Sanitizer: I checked the symbols for `fix_path_special_char` and found that it is an imported function from an external library. Looking at the project binaries, `nas_sharing.cgi` imports `libsafe_system.so`."*
>
> *"Confirming the 'Safe' Wrapper: The use of a library named `libsafe_system.so` suggests that the developers attempted to implement a 'safe' version of `system()`.*

She crossed binaries on her own. She named the library. She synthesized the irony ("they wrote a safe-sounding library and then called the standard `system()` after the filter") without being prompted. This is the kind of multi-binary reasoning the headless side of pyghidra-mcp is built for.

**It is also wrong.**

The leap is a name match: `nas_sharing.cgi` imports `fix_path_special_char` and also imports a library called `libsafe_system.so`, and Gemma connects the two and later tries to verify, but things get worse.

![Prompt 6: Gemma's confident-sounding pivot to libsafe_system.so](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-09-prompt6-vuln.png){: .shadow }

### Aside: Missing Related Project Binaries, Fixed in the GUI

Gemma sounds extremely sure of herself. Pushed to verify, she even calls `list_exports` on `libsafe_system.so`, sees that `fix_path_special_char` is not in the exports list, and still keeps her answer by inventing an "alias or thunk" explanation:

![Gemma's confabulated explanation: alias or thunk to another function](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-09a-prompt7a-confabulation.png){: .shadow }
_Gemma invents an "alias or thunk" to land on `shell_filter`._

We can figure it out ourselves with `objdump`:

```shell
$ objdump -T research-binaries/libsafe_system.so | grep -E "fix_path|shell_filter"
00000d84 g    DF .text	000001f8              shell_filter

$ for f in rootfs/usrlib/*.so*; do
    objdump -T "$f" 2>/dev/null | grep "fix_path_special_char" \
      | sed "s|^|  -> $f: |"
  done
  -> rootfs/usrlib/libsmbif.so: 00009648 g    DF .text  fix_path_special_char
```

`libsafe_system.so` does not export `fix_path_special_char`. The actual resolver is `libsmbif.so`, but this binary is not loaded in the Ghidra project. Gemma's pivot was confident-sounding and wrong, and she could not have known otherwise: `search_symbols_by_name` only sees what is loaded, and `libsafe_system.so` was the only one of the project's six binaries with a name that read like sanitization. The agent reasoned against what was loaded. If the relevant libraries are missing, you can get confident but wrong answers.

The fix is the kind of thing the GUI makes trivial. Project window, *File → Batch Import…*, point at the directory the original binaries came from, click through. Ghidra picks up `libsmbif.so`, runs analysis, the project tree adds it next to the others.

![Project tree after batch-importing libsmbif.so](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-10-batch-import.png){: .shadow }

### 7. Try Again, with the Right Library Loaded

> List binaries again. Take a look at libsmbif.so. Decompile fix_path_special_char and tell me whether the sanitization is sufficient.

This time she does the work. Tool trace: `list_project_binaries` → `open_program_in_gui` → `search_symbols_by_name` → `decompile_function`. She lands on the real implementation in `libsmbif.so` and reports three findings, all of them real:

> - **Whitelist gaps.** Pipe (`|`), redirects (`>`, `<`), and newlines are not escaped. Any of them suffices for command injection through `system()`.
> - **Buffer overflow risk.** The function escapes into a fixed `local_1018[4096]` stack buffer with no bounds check on the destination index. A long input full of escapable characters overflows the buffer during the do-while loop.
> - **Dangerous final copy.** The last line is `strcpy(param_1, local_1018)`, which can overflow the original buffer if escaping grew the string past its capacity.

Her closing line:

> *"This function provides a false sense of security. Not only does it fail to block critical shell metacharacters like `|`, but it also introduces a memory corruption vulnerability (stack overflow) into the process. The RCE in `auth_system_exec_rce` remains wide open and is potentially even more exploitable due to these overflows."*

This is the analysis we hoped for. It wasn't a smooth road; the libsafe pivot took some back and forth, and RE with LLMs will always have some of that. Still a really strong showing for `gemma-4-31b-it` running locally. With only `libsafe_system.so` loaded, Gemma reached for the closest plausible match: `shell_filter` (a real escaping function that lives in that library, just not the one `nas_sharing.cgi` actually calls). With `libsmbif.so` in scope, she walked the decompilation, named the missing characters, and surfaced an unrelated stack overflow on top.

The escape character set she described is correct. The absence of `|`, `>`, `<`, `\n` checks is real, in both the prefix `strchr` chain and the inner do-while loop.

![Prompt 7: Gemma's real analysis of fix_path_special_char in libsmbif.so](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-11-prompt7b-real.png){: .shadow }
_Three issues, all verifiable, all introduced by a function whose name suggests safety._

### 8. Pin the Analysis and Close the Loop

> Add a plate comment to `fix_path_special_char` summarizing the three issues you found, then take me back to `auth_system_exec_rce`.

Two-step finish in a single prompt. Tool chain: `set_comment` → `open_program_in_gui` → `goto`.

![Prompt 8: plate comment landed at the top of fix_path_special_char in libsmbif.so](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-12-prompt8-comment.png){: .shadow }
_The libsmbif.so listing, plate comment in place, three numbered issues plus a verdict, written by the model and pinned by the model in the project file._

A local LLM drove all of that through chat. Two CodeBrowser windows, one per binary, both annotated in Ghidra.

## Why This Workflow Works

Three things change once the agent and the human share one Ghidra window:

**Multi-binary pivots are live, not narrated.** One second I am at the `system()` call in `nas_sharing.cgi`, the next I am in `libsmbif.so` looking at the broken sanitizer. The agent's edits land in both binaries while I watch.

**Every edit is attributable, in-session.** *Edit → Undo* shows every agent write tagged with `pyghidra-mcp:`, all undoable via Ctrl+Z.

![Edit menu showing every agent write tagged pyghidra-mcp](/assets/img/2026-05-04-pyghidra-mcp-meets-ghidra-gui-live-auditable-agent-edits/shot-13-edit-menu.png){: .shadow }
_Every agent write tagged with `pyghidra-mcp:` in the undo stack._

**Project shape is fixable mid-session.** Agents only see what is loaded. When Gemma reached for the wrong library, *File → Batch Import…* on the firmware directory fixed it without a session restart, and her next prompt had `libsmbif.so` in scope. Headless can do the same via `import_binary`; the GUI just makes the fix obvious and clickable.

## Reproduce It Yourself

The prompts above are verbatim. Copy them into your chat UI of choice and follow along. Minimum stack:

```bash
# Terminal 1: pyghidra-mcp server with GUI
$ uvx pyghidra-mcp --gui --transport http --port 8337 \
    --project-path /path/to/dns320l_research.gpr

# Terminal 2: MCPO fronts the streamable-http MCP as OpenAPI
$ uvx mcpo --port 8200 --server-type streamable-http -- http://localhost:8337/mcp

# Terminal 3: OpenWebUI (or your chat UI of choice). Point its OpenAPI tools
# panel at http://localhost:8200, pick a local model with tool-calling support.
```

The model in this run was `google/gemma-4-31b-it`. Any local tool-calling model works. The arc is identical: list, open, explore, rename, comment, helper-rename, ask the vulnerability question, fix project shape if needed, pin the verdict, close the loop.

The DNS-320L firmware itself is on D-Link's [legacy file archive](https://legacyfiles.us.dlink.com/). The cert chain fails strict verification, so `curl -k` or accepting the warning in a browser is needed.

Load the `DT_NEEDED` libraries up front. The agent reasons against what is loaded; if the relevant deps are not in the project, no amount of prompt engineering recovers the truth. (The follow-up post takes this further, pointing `import_binary` at the entire firmware rootfs in one tool call. Stay tuned.)

---

`pyghidra-mcp` v0.2.0 is at [github.com/clearbluejar/pyghidra-mcp](https://github.com/clearbluejar/pyghidra-mcp). Try it. If you hit something rough or have an idea, the [issues tracker](https://github.com/clearbluejar/pyghidra-mcp/issues) is where I'm paying attention.

Reach out on [X](https://x.com/clearbluejar) or [mastadon](https://infosec.exchange/@clearbluejar) if you have questions, and send `pyghidra-mcp` a ⭐️ on its [GitHub repo](https://github.com/clearbluejar/pyghidra-mcp) if you find it useful.

---

## Going Deeper with This Workflow

<div style="display: flex; gap: 0.75rem; align-items: stretch; margin: 1rem 0;">
  <a href="https://l.clearseclabs.com/defcon-agentic-re-vegas-2026" style="flex: 1; display: block;">
    <img src="/assets/img/training/building-agentic-re.jpg" alt="Agentic RE: Automating Reverse Engineering & Vulnerability Research with AI" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
  </a>
  <a href="https://l.clearseclabs.com/defcon-agentic-re-vegas-2026" style="flex: 1; display: block;">
    <img src="/assets/img/training/agentic-re-secondary.jpg" alt="DEF CON Training signage for Agentic RE: Automating Reverse Engineering & Vulnerability Research with AI" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
  </a>
</div>

If this post made you want to drive Ghidra and more with local agents against real targets, I am teaching a two-day class at DEF CON 34: **Agentic RE: Automating Reverse Engineering & Vulnerability Research with AI**, August 10-11 2026 in Las Vegas.

The training walks through:

- LLM and MCP fundamentals, model selection, and local stack setup
- Building your own MCP server in Python and FastAPI, with custom Ghidra integration
- Prompt engineering, workflow security, and orchestration with DSPy
- Reproducible agent workflows across Windows, Apple, Android, and other platforms

More info: [Agentic RE @ DEF CON 34](https://l.clearseclabs.com/defcon-agentic-re-vegas-2026)

---

*Next in this series: [Local LLMs for Reverse Engineering: Rediscovering D-Link DNS-320L CVE-2024-3273 with Gemma-4](/posts/local-llms-for-reverse-engineering-rediscovering-dns320l-cve-2024-3273/). Six scaffolding variants against the same firmware, six different outcomes, and what happens when an unprimed local model is asked to find the bug from scratch.*
