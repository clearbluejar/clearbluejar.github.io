---
layout: post
title: A Survey of Windows RPC Discovery Tools
date: 2022-06-02 00:11 -0500
description:  A survey of Windows Remote Procedure Call discovery tools and an attempt to understand how open source tools discover RPC servers, interfaces, and procedures.
author: clearbluejar
category:
- windows
- rpc
tags:
- rpcdump
- rpcview
- ntobjectmanager
- impacket
- NTLMrelay
- rpc
- windows

image:
  path: "/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/todd-quackenbush-IClZBVw5W5A-unsplash.jpg"
  src: "/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/todd-quackenbush-IClZBVw5W5A-unsplash.jpg"
  alt: A survey of RPC tools - Cover photo by Todd Quackenbush on Unsplash
mermaid: true
---

**TL;DR; A survey of Windows Remote Procedure Call discovery tools and an attempt to understand how open source tools discover RPC servers, interfaces, and procedures.**

Windows RPC has been a black box for me for some time. This post is an attempt to leverage analysis of open source RPC tools to pry open that box. I started by reading MSDN, getting bored and then bouncing between several [detailed](https://csandker.io/2021/02/21/Offensive-Windows-IPC-2-RPC.html) security and [research](https://www.fortinet.com/blog/threat-research/rpc-bug-hunting-case-studies---part-2) blog [posts](https://itm4n.github.io/fuzzing-windows-rpc-rpcview/). Reading was my first step down the road of Windows RPC comprehension, and it helped me understand RPC at a high level. 

> Microsoft Remote Procedure Call (RPC) defines a powerful technology for creating distributed client/server programs. The RPC run-time stubs and libraries manage most of the processes relating to network protocols and communication. This enables you to focus on the details of the application rather than the details of the network.
> -[MSDN](https://docs.microsoft.com/en-us/windows/win32/rpc/rpc-start-page)

RPC is a way to standardize security and communication across either local or distributed clients and servers. Used in services to provide a separation of privileges (as it supports [impersonation](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcimpersonateclient)) or as means to provide secure communication across a network through available [transports](https://docs.microsoft.com/en-us/windows/win32/rpc/protocol-sequence-constants). It is [prolific](https://www.windows-security.org/windows-service/rpc-endpoint-mapper#:~:text=The%20following%20system%20components%20are%20dependent%20on%20the%20RPC%20Endpoint%20Mapper%20service) in Windows and therefore useful to understand for auditing or researching Windows.

When I'm trying to understand something, reading is hardly ever enough. I often use writing as a tool for understanding (hence this blog). I find I can't feign understanding in writing. This post will examine existing RPC discovery and enumeration tools hoping to understand each of the tools' means for RPC discovery.

Questions to consider:
- Which tools enumerate RPC?
- By what means can RPC servers (and clients) be found?
- What are the advantages and disadvantages of dynamic vs static tools?
- What approaches are used by the various RPC tooling?

### Evidence of RPC

Here are some well-known ways to identify RPC within a binary.

- **Look for the import of rpcrt4.dll**
  - Each binary that supports RPC will need to [link](https://en.wikipedia.org/wiki/Linker_(computing)) against the RPC runtime (`rpcrt4.dll`) to support common RPC actions.
  - The import of rpcrt4.dll may not be found in the binary of the server or application running RPC, it could be in a dependency DLL loaded at runtime with a RPC runtime dependency. This needs to be considered for the tooling looking for RPC, whether you attempt to discover RPC statically (by examining the binary) or dynamically (looking at a process at runtime).
- **Query the RPC endpoint mapper** - Windows runs a service known as the RPC Endpoint Mapper. If (and only if) a RPC server registers with the endpoint mapper via an Win32 API such as [`RpcEpRegister`](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcepregister) will the server be known to the RPC Endpoint Mapper.

These common ways, mentioned in [0xcarsten](https://twitter.com/0xcsandker)'s RPC post [here](https://csandker.io/2021/02/21/Offensive-Windows-IPC-2-RPC.html), are also alluded to in MSDN under [linking](https://docs.microsoft.com/en-us/windows/win32/rpc/compiling-and-linking) and [registering endpoints](https://docs.microsoft.com/en-us/windows/win32/rpc/registering-endpoints).

Some of the less known ways include the **walking of RPC data structures** available both in the compiled RPC binary and in a RPC process memory at runtime.  These methods, detailed below by tools like *RpcView* and *NtObjectManager*, provide the means to not only find RPC servers and clients but also derive the [interfaces](https://docs.microsoft.com/en-us/windows/win32/rpc/developing-the-interface) and procedures within the binary.

## RPC Tools - Discovering RPC Servers, Interfaces and Procedures

To begin, we survey the landscape a bit to understand each tool's heuristic for RPC discovery.

### RPCView

![rpcview-github](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/rpcview-github.png){: .shadow }_RpcView_

RpcView discovers RPC servers already running on your host. It takes a dynamic (runtime) approach to discovery. RpcView starts by enumerating every running process and discovers the RPC [interface](https://docs.microsoft.com/en-us/windows/win32/rpc/developing-the-interface), [endpoint](https://docs.microsoft.com/en-us/windows/win32/rpc/finding-endpoints), and [AuthInfo](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcbindingsetauthinfo) for each of the running RPC servers it detects. Finally, it displays the results in a nice GUI. 

![rpcview-gui](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/rpcview-gui.png){: .shadow }_RpcView GUI_


#### Code
> Source: https://github.com/silverf0x/RpcView

As far as I can tell by exploring the code related to enumerating interfaces is:

1. [EnumProcess](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCommon/Misc.c#L86) - The `EnumProcess` function enumerates all the processes by iterating through all the PIDs within a current process snapshot (see [CreateToolhelp32Snapshot](https://docs.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-createtoolhelp32snapshot)). It is called when RpcView is [initialized](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcView/InitViewsVisitor.cpp#L42) and again as the [user clicks](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcView/RefreshVisitor.cpp#L45) on the various widgets (interfaces, endpoints, processes) within the GUI to ensure that a fresh process listing is used. 
2. [GetRpcServerAddressInProcess](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L210) - For RpcView's ability to enumerate RPC interfaces, endpoints, and all other RPC information, it first attempts to discover the global symbol `GlobalRpcServer` from the [*rpcrt4.dll*](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L235) (RPC runtime dll) loaded in the running processes address space.  The `GlobalRpcServer` variable is a pointer to a root [`_RPC_SERVER_T`](https://github.com/silverf0x/RpcView/blob/67696389dec705a58704647e590fe4f74fab0d6c/RpcCore/RpcCore4_64bits/RpcInternals.h#L88) data structure needed to unravel all related RPC information with a process. The `GlobalRpcServer` is found in the the `.data` section of the *rpcrt4.dll*, so for each running process, `GetRpcServerAddressInProcess` function searches through the entire [.data](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L237)  section (brute force style) dereferencing [one sizeof(void \*) pointer at a time](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L246)) until it finds the `GlobalRpcServer` data structure.  It identifies the GlobalRpcServer symbol by leveraging RpcView's [heuristic](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L198) to identify the symbol. Essentially, they are searching for a unique RPC [GUID](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L180) *8a885d04-1ceb-11c9-9fe8-08002b104860* known as the [NDR Transfer Syntax Identifier](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/b6090c2b-f44a-47a1-a13b-b82ade0137b2). More details of this heuristic and RPC data structures are better explained by [*@_xpn_*](https://twitter.com/_xpn_) in his [analysis of RPCView](https://blog.xpnsec.com/analysing-rpc-with-ghidra-neo4j/).
   Once found,  `GlobalRpcServer` is [assigned](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L253) and subsequently used as the starting point for the all functionality we care about (`RpcCoreEnumProcessInterfaces`, `RpcCoreEnumProcessEndpoints`, and `RpcCoreEnumProcessAuthInfo`). Each of these functions has a similar start. Open process for reading memory, populate the `_RPC_SERVER_T` data structure with the memory pointed to by  `GlobalRpcServer`.
      ```c
    BOOL __fastcall RpcCoreEnumProcessInterfaces(void* pRpcCoreCtxt,DWORD Pid,RpcCoreEnumProcessInterfacesCallbackFn_T RpcCoreEnumProcessInterfacesCallbackFn,void* pCallbackCtxt,ULONG InterfaceInfoMask)
    {
        HANDLE					hProcess;
        BOOL					bResult=FALSE;
        RPC_SERVER_T			RpcServer;
        UINT					i;
        UINT					Size;
        VOID PTR_T *			pTable=NULL;
        VOID PTR_T				pRpcServer;
        BOOL					bContinue=TRUE;
        RpcInterfaceInfo_T*		pRpcInterfaceInfo = NULL;
        RpcCoreInternalCtxt_T*	pRpcCoreInternalCtxt=(RpcCoreInternalCtxt_T*)pRpcCoreCtxt;

        hProcess=ProcexpOpenProcess(PROCESS_VM_READ|PROCESS_QUERY_INFORMATION,FALSE,Pid);
        if (hProcess==NULL) goto End;

        if (!ReadProcessMemory(hProcess,pRpcCoreInternalCtxt->pGlobalRpcServer,&pRpcServer,sizeof(VOID PTR_T),NULL)) goto End;
    ```
    {: file='RpcCore/RpcCore.c'}
    <sub> `GlobalRpcServer` starting point within `RpcCoreEnumProcessInterfaces` assigned to RPC_SERVER_T data structure </sub>


3. [RpcCoreEnumProcessInterfaces](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L854) - Enumerating RPC interfaces and procedures in a process. Starting with the [`GlobalRPCServer`](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L870) the basic objective is to dig into its  [`_RPC_SERVER_T`](https://github.com/silverf0x/RpcView/blob/67696389dec705a58704647e590fe4f74fab0d6c/RpcCore/RpcCore4_64bits/RpcInternals.h#L88) data structure to identify the RPC interface [`_RPC_INTERFACE_T`](https://github.com/silverf0x/RpcView/blob/67696389dec705a58704647e590fe4f74fab0d6c/RpcCore/RpcCore4_64bits/RpcInternals.h#L124) data structures. `RpcCoreEnumProcessInterfaces` [iterates](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L883) through all the interfaces and pulls out detailed information via [InternalGetInterfaceInfo](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L584). The `InternalGetInterfaceInfo` function copies  data from process memory to populate a detailed [`RpcInterfaceInfo_T`](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.h#L95) data structure used by RpcView to [update](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L888) the GUI. The RPC interface [IDs](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L627) and [procedure address table](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L773) are populated within this function. The procedure names for the interface are not available from process memory, but are later [enriched](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcView/InterfaceSelectedVisitor.cpp#L154) by referencing the [PDB symbols for the corresponding binary](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcView/Pdb.c#L170) and the procedure address table to produce the procedure names (assuming symbols are configured).
4. [RpcCoreEnumProcessEndpoints](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L903) - Enumerating RPC endpoints in a process. This function again relies on the base [`GlobalRPCServer`](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L923) data structure and [iterates](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L935) a simple array that holds the RPC endpoint information (specifically the [name](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L939) and [protocol](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L938)) for the endpoint. There can be more than one endpoint within a process.
5. [RpcCoreEnumProcessAuthInfo](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L995) - Enumerate the AuthInfo in a RPC process. Just like the previous two, starting with [`GlobalRPCServer`](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L1022), [iterating](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L1031) over the AuthInfo, and populating RpcView's [RpcAuthInfo_T](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.h#L166) data structure.

#### Thoughts
RpcView's runtime approach to RPC discovery has both advantages and disadvantages. An immediate disadvantage that comes to mind is that perhaps a server isn't running? It could be missed. Some RPC servers are activated by some distinct action or [trigger](https://docs.microsoft.com/en-us/windows/win32/services/service-trigger-events). If an RPC server isn't running, then **RpcView is blind to it**.  The counter is that what you see is what you get. There is no mystery or time wasted trying to figure out how to trigger a RPC server, because it is already running. 

Also, what about trying to [open a handle](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCommon/Misc.c#L31) to a process with a higher [PPL](http://www.alex-ionescu.com/?p=97) than that of RpcView (even running as admin)? It wouldn't be possible to open a handle to the process to analyze the runtime memory.

An advantage to reading some of the RPC data structures at runtime is that it has access to [interface registration flags](https://docs.microsoft.com/en-us/windows/win32/rpc/interface-registration-flags) and authentication info for the server. Some of the RPC specific information is not directly available in the compiled binary, IDL, or ACF file. When the server registers an interface, it passes a flag to the Windows API[`RpcServerRegisterIf2`](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcserverregisterif2). The registration flags configure the RPC server at runtime.

![rpcview-auth-reg](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/rpcview-authinfo-registation-flags.png){: .shadow }_RpcView AuthInfo (top) Registration Flags (bottom) GUI_

**No other tool analyzed provides this information**. This is helpful when trying to understand the connection requirements for a client binding to the server.

### NtObjectManager

![ntobjectmanager-github](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/ntobjectmanager-github.png){: .shadow }_NtObjectManager_

[NtObjectManager](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/tree/main/NtObjectManager) is the PowerShell module that exposes several RPC discovery methods (such as `Get-RpcServer`) (backed by its supporting .NET managed library [NtApiDotNet](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/tree/main/NtApiDotNet)). *NtObjectManager* goes about discovering RPC servers (and even clients) a bit differently. It does not look directly at running processes, but rather it will parse a list of PE files that you feed it to attempt to discover if the binary is an RPC server.  It will then load each of those PE files and parse NDR data structures (think `_RPC_SERVER_T` and `_RPC_INTERFACE_T` from RpcView) found with the data section of RPC compiled binaries. From the data structures the RPC *interfaces*, *endpoints*, and *procedures* can also be discovered as in RpcView.

#### Code
> Source: https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools

The starting point for RPC server enumeration is the [`Get-RpcServer`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/067c7581fdbaca482525063ad73ef0d134598cff/NtObjectManager/RpcFunctions.ps1#L253) powershell [cmdlet](https://docs.microsoft.com/en-us/powershell/scripting/developer/cmdlet/cmdlet-overview?view=powershell-7.2#:~:text=A%20cmdlet%20is%20a%20lightweight,them%20programmatically%20through%20PowerShell%20APIs.) that takes a list of binaries as input to parse as RPC server objects. 

```powershell
# Find all servers in SYSTEM32. 
PS C:\Users\user> $rpc = ls "C:\Windows\system32\*" -Include "*.dll","*.exe" `
  | Get-RpcServer

```

For NT Object Manager:
> This command does a heuristic search in a DLL's data sections for RPC servers and clients and parses the NDR structures. You can use this to generate RPC server definitions similar to RpcView (but in my own weird C# pseudo-code syntax) but for this scenario we only care about the clients.-   [Finding Windows RPC Client Implementations Through...](https://www.tiraniddo.dev/2018/11/finding-windows-rpc-client.html)

For each binary it calls out to the static method [`[NtApiDotNet.Win32.RpcServer]::ParsePeFile`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L271) within *NtApiDotNet*. This is where all the magic happens, or at least where it begins.  You might want to grab a coffee before getting into this next section, or skip it entirely and check out the [summary](#summary). Otherwise, brace yourself.

The code path for RPC discovery via `[NtApiDotNet.Win32.RpcServer]::ParsePeFile` can be summarized as follows:

1. [LoadLibrary](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L271) - The first thing is a call to [LoadLibrary](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L274) on the supplied binary path (such as *C:\\Windows\\System32\\lsass.exe*). This call is essentially a .NET wrapper (or [interop](https://docs.microsoft.com/en-us/dotnet/csharp/programming-guide/interop/interoperability-overview)) around the [Win32 Native `LoadLibraryEx`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/SafeLoadLibraryHandle.cs#L1054) that returns a [SafeLoadLibraryHandle](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/SafeLoadLibraryHandle.cs#L352) class type (which is a class that holds a reference to the loaded module with several useful [helper methods](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/SafeLoadLibraryHandle.cs#L383)). An interesting (and likely necessary for stability) flag passed to `LoadLibraryEx` here is *DONT_RESOLVE_DLL_REFERENCES*, which will prevent the `DllMain` from being called and further dependencies being loaded. Interestingly, MSDN [tells us not to use it](https://docs.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexa#:~:text=Do%20not%20use%20this%20value), but it seems like it would serve the purpose of just loading the binary to get a handle to the module for data parsing no?
2. [GetImageSections](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/SafeLoadLibraryHandle.cs#L543) - After the `SafeLoadLibraryHandle` type is created, `GetImageSections` is [called](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L282) to parse each [section](https://docs.microsoft.com/en-us/cpp/build/reference/section-specify-section-attributes?view=msvc-170) of the loaded module. This is done via a call to the private method `SetupValues`  responsible for building the list of [*ImageSections*](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/ImageSection.cs#L24) assigned the private `SafeLoadLibraryHandle` class member `<List>  _image_sections` [here](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/SafeLoadLibraryHandle.cs#L1587).
3. [FindRpcServerInterfaces](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L435) - Each image section (`.text`,`.data`,etc.) is then [passed](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L283) into `FindRpcServerInterfaces`. This call has a similar goal as the `GetRpcServerAddressInProcess` call in RpcView, that of searching for the root of `RPC_SERVER_T` data structure (pointed to at runtime by the `GlobalRpcServer` symbol). For `FindRpcServerInterfaces` the data structure is [`RPC_SERVER_INTERFACE`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L579) and it discovers the data quite differently. Rather than looking for the `GlobalRpcServer` symbol within the *rpcrt4.dll* `.data` section at runtime, it discovers the data structure within the read-only data section (`.rdata`) memory section of the image it just loaded in step 1. It seems as though the base RPC data structure leading to interface, MIDL information, and all things RPC are available within the of the image on disk as well (AuthInfo excepted). `FindRpcServerInterfaces` [searches](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L440) through all loaded image memory sections for the [`DCE_TransferSyntax`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L135) GUID. Once it is found, it returns a  `IEnumerable<RpcOffset>` used in the next step. 
    
    Some other key differences from RpcView are that `FindRpcServerInterfaces`: 
    - [searches](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L440) for an alternative [`NDR64_TransferSyntax`](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rpce/dca648a5-42d3-432c-9927-2f22e50fa266) GUID *71710533-BEBA-4937-8319-B5DBEF9CCC36*.  RpcView has code that will [identify](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcView/InterfacesWidget.cpp#L329) it in the `InterfacesWidget::AddInterfaces` enhancing the GUI, but will not find it when identifying RPC servers.  I wonder if any interfaces come up with the *NDR64* identifier?? I guess even if the *NDR64* syntax ID was found, it [can't be fully parsed](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/5e00a851f88e735b95f059afd7e27e93f3b11752/NtApiDotNet/Ndr/NdrParser.cs#L338). 
    - doesn't seem to be limited to the `.data` section, it looks at all sections (not sure if it matters though?). It's only requirement is that the image section [be readable](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L437). 
    
4. [SymbolResolver.Create](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L288) - At this point, a new instance of a `SymboleResolver` is [created](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L288) to leverage the pdb symbols for the RPC server (if available).  I won't explain any details of this besides it depends on `dbghelp.dll` being installed and configured to work properly. It is used later to resolve or "[fixup](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/5e00a851f88e735b95f059afd7e27e93f3b11752/NtApiDotNet/Ndr/NdrParser.cs#L289)" procedure names once they are identified. 
5. [ReadFromRpcServerInterface](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrParser.cs#L733) -  Read out [*RPC_SERVER_INTERFACE*](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L579) from the `.rdata` image section in memory. For [each](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L295) of the found `RpcOffset`s from `FindRpcServerInterfaces` a *NdrParser* is [instantiated](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L298) and leveraged to parse out all of the interfaces and procedures.  The [*NdrParser*](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrParser.cs#L143) class calls `ReadFromRpcServerInterface` which in turn [calls](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrParser.cs#L735) its private method `ReadRpcServerInterface` that performs the rest of the work. On success, it returns a [`NdrRpcServerInterface`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrRpcServerInterface.cs#L25) that is used to finally generate an [`RpcServer`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L32) class to [add to the list](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L304) of RPC servers found. 
6. [ReadRpcServerInterface](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrParser.cs#L151) - Now we are in the thick of it. Within this method several things happen that for brevity  (and hopefully not for lack of understanding) I will summarize.
    - [GetDispatchTable](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L591) - This function reads the *RPC_DISPATCH_TABLE* struct [referenced](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L584) within *RPC_SERVER_INTERFACE* needed to get a count of the number of procedures for the interface ([just like](https://github.com/silverf0x/RpcView/blob/66288f93663f91ede5143ce20fa556fb5cdcc3dc/RpcCore/RpcCore.c#L495) RpcView). 
    - [ReadProcs](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrParser.cs#L294) - This method resolves all of the *procedures* relative to the identified interface and the *RPC_DISPATCH_TABLE* that contains the info needed to find the procedure offsets. It is within this function that all the procedures [get their names](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrProcedureDefinition.cs#L218) from the aforementioned `SymbolResolver`.
    - [GetProtSeq](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrNativeUtils.cs#L610) Reads out all the *endpoints* pointers and transforms each one into a new `NdrProtocolSequenceEndpoint` class that assigns the [protocol](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrProtocolSequenceEndpoint.cs#L37) and [endpoint](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrProtocolSequenceEndpoint.cs#L38). 
    - `new NdrRpcServerInterface` - This call takes all of the parsed information and wraps it into a nice data structure [`NdrRpcServerInterface`](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Ndr/NdrRpcServerInterface.cs#L25)

```c#
private static NdrRpcServerInterface ReadRpcServerInterface(IMemoryReader reader, RPC_SERVER_INTERFACE server_interface, 
    NdrTypeCache type_cache, ISymbolResolver symbol_resolver, NdrParserFlags parser_flags, IntPtr base_address)
{
    RPC_DISPATCH_TABLE dispatch_table = server_interface.GetDispatchTable(reader);
    var procs = ReadProcs(reader, server_interface.GetServerInfo(reader), 0, 
        dispatch_table.DispatchTableCount, type_cache, symbol_resolver, null, parser_flags, base_address);
    return new NdrRpcServerInterface(server_interface.InterfaceId, server_interface.TransferSyntax, procs,
        server_interface.GetProtSeq(reader).Select(s => new NdrProtocolSequenceEndpoint(s, reader)));
}
```
{: file='NtApiDotNet/Ndr/NdrRpcServerInterface.cs'}

#### Thoughts
Well, one thought it that my head hurts. My venture into RPC enumeration tools has led me down paths of C++ and C# that I didn't know I could travel. But as for *NtObjectManager* the tool and its RPC enumeration capability, I like it.  It is trivial to discover all the RPC on a machine, both servers and [RPC clients alike](https://github.com/googleprojectzero/sandbox-attacksurface-analysis-tools/blob/c02ed8ba04324e54a0a188ab9877ee6aa372dfac/NtApiDotNet/Win32/RpcServer.cs#L462). One current downside is that it doesn't seem to parse out any of the *AuthInfo* or registation flags as RpcView reports. On the other hand, it doesn't miss an RPC servers or clients if they can be found on disk.

### RPCEnum

![rpcenum](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/rpcenum-github.png){: .shadow }_RpcEnum_

This tool is [well described](https://blog.xpnsec.com/analysing-rpc-with-ghidra-neo4j) by *@_xpn_*.  It is based on an RpcView runtime discovery and enumeration strategy.

#### Code
> Source: https://github.com/xpn/RpcEnum

The [`RPC::huntForGlobalRPCServer`](https://github.com/xpn/RpcEnum/blob/master/RpcEnum/RpcEnum/rpc.cpp#L101) function mimics RpcView's search for `GlobalRpcServer`. The project it much easier to understand, more straight to the point and not littered with callbacks to QT like RpcView. In hind sight, I should have started here to better understand RpcView. Some nice features include the ability to [dump JSON](https://github.com/xpn/RpcEnum/blob/master/RpcEnum/RpcEnum/RpcEnum.cpp#L62) files related to interfaces and their procedures as pointed out in the [corresponding article](https://blog.xpnsec.com/analysing-rpc-with-ghidra-neo4j/), the ability to graph all the things and find links between RPC calls and Win32 calls within RPC server binaries.  

### RPCDump

![rpcdump](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/rpcdump-github.png){: .shadow }_RPCDump_

This is a dynamic tool by [0xcsandker](https://twitter.com/0xcsandker) that relies on an endpoint being registered by an RPC server via [` RpcEpRegister`](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcepregister). During an RPC server initialization, the server would have had to call this function to make it known to the endpoint mapper. 

#### Code
> Source: https://github.com/csandker/RPCDump

The code follows a path iterating through each endpoint in the RPC endpoint mapper.

>Another option is to query the Endpoint Manager directly by calling [RpcMgmtEpEltInqBegin](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcmgmtepeltinqbegin) and iterating over the interfaces via [RpcMgmtEpEltInqNext](https://docs.microsoft.com/en-us/windows/win32/api/rpcdce/nf-rpcdce-rpcmgmtepeltinqnext). [0xcsandker](https://csandker.io/2021/02/21/Offensive-Windows-IPC-2-RPC.html)

One cool thing about the tool is that is adds [known endpoints](https://github.com/csandker/RPCDump/blob/main/CPP-RPCDump/rpc_resolve.h#L4) to its analysis to enrich the information related to the outputs. . The known endpoints seem to be a collection known by the author from [various sources](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-efsr/ab3c0be4-5b55-4a08-b198-f17170100be6).


```powershell

PS C:\Users\user\source\repos\RPCDump\x64\Debug> .\CPP-RPCDump.exe localhost
## Testing protseq.: ncacn_ip_tcp

IfId: 51a227ae-825b-41f2-b4a9-1ac9557a1018 version 1.0
Known Endpoint: (C:\Windows\System32\keyiso.dll).
Annotation: Ngc Pop Key Service
UUID: 00000000-0000-0000-0000-000000000000
Binding: ncacn_ip_tcp:localhost[49664]

IfId: 367abb81-9844-35f1-ad32-98f038001003 version 2.0
Known Endpoint: [MS-SCMR](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-scmr/19168537-40b5-4d7a-99e0-d77f0f5e0241).
Annotation:
UUID: 00000000-0000-0000-0000-000000000000
Binding: ncacn_ip_tcp:localhost[49671]

IfId: 650a7e26-eab8-5533-ce43-9c1dfce11511 version 1.0
Known Endpoint: (C:\Windows\System32\rascustom.dll).
Annotation: Vpn APIs
UUID: 00000000-0000-0000-0000-000000000000
Binding: ncacn_np:localhost[\\PIPE\\ROUTER]

IfId: 2f5f6521-cb55-1059-b446-00df0bce31db version 1.0
Known Endpoint: (C:\Windows\System32\unimdm.tsp.
Annotation: Unimodem LRPC Endpoint
UUID: 00000000-0000-0000-0000-000000000000
Binding: ncacn_np:localhost[\\pipe\\tapsrv]

IfId: 12345678-1234-abcd-ef00-0123456789ab version 1.0
Known Endpoint: [MS-RPRN](https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-rprn/e8f9dad8-d114-41cc-9a52-fc927e908cf4).
Annotation:
UUID: 00000000-0000-0000-0000-000000000000
Binding: ncacn_ip_tcp:localhost[49669]

```


### Impacket - rpcdump.py

![impacket](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/impacket-github.png){: .shadow }_impacket - rpcdump.py_

Nothing but good things to say about the [impacket](https://github.com/SecureAuthCorp/impacket) python library allowing fine grained control of packets for various network protocols. When learning how to use NtObjectManager exercising Petitpotam, I used [@topotam77](https://twitter.com/topotam77)'s [PetitPotam.py](https://github.com/topotam/PetitPotam/blob/main/PetitPotam.py) python implementation leveraging impacket as a control to make sure I understood the expected behavior for Petitpotam. This led to my blog post [From NtObjectManager to PetitPotam](https://clearbluejar.github.io/posts/from-ntobjectmanager-to-petitpotam/).

#### Code

> https://github.com/SecureAuthCorp/impacket/blob/master/examples/rpcdump.py

The script, [rpcdump.py](https://github.com/SecureAuthCorp/impacket/blob/master/examples/rpcdump.py) is another tool that relies on the endpoint mapper having a registered endpoint from an RPC server. It also has the benefit of combining [known endpoints](https://github.com/SecureAuthCorp/impacket/blob/cd4fe47cfcb72d7d35237a99e3df95cedf96e94f/impacket/dcerpc/v5/epm.py) with the RPC enumeration results to provide more information. 


### Ghidra

![ghidra](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/ghidra.png){: .shadow style="max-width: 90%" }_Ghidra_

Ah [Ghidra](https://github.com/NationalSecurityAgency/ghidra), the most cost effective SRE tool on the market. It doesn't have any native RPC discovery or enumeration functionality that I am aware of, but it is often used in combination with the aforementioned tools to provide insight into RPC through [reverse engineering](https://blog.xpnsec.com/analysing-rpc-with-ghidra-neo4j/#:~:text=throw%20that%20into-,Ghidra,-to%20see%20how) or used as a part of suite of tools used to [map Windows RPC calls to native Win32 APIs](https://blog.xpnsec.com/analysing-rpc-with-ghidra-neo4j). *@_xpn_* also provided a [Ghidra python script](https://github.com/xpn/RpcEnum/blob/master/post_script.py#L32) that would leverage the JSON output from *RpcEnum* to discover the RPC procedures in binaries and then recursively dump the functions called by each procedure. 

#### WinRpcFunctions

![winrpcfunctions-github](/assets/img/2022-06-02-surveying-windows-rpc-discovery-tools/winrpcfunctions-github.png){: .shadow }_WinRpcFunctions_

Another article [Extending the Exploration and Analysis of Windows RPC Methods Calling other Functions with Ghidra, Jupyter Notebooks and Graphframes](https://medium.com/threat-hunters-forge/extending-the-exploration-and-analysis-of-windows-rpc-methods-calling-other-functions-with-ghidra-e4cdaa9555bd) by [@Cyb3rWard0g](https://twitter.com/Cyb3rWard0g) built on *xpn*'s work. 

##### Code 
> Source: https://github.com/Cyb3rWard0g/WinRpcFunctions

The researcher put both RPC [enumeration](https://github.com/Cyb3rWard0g/WinRpcFunctions/blob/master/resources/scripts/FindWinRpcFunctionsMaps.java#L164-L236) and _xpn_'s [recursive function discovery](https://github.com/Cyb3rWard0g/WinRpcFunctions/blob/master/resources/scripts/FindWinRpcFunctionsMaps.java#L49-L83) into a single Ghidra script.  The script could then map all RPC functions to Windows API calls within various RPC servers on disk. Using the script, RPC enumeration and discovery can be performed in Ghidra with it's ability to analyze binaries and enriched with PDB symbols.  Due to the fact that each binary needs to be analyzed in Ghidra for the script to function, it can take quite a bit of time.  To narrow down analysis to only RPC servers, *Cyb3rWard0g* leverages *NtObjectManager* initially to identify and generate the list of RPC servers to avoid analyzing more binaries than necessary. For further details on this cool idea check out the [blog post](https://medium.com/threat-hunters-forge/extending-the-exploration-and-analysis-of-windows-rpc-methods-calling-other-functions-with-ghidra-e4cdaa9555bd).

### Summary

It turns out there are several available tools to discover RPC on a Windows machine. I know I have not exhausted the list, but perhaps I came close.  Each tool and technique has their own advantages and disadvantages.  Here is a best effort on a summary.

| Tool               | Type    | Pros                             | Cons                                   | Requirements          | Language |
| ------------------ | ------- | -------------------------------- | -------------------------------------- | --------------------- | -------- |
| RpcView            | Dynamic | GUI, AuthInfo                     | Misses RPC clients and dormant servers | RPC Server Running    | C++      |
| NtObjectManager    | Static  | PS + Speed + Filtering + Clients | No AuthInfo                            | RPC Server Path Known | PS,C#    |
| RpcEnum            | Dynamic | JSON Output                      | Misses RPC clients and dormant servers | RPC Server Running    | C++      |
| RpcDump            | Dynamic | Well-Known Endpoints             | Blind to unregistered endpoints        |                       | C++      |
| Impacket - rpcdump | Dynamic | Well-Known Endpoints             |                                        |                       | Python   |
| WinRpcFunctions    | Static  | Ghidra only                      | Slow                                   | RPC Server Path Known | Java     |

#### When to use which tool?

The answer to this question is "it depends".

| RPC Purpose | Tools | Reason |
| --- | --- | --- |
| Trying to figure out client connection requirements | RpcView | Availability of AuthInfo |
| Dynamically looking at running RPC servers | RpcView | Easy to navigate across interfaces and click around |
| Looking for RPC clients | NtObjectManager | Ony tool that finds them? |
| Trying to find all RPC servers on a machine | NtObjectManager | RPC server doesn't have to be running |
| Testing an RPC interface | NtObjectManager | Builds RPC clients on the fly |
| Developing the next PetitPotam | impacket | low level control of RPC transport protocols |

That's all for now. The next post will be an in depth walkthrough of using NtObjectManager to discover the well known PetotPotam.

Please reach out [@clearbluejar](https://twitter.com/clearbluejar) with questions or comments. Also appreciate any [feedback or corrections](https://github.com/clearbluejar/clearbluejar.github.io/issues/new?assignees=&labels=&template=post-feedback.md&title=%5BFeedback%5D%20A%20Survey%20of%20Windows%20RPC%20Discovery%20Tools) you might have for the post.

---
<sub>Cover photo by Todd Quackenbush on Unsplash</sub>