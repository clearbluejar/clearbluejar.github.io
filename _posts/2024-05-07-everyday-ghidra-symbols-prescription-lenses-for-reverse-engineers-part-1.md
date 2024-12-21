---
layout: post
title: 'Everyday Ghidra: Symbols — Prescription Lenses for Reverse Engineers — Part 1'
date: 2024-05-07 00:00 +0000
description: "In reverse engineering a closed-source binary using Ghidra or other software reverse engineering frameworks, a key objective is to retrieve information that clarifies the disassembled code. This involves identifying function names, prototypes, data types, constants, and enums. These elements, symbolized as human-readable identifiers, simplify both programming and reverse engineering by providing a more intuitive representation of the program’s state, akin to using a high level language versus assembly code. Leveraging these symbols within Ghidra can significantly aid in understanding the program’s behavior."
image:
  path: "/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/everyday-ghidra-symbols-1-title.png"
  src: "/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/everyday-ghidra-symbols-1-title.png"
  lqip: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAYAAAD68A/GAAAAAklEQVR4AewaftIAAADvSURBVA3BTS/DAACA4Xdtde10WlrbSmJGll0kJA47iqOL+w4Oc/QXXFz8il2c3SVukyzixAEHISLmqxlt1+lqiXbleTIVzU51IcWQRKq2xe52gbOTe96DEVrcZ2e/Sa2xhySTUipXWS8v0GjWqRRCXo9v0YuTaIMYIp8kdBBEUqa0PFsbc5j5LE77mjdilF+Jj08VRYXx9ykS/9ZqOvPLMzy2O4RKwCgj030aUifi5rBDz11FLGZzB4uSh+Wd8yOndN0IwzB5ueuxuTKNNatydPWFNEwSnh2fVj+HZY0RBgFekGIulXiwJ2hdulz4CX9jDlWM2U1bcwAAAABJRU5ErkJggg==
  mermaid: true
category:
- everydayghidra
- symbols
tags:
- windows
- reverse-engineering
mermaid: true
---

# Everyday Ghidra: Symbols — Prescription Lenses for Reverse Engineers — Part 1


In reverse engineering a closed-source binary using [Ghidra](https://github.com/NationalSecurityAgency/ghidra) or other software reverse engineering frameworks, a key objective is to retrieve information that clarifies the disassembled code. This involves identifying function names, prototypes, data types, constants, and enums. These elements, symbolized as human-readable identifiers, simplify both programming and reverse engineering by providing a more intuitive representation of the program’s state, akin to using a [high level](https://en.wikipedia.org/wiki/High-level_programming_language) language versus assembly code. Leveraging these symbols within Ghidra can significantly aid in understanding the program’s behavior.

> A [**symbol**](https://en.wikipedia.org/wiki/Symbol_(programming)) in computer programming is a primitive data type whose instances have a human-readable form.

Symbols make code easier to understand. They can transform code without meaning or context…

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-32-27.png)

Into something we can work with…

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-33-44.png)

**Symbols breathe life into reverse engineering and bring hope to the reverse engineer.**

## Symbol Information Sources

There are several ways to recover name and type information from closed-source binaries. Let’s start with named exports.

## Exports

When a binary wants to provide functionality for other programs, it typically makes that functionality available via a reference in the export table. If a binary exports a function by name, that function name will be available in the [export table](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#export-name-table).

> Export Name Table
> 
> The export name table contains the actual string data that was pointed to by the export name pointer table. The strings in this table are public names that other images can use to import the symbols. [_MSDN Exports_](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#export-name-table)

If we view the exports for a Windows binary, we can see all the functionality provided with useful names.

```
PS C:\> dumpbin /EXPORTS C:\Windows\System32\localspl.dll

Microsoft (R) COFF/PE Dumper Version 14.37.32825.0
Copyright (C) Microsoft Corporation.  All rights reserved.

Dump of file C:\Windows\System32\localspl.dll

File Type: DLL

  Section contains the following exports for LocalSpl.dll

    00000000 characteristics
     E64EF86 time date stamp
        0.00 version
         400 ordinal base
         124 number of functions
         123 number of names

    ordinal hint RVA      name

        419    0 000A34B0 ClosePrintProcessor
        420    1 000A3530 ControlPrintProcessor
        421    2 000332C0 DllMain
        422    3 000A35B0 EnumPrintProcessorDatatypesW
        423    4 000A3680 GetPrintProcessorCapabilities
        424    5 00029830 InitializePrintMonitor2
        425    6 0000B1B0 InitializePrintProvidor
        401    7 00073160 LclIsSessionZero
        402    8 00073180 LclPromptUIPerSessionUser
        426    9 000A8510 LocalAddForm
        427    A 000A8550 LocalDeleteForm
        428    B 000A8590 LocalEnumForms
        429    C 00076BB0 LocalReadPrinter
        430    D 000A85E0 LocalSetForm
        431    E 000A3730 OpenPrintProcessor
        432    F 000A37C0 PrintDocumentOnPrintProcessor
        433   10 00077EE0 SplAbortPrinter
        403   11 0005C490 SplAddCSRPrinter
        434   12 000A8620 SplAddForm
        435   13 00079FB0 SplAddJob
        436   14 000A1130 SplAddMonitor
        437   15 000A1520 SplAddPort
        438   16 000A16D0 SplAddPortEx
        439   17 000A3850 SplAddPrintProcessor
        440   18 0005E870 SplAddPrinter
        <several lines omitted>
```

Ghidra can take advantage of this readily available information and apply the function name as a symbol throughout the analyzed binary.

You can view the binary exports in the _Symbol Tree Window_:

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-34-45.png)

If the export is utilized within the binary, the corresponding function call is appropriately labeled in the Ghidra rendered pseudo-code.

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-35-12.png)

## Imports

On the opposite side of exports, we have imports. If the analyzed binary imports functionality from other libraries, then function names are typically used to reference the external functions exported from another binary. These names are easily recovered from the import table from a binary.

The binary `localspl.dll` has several imports:

```
PS C:\> dumpbin /IMPORTS C:\Windows\System32\localspl.dll | more
    WS2_32.dll
              00000001 Characteristics
      0000000180134708 Address of HMODULE
      0000000180140380 Import Address Table
      000000018012AD90 Import Name Table
      000000018012BE98 Bound Import Name Table
      0000000000000000 Unload Import Name Table
                     0 time date stamp

                000000018003206B       Ordinal     4
                0000000180030EE2     2 FreeAddrInfoW
                0000000180030EF4       Ordinal   115
                0000000180030F18       Ordinal   116
                0000000180030F3C       Ordinal   111
                00000001800320FB       Ordinal     3
                00000001800320E9    4E WSASend
                00000001800320D7       Ordinal    22
                0000000180032035       Ordinal    21
                0000000180030E57     7 GetAddrInfoW
                00000001800320C5    20 WSACloseEvent
                00000001800320B3    25 WSACreateEvent
                00000001800320A1    58 WSASocketW
                000000018003207D       Ordinal    23
                0000000180032047    31 WSAGetOverlappedResult
                000000018003208F    4D WSAResetEvent
                0000000180032059       Ordinal     7
```

From several [dynamically linked libraries](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-libraries) (DLLs):

```
PS C:\> dumpbin /IMPORTS C:\Windows\System32\localspl.dll | findstr dll
Dump of file C:\Windows\System32\localspl.dll
    msvcrt.dll
    ntdll.dll
    RPCRT4.dll
    api-ms-win-core-threadpool-l1-2-0.dll
    api-ms-win-core-memory-l1-1-0.dll
    KERNELBASE.dll
    KERNEL32.dll
    api-ms-win-eventing-provider-l1-1-0.dll
    OLEAUT32.dll
    SspiCli.dll
    CRYPTSP.dll
    GDI32.dll
    USER32.dll
    ACTIVEDS.dll
    browcli.dll
    NTDSAPI.dll
    sfc_os.dll
    WINTRUST.dll
    WTSAPI32.dll
    SETUPAPI.dll
    CFGMGR32.dll
    drvstore.dll
    ext-ms-win32-subsystem-query-l1-1-0.dll
    Cabinet.dll
    <several lines omitted> 
```

Imports can be viewed in Ghidra’s _Symbol Tree Window_:

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-36-47.png)

Although not all imports are named ([ordinals](https://learn.microsoft.com/en-us/cpp/build/exporting-functions-from-a-dll-by-ordinal-rather-than-by-name?view=msvc-170) are sometimes used instead), named calls to external libraries can be utilized within the binary to improve the reverse engineering results.

## Type Information Provides New Lenses

Simply having names isn’t sufficient for reverse engineering large binaries. In addition to function names, acquiring data type information is also crucial.

## Public Symbols

On Windows, type information can be obtained from readily available public symbols (available for most Microsoft OS binaries).

Here is a dump of public symbols from `user32.dll:`

As you can see from above, function names **and type information for function parameters** are provided. If we can define a function prototype and parameter data types, Ghidra’s decompiler is smart enough to know that this paramater is of type X and propagate that to the subsequent decompilaiton.

Here is `CreatefileW` function prototype rendered using public symbol type information:


![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-37-47.png)

**CreateFileW** function prototype from public symbols

And the resulting decompilation respects the defined return type (`HANDLE`) and propagates it throughout.

## Public Headers

Other times you can scrape type information from public headers files which can be used by your Software Reverse Engineering tool to provide better decompilation and navigation.

From the Windows SDK we know the full `CreateFileW` function prototype:

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-38-09.png)


If we can define a function prototype and types for each parameter, Ghidra can leverage that information and propagate it throughout the decompilation. Here is the function signature for `CreateFileW` leveraging extra type information:

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-43-42.png)

**CreateFileW** function prototype fully defined

Notice the full definition of the `dwCreateDisposition`. This information we can easily obtain from [MSDN](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).

Then define that ENUM type in Ghidra:

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-43-56.png)

With this extra type information the decompilation becomes even clearer.

> Symbols breathe life into reverse engineering and bring hope to the reverse engineer.

Check out the enhanced `CreateFileW`psuedo-code:

## Debug Binaries and Private Symbols

If you are reversing a debug version of a binary, Ghidra can generally pull out the information and use it. Typically, if you have a debug version, there is no need to reverse as you most likely have the source.

As for private symbols, most Windows binaries don’t include private symbols. But that is not always the case…

![](/assets/img/2024-05-07-everyday-ghidra-symbols-prescription-lenses-for-reverse-engineers-part-1/2024-12-06-15-44-15.png)

Ghidra loading combase.pdb

The symbols file for `combase.dll` is massive and includes much more information than your typical [pdb](https://learn.microsoft.com/en-us/cpp/build/reference/pdb-use-program-database?view=msvc-170) from Microsoft.

Perhaps, [COM](https://learn.microsoft.com/en-us/windows/win32/com/component-object-model--com--portal) is so difficult that they want to provide reverse engineers and those trying to debug their software a glimmer of hope? 🙃

---

This is part one of a look into how symbols enhance reverse engineering and details on how Ghidra can take advantage. Stay tuned for part 2 when we walk through how to leverage Ghidra’s symbol acquisition automation.

---

# Going Deeper

## Everyday Ghidra

If you’re looking to get a foothold in reverse engineering using Ghidra, consider my training “Everyday Ghidra”.

Check out CLEARSECLABS for details on the latest course offerings. 

[Everyday Ghidra: Practical Windows Reverse Engineering](https://www.clearseclabs.com/#portfolio).

> This course provides a comprehensive guide to using Ghidra, covering fundamental operations to advanced techniques, with hands-on exercises on real-world Windows applications. It’s designed for those with foundational Windows and security knowledge, aiming to equip them with practical “everyday” reverse engineering skills using Ghidra.

