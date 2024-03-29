---
layout: post
title: Desuperpacking Meta Superpacked APKs
date: 2023-06-30 11:12 +0000
description: Superpacking is a method of optimal binary compression developed by Meta to help reduce the size of their Android APKs. This compression for APKs makes sense for reducing network traffic required for distribution, but becomes an issue when trying to recover the original native ARM binaries for analysis. This post walks through the process of “desuperpacking” (decompressing) Meta Superpacked APKs. You will get an overview of Meta’s superpack compression, a quick look at Superpack internals, and eventually learn how to automate desuperpacking native Android ARM libraries using GitHub Actions.
image:
  path: "/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/pexels-fatih-turan-16196626.jpg"
  src: "/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/pexels-fatih-turan-16196626.jpg"
  alt: Desuperpacking Meta Android Superpacked APKs
category:
- android
- superpack
tags:
- github-actions
- patchdiffing
- apks
- superpack
- android
- meta
- whatsapp
- reverse-engineering
- automation
mermaid: true
---

*TL;DR Superpacking is a method of optimal binary compression developed by Meta to help reduce the size of their Android APKs. This compression for APKs makes sense for reducing network traffic required for distribution, but becomes an issue when trying to recover the original native ARM binaries for analysis. This post walks through the process of “desuperpacking” (decompressing) Meta Superpacked APKs. You will get an overview of Meta’s superpack compression, a quick look at Superpack internals, and eventually learn how to [automate desuperpacking](https://github.com/clearbluejar/apk-install-extract) native Android ARM libraries using GitHub Actions.*

## Discovering Superpacked APKs

So the Superpack compression technique, introduced in 2021, isn't so new , it was just new to me.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/meta-superpack-blog.png){: .shadow }_Meta's Superpack Blog Post_

Last month I needed to do some [patch diffing](https://cve-north-stars.github.io/docs/Patch-Diffing) analysis of some recent [WhatsApp CVEs](https://www.whatsapp.com/security/advisories/2022/).  I thought it would be as simple as downloading a copy of the APK and extracting the native libraries, and loading them into [Ghidra](https://cve-north-stars.github.io/docs/Ghidra-Patch-Diffing)...

### Expecting `libwhatsapp.so`

Expecting a simple listing of all the shared objects in the APK like this:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/7z-expected-apk.png){: .shadow }_WhatsApp Android APK for CVE-2019-3568_

### Finding `libsuperpack.so`

What I found instead searched for  `libwhatsapp.so` in the native lib folder of the APK was `libsuperpack.so`.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/apk-superpack.png){: .shadow }_WhatsApp Android APK for CVE-2022-36934_

Not knowing what this shared object was, I naively loaded up `libsuperpack.so` into Ghidra thinking they just statically compiled all the libs into a single shared object. This was not the case. 

If you look at the exports from `libwhatsapp.so` for an older version (like [CVE-2019-3568](https://www.facebook.com/security/advisories/cve-2019-3568) ) you expect to see several Java exports like `Java_com_whatsapp_*`:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/libwhatsappp.so-java-exports.png){: .shadow }_WhatsApp `libwhatsapp.so` exports_

In `libsuperpack.so`, all I saw was several references to several functions referencing decompression.... 

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/libsuperpack.so-exports.png){: .shadow }_WhatsApp `libsuperpack.so` exports_

What was I looking at? What happened to `libwhatsapp.so`? Time to learn more about Meta's Superpacking.

## Superpacked APKs

There isn't much out there about the technique beyond their blog post. There is a [subtle reference](https://github.com/facebook/SoLoader#requirements) to Superpacking in Facebook's [SoLoader](https://github.com/facebook/SoLoader) github repo, but it is a bit cryptic. Luckily, their well written Superpack blog post gives us insight into the process. 

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/android_superpacked_containers.jpg){: .shadow }_Superpacked Android APKs_

### Purpose

From the [article](https://engineering.fb.com/2021/09/13/core-data/superpack/): 

> Superpack combines compiler and data compression techniques to increase the density of packed data in a way that is especially applicable to code such as Dex bytecode and ARM machine code. 

Superpacking is Meta's compression technique for reducing the size of their [APK](https://en.wikipedia.org/wiki/Apk_(file_format))s making them easier to distribute as less bandwidth is required for distribution. This goal makes sense as they have distributed most of their apps [billions of times](https://en.wikipedia.org/wiki/List_of_most-downloaded_Google_Play_applications#More_than_5_billion_downloads). 

### Compression++

> Superpack improves the process of LZ parsing by enabling the discovery of longer repeating sequences while also reducing the number of bits to represent pointers.

My high level understanding of compression is an algorithm that reduces the amount of data needed to represent itself. A compression algorithm recognizes repeated data patterns, replaces them with a shorter symbol, and uses the shorter reference each time it is found in the original data. This process allows a smaller (compressed) representation of the original content. Apparently, Superpack goes beyond standard [LZ compression](https://en.wikipedia.org/wiki/Lempel%E2%80%93Ziv%E2%80%93Welch) and takes advantage of characteristics of compiled code and repeated byte patterns found within modern binaries. I'm not going to pretend to understand this well enough to explain it, check out [this part](https://engineering.fb.com/2021/09/13/core-data/superpack/#:~:text=Compressors%20typically%20identify%20repeating%20sequences%20of%20bytes%20using%20an%20algorithm%20selected%20from%20the%20LZ%20family.) of the blog for more detail. 

### Uses

> There are three main payloads targeted by Superpack. The first is Dex bytecode, the format into which Java gets compiled in Android apps. The second is ARM machine code, which is code compiled for ARM processors. The third is Hermes bytecode, which is a specialized high performance bytecode representation of Javascript created at Facebook.

The compression is optimized for [Dex bytecode](https://source.android.com/docs/core/runtime/dalvik-bytecode) (from source Java `.class` -> `.dex`), ARM [machine code](https://en.wikipedia.org/wiki/Machine_code) ( compiled native ARM binaries ) , and [Hermes](https://hermesengine.dev/) bytecode. In our particular case for WhatsApp, the main native ARM library `libwhatsapp.so` is now somehow contained within `libsuperpack.so`. This implies WhatsApp at least implements compression for its ARM machine code. Later in the post, we take a quick look at [Messenger](https://en.wikipedia.org/wiki/Messenger_(software)), which seems to optimize the Dex bytecode instead.

### Internals

The article reveals the reason behind the compression and provides clues on how it might be implemented.

> Superpack’s strength lies in compressing code, such as machine code and bytecode, as well as other types of structured data. The approach underlying Superpack is based on an insight in [Kolmogorov’s algorithmic measure of complexity](https://www.tandfonline.com/doi/abs/10.1080/00207166808803030), which defines the information content of a piece of data as the length of the shortest program that can generate that data.

Hmm. **The shortest program that can generate that data.**

With what we have already learned, and the fact the that expected native libraries have been replaced by `libsuperpack.so`, this new lib must be "a program that can generate that data". In our case, extract the missing shared object files.

#### WhatsApp APK via *jadx*

We can follow some [basic JNI reverse engineering techniques](https://www.ragingrock.com/AndroidAppRE/reversing_native_libs.html)  and use *jadx* and *Ghidra* to see how these native libraries work under the hood. Using [jadx-gui](https://github.com/skylot/jadx), we can load the [APK](https://www.apkmirror.com/apk/whatsapp-inc/whatsapp/whatsapp-2-22-16-12-release/whatsapp-messenger-2-22-16-12-android-apk-download/) and search for the string "superpack"...

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-superpack-strings.png){: .shadow }_Jadx "superpack" Strings_

From the string search we can immediately see a function that loads `libsuperpack.so` in `WhatsAppLibLoader`:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-loadlibrary.png){: .shadow }_WhatsApp loading `libsuperpack.so`_

The `loadSuperpack` method had a random name, so I renamed it for clarity. Taking a look at who calls `loadSuperpack` and finding `decompressLibraries` which calls `decompressAsset`. Seems like we are on the right track. 

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-decompressAsset.png){: .shadow }_jadx `decompressAsset` and `decompressLibraries`_

The `decompressAsset` method calls another function I renamed `callNativeSuperPackDecompress` that receives the parameter *COMPRESSED_LIBS_ARCHIVE_NAME*. The name is defined in the class `AbstractAppShellDelegate` as the string:

```java
public static final String COMPRESSED_LIBS_ARCHIVE_NAME = "libs.spk.zst"; 
```

Eventually, we will discover that this compressed archive is the one holding our missing shared files. 

And now for the `callNativeSuperpackDecompress` function:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-callnativesuperpack.png){: .shadow }_jadx decompiled `callNativeSuperpackDecompress`_

What's important about this function ends up calling the **native method** `decompress` on files. 

#### JNI Native Method Analysis

When [loading a native library](https://developer.android.com/training/articles/perf-jni#native-libraries) from Java with `System.LoadLibarary`, the method [`JNI_OnLoad`](https://android.googlesource.com/platform/development/+/master/samples/SimpleJNI/jni/native.cpp#91) (an export of the native lib) is called.  A `JNI_OnLoad` function returns the JNI version compiled  the library and typically registers any native methods for use in Java. Most `JNI_OnLoad` methods would have code similar to this [sample native.cpp](https://android.googlesource.com/platform/development/+/master/samples/SimpleJNI/jni/native.cpp).

```cpp
// from platform/development/+/master/samples/SimpleJNI/jni/native.cpp

// ----------------------------------------------------------------------------
/*
 * This is called by the VM when the shared library is first loaded.
 */
 
jint JNI_OnLoad(JavaVM* vm, void* /*reserved*/)
{
    UnionJNIEnvToVoid uenv;
    uenv.venv = NULL;
    jint result = -1;
    JNIEnv* env = NULL;
    
    ALOGI("JNI_OnLoad");
    if (vm->GetEnv(&uenv.venv, JNI_VERSION_1_4) != JNI_OK) {
        ALOGE("ERROR: GetEnv failed");
        goto bail;
    }
    env = uenv.env;
    if (registerNatives(env) != JNI_TRUE) {
        ALOGE("ERROR: registerNatives failed");
        goto bail;
    }
    
    result = JNI_VERSION_1_4;
    
bail:
    return result;
}
```


For `libsuperpack.so` we can see similar code in `JNI_OnLoad_Weak`:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/ghidra-jni_onload.png){: .shadow }_`libsuperpack.so` `JNI_OnLoad_Weak`_

It's `JNI_OnLoad` seems to register several native functions in it's called functions with the one we are interested found within `init_asset_decompressor`.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/libsuperpack.so-init-asset-decompresso.png){: .shadow }_`libsuperpack.so` `init_asset_decompressor`_

The `init_asset_decompressor` function above contains the methods `FindClass` and `RegisterNatives` which follows a typical `registerNativeMethods` [example](https://android.googlesource.com/platform/development/+/master/samples/SimpleJNI/jni/native.cpp#46):

```cpp

// from platform/development/+/master/samples/SimpleJNI/jni/native.cpp

/*
 * Register several native methods for one class.
 */
static int registerNativeMethods(JNIEnv* env, const char* className,
    JNINativeMethod* gMethods, int numMethods)
{
    jclass clazz;
    clazz = env->FindClass(className);
    if (clazz == NULL) {
        ALOGE("Native registration unable to find class '%s'", className);
        return JNI_FALSE;
    }
    if (env->RegisterNatives(clazz, gMethods, numMethods) < 0) {
        ALOGE("RegisterNatives failed for '%s'", className);
        return JNI_FALSE;
    }
    return JNI_TRUE;
}
```


The *jadx* provided class `AssetDecompressor` from the package `com.facebook.superpack` clearly defines the natives methods.  `init_asset_decompressor` above registers the `decompress` functionality responsible for decompressing Superpacked "libs.spk.zst".

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-decompress.png){: .shadow }_jadx view of `AssetDecompressor` with several native method declarations_

#### WhatsApp Superpack `decompress` method

You can actually see the `decompress` function in Ghidra...

```cpp

// renamed from FUN_000343c4

jobjectArray
decompress(JNIEnv *param_1,jobject param_2,
	undefined4 param_3,undefined *param_4,jstring param_5, jstring param_6)

{
  int iVar1;
  char *pcVar2;
  int iVar3;
  FILE *__stream;
  char *chars;
  char *pcVar4;
  int **ppiVar5;
  jclass clazz;
  jstring val;
  int *piVar9;
  size_t sVar10;
  size_t sVar11;
  _func_405 *__s;
  char *pcVar12;
  _func_405 *p_Var13;
  jobjectArray array;
  jsize len;
  int local_28;
  
  local_30 = (undefined4 *)0x0;
  p_Var13 = (_func_405 *)param_4;
  iVar1 = AAssetManager_fromJava(param_1,param_3);
  if (iVar1 == 0) {
    pcVar2 = "could not get asset manager";
LAB_0003448c:
    FUN_0004c138((int *)param_1,"com/facebook/superpack/AssetDecompressionException",pcVar2,p_Var13)
    ;
    return (jobjectArray)0;
  }
  p_Var13 = (*param_1)->GetStringUTFChars;
  pcVar2 = (*p_Var13)(param_1,(jstring)param_4,(jboolean *)0x0);
  if (pcVar2 == (char *)0x0) {
    pcVar2 = "could not extract asset path";
    goto LAB_0003448c;
  }
  iVar1 = AAssetManager_open(iVar1,pcVar2,1);
  if (iVar1 == 0) {
    FUN_0004c138((int *)param_1,"com/facebook/superpack/AssetDecompressionException",
                 "could not access asset",p_Var13);
    pcVar4 = (char *)0x0;
    array = (jobjectArray)0x0;
    __stream = (FILE *)0x0;
    goto LAB_0003466a;
  }

 /* 
    Several lines omitted
    .
    .
    .
 */

FUN_0004c138((int *)param_1,"com/facebook/superpack/AssetDecompressionException",pcVar4,p_Var13);
  AAsset_close(iVar1);
  pcVar4 = (char *)0x0;
  array = (jobjectArray)0x0;
LAB_0003466a:
  (*(*param_1)->ReleaseStringUTFChars)(param_1,param_5,pcVar2);
  if (pcVar4 != (char *)0x0) {
    (*(*param_1)->ReleaseStringUTFChars)(param_1,param_5,pcVar4);
  }
  if (__stream != (FILE *)0x0) {
    fclose(__stream);
  }
  return array;
}

```

From the *jadx* decompiled Java code in the function we named `callNativeSuperpackDecompress` , we can actually see the native `decompress` function called with it's parameters.

```java
decompress = AssetDecompressor.decompress(context.getAssets(), obj, substring, file.getAbsolutePath());
```

OK. So this is how the decompression process works in WhatsApp. If we continue down this path we might be able to create a new app and load `libsuperpack.so`, find a reference to the compressed data in the [AssetManager](https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-13.0.0_r60/core/java/android/content/res/AssetManager.java#58), and call `decompress` for the files we need. Before we head all the way down that path we need to ask ourselves **if we are trying to hard if our goal is to simply extract files**. Also, after reviewing the extraction code, might the Superpack decompression implementation in Instagram, Messenger, or Facebook APKs vary slightly?

#### Quick Look at Facebook Messenger's Superpack

Yes... yes it would. 

Taking a quick look at Messenger [414.0.0.17.61](https://apkpure.com/facebook-messenger/com.facebook.orca/variant/414.0.0.17.61-APK) , it has a different Superpack shared library `libsuperpack-jni.so`. It has a similar `RegisterNative` equivalent function called `init_superpack_archive` which uses a different class `SuperpachArchive` within `com.facebook.superpack`.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/messenger-superpack-init.png){: .shadow }_Messenger's `libsuperpack-jni.so` `RegiterNatives` function`init_superpack_archive`_

The `SuperpachArchive` class seems a bit more complex, with no direct equivalent `decompress` function immediately apparent.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/jadx-messenger.png){: .shadow }_jadx view of `SuperpackFile` with several native method declarations_

As some of the other shared object libraries are available sitting besides `libsuperpack-jni.so` in its lib directory, maybe Messenger doesn't superpack its native libraries, but rather superpacks its Dex bytecode? 

## Desuperpacking Android Native ARM Libraries

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/android-containers2.jpg){: .shadow }_Android Superpack APKs_

Great, so there is this Superpack compression algorithm and we know a bit how it is initialized and have identified the native library responsible. We think we have even found the function that decompresses Superpacked files. We might be able to create a utility app to extract WhatsApp Superpacked files, but what about a general desuperpack utility?

> Presently, Superpack **is available only to our engineers**, but we aspire to bring the benefits of Superpack to everyone. To this end, we are exploring ways to improve the compatibility of our compression work with the Android ecosystem.

As I haven't seen any public tools to this end, and with the only reference to Superpack I found on Github was in Facebook's [Soloader](https://github.com/facebook/SoLoader) library, it doesn't seem quite worth it to build a custome extractor per app to simply get the native libaries I need.

### A Manual Approach

Taking a step back, knowing that Superpack is a "program that generates a program", and that Android can't load compressed libraries, we simply need to run the app. In order for `libwhatsapp.so` to be loaded properly it must be decompressed first. So, if we install the APK in an Android emulator, the files should exist somewhere.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/whatsapp-emulator.png){: width="972" height="589" .w-50 .shadow}_Install APK manual in Android Emulator_

This is exactly the case. After you install the APK the files we have long been searching for are available. 

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/decompressed-superpack.png){: .shadow}_Long lost native ARM shared libraries found_

**Well this post could have been a bit shorter.** Just install your Superpacked APK on an emulator and extract the files.

The files for WhatsApp are located at `/data/data/com.whatsapp/files/decompressed/libs.spk.zst/`. This manual approach works well when you only have a few files to recover, but it quickly becomes tedious if you have more than a few files to extract with several architectures to consider. Seems like we have a repetitive task that we might want to repeat over and over. Time to do what every developer does in this situation. Time to write a script!

### Automating with Github Actions

To begin automation let's review what the Android emulator is doing for us. When we drop an APK file into the emulator it [installs the APK](https://developer.android.com/studio/run/emulator-install-add-files). Immediately after installing I found new files in  `/data/data/com.whatsapp` but the decompressed shared objects weren't there yet.  They appeared only **after I ran the app** (aka running the app's [Main activity](https://developer.android.com/guide/components/activities/intro-activities#:~:text=Typically%2C%20one%20activity%20in%20an%20app%20is%20specified%20as%20the%20main%20activity%2C%20which%20is%20the%20first%20screen%20to%20appear%20when%20the%20user%20launches%20the%20app.) ). After that I just needed to copy out the files.

#### Workflow

The high level tasks then are:
- Install APK
- Launch the app (via it's Main activity)
- Extract the files

Installing an APK can be done via scripting by connecting to an Android device:

```bash
adb connect localhost:9999
* daemon not running; starting now at tcp:5037
* daemon started successfully
connected to localhost:9999

adb devices -l 
List of devices attached
localhost:9999         device product:redroid_x86_64 model:redroid12_x86_64 
```

Then running the install command:

```bash
adb -s localhost:9999 install --abi arm64-v8a "whatsapp.apk"
```

To launch an app's Main activity, you first need to figure out what it is. You can dump the "badging" information using *aadpt*. 

```bash
aapt dump badging "whatsapp.apk"       
package: name='com.whatsapp' versionCode='221670000' versionName='2.22.16.70' compileSdkVersion='31' compileSdkVersionCodename='12'
sdkVersion:'16'
targetSdkVersion:'31'
uses-permission: name='android.permission.READ_PHONE_STATE'
uses-permission: name='android.permission.READ_PHONE_NUMBERS'
uses-permission: name='android.permission.RECEIVE_SMS'
uses-permission: name='android.permission.VIBRATE'
uses-permission: name='android.permission.WRITE_EXTERNAL_STORAGE'
uses-permission: name='android.permission.WRITE_SYNC_SETTINGS'

# several lines ommitted

launchable-activity: name='com.whatsapp.Main'  label='WhatsApp' icon=''
densities: '120' '160' '240' '320' '480' '640' '65534' '65535'
native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'  
```

From the APK metadata found within, a start "Main Activity" command can be [created](https://github.com/clearbluejar/apk-install-extract/blob/main/adb-run.sh).

```bash
adb -s localhost:5555 shell am start -n com.whatsapp/com.whatsapp.Main
Starting: Intent { cmp=com.whatsapp/.Main }
```

From there we just need a method to extract the files.

Running *adb* command assumes you are able to connect to a device or emulator. This can be  solved by using a docker container called [reDroid](https://github.com/remote-android/redroid-doc) designed to run an emulator within continuous integration. This is perfect, nothing to setup or install.

```bash
docker run -itd --rm --privileged --pull always -v $(pwd)/data:/data -p 9999:5555 redroid/redroid:12.0.0-latest
```

Using docker I also solve the problem of extracting the files as we can map the `/data/data/<packagename>` path to our host while the emulator is running.

We can now script each step in our workflow. It is time to automate this in GitHub Actions. For this I create a new repo called [apk-install-extract](https://github.com/clearbluejar/apk-install-extract).

### GitHub Actions apk-install-extract

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/apk-install-extract.png){: .shadow }_apk-install-extract GitHub Repo_

Within the repo are some simple scripts that automate extraction of APK metadata that essentially we can run the above commands on a GitHub [runner](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners). The workflow is easiest to see in the[ yaml file](https://github.com/clearbluejar/apk-install-extract/actions/workflows/install-apk.yaml) itself. 

The first step is to [download and unzip](https://github.com/clearbluejar/apk-install-extract/blob/main/.github/workflows/install-apk.yaml#L26C1-L56) a pile of APKs.  I setup the workflow to essentially take a URL parameter as input. The URL should point to a zip file full of APKs that you want to extract.  Run the action "[Install Extract APK](https://github.com/clearbluejar/apk-install-extract/actions/workflows/install-apk.yaml)".

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/install-extract-apk-action.png){: .shadow }_Running Install Extract APK_

Once the workflow downloads the zip file, it then uses a [martrix strategy](https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs) to spin up a runner for each architecture (as an APK may contain 1 or more) and each *apkpath*:

```yaml
download-install-and-extract:
    needs: generate-matrix
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:        
        apkpath: ${fromJson(needs.generate-matrix.outputs.apkpaths)}
        arch: ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']
```

This causes 4 runners to run the entire script, one for each arch and APK provided.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/matric-android-extract-apk.png){: .shadow }_GitHub Action APK Artifacts_

For each architecture we run steps from the workflow above:

```yaml
- name: Run emulator
run: |
  mkdir data
  docker run -itd --rm --privileged --pull always -v $(pwd)/data:/data -p ${env.avd_port}:5555 redroid/redroid:12.0.0-latest          

- name: Download runner artifacts 
uses: actions/download-artifact@master
with:
  name: ${env.all_apk_dir}
  path: ${env.all_apk_dir}


- name: adb connect install
run: |                    
  adb connect ${env.avd_name}
  adb devices -l 
  adb -s ${env.avd_name} install --abi ${matrix.arch} "${matrix.apkpath}"
  
- name: adb start main activity
run: |                    
  # adb -s localhost:5555 shell am start -n com.whatsapp/com.whatsapp.Main          
  ./adb-run.sh "${matrix.apkpath}"
```


Which results in this:

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/workflow-main-download-extract-apk.png){: .shadow }_GitHub Actions Workflow Output_

After this part, the extracted files are bundled and uploaded as artifacts:

```yaml
- name: aapt dump badging
run: | 
  aapt dump badging "${matrix.apkpath}" >  ${ env.apkpkgver }/${ env.apkpkgver }.badging.txt         
  cat ${ env.apkpkgver }/${ env.apkpkgver }.badging.txt

- name: fix data permissions
if: always()
run: | 
  # stop docker containers
  docker stop $(docker ps -a -q)
  sudo chown -R runner:runner data
- name: compress archive data
run: |
  mv data data-${ env.apkpkgver }-${matrix.arch} 
  tar cvzf ${ env.apkpkgver }/${ env.apkpkgver }.${matrix.arch}.data.tar.gz data-${ env.apkpkgver }-${matrix.arch}/data/${ env.apkpkg }

- name: Upload data
uses: actions/upload-artifact@v3
if: always()
with:
  name: all_package_data
  path: ${ env.apkpkgver }
  retention-days: 25
```


![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/install-extract-apk-artifacts.png){: .shadow }_GitHub Actions APK Artifacts_

Resulting artifacts:

- *all_apks* - contains a copy of the original APKs provided
- *all_data* - contains the entire `/data/data` directory from the emulator
- *all_package_data* - contains the specific package extracted files and metadata

**Boom**. We have automated extracting files from Superpacked (and ordinary) APKs.

![](/assets/img/2023-06-30-desuperpacking-meta-superpacked-apks-with-github-actions/apk-install-workflow-results.png){: .shadow }_`all_package_data` files extracted_

## Automation Complete

Nice work making it this far. Hope you learned a bit about Android native libraries, Superpack compression, and Github Actions. This is my first post focusing on Andoird, if I have missed some key components leave some [feedback](https://github.com/clearbluejar/clearbluejar.github.io/issues) or send a DM.

If you would like to "desuperpack" some of your own APKs go ahead and fork [apk-install-extract](https://github.com/clearbluejar/apk-install-extract) and feed it your own bundle of zipped APKs. The workflow has room for improvement, and feel free to share back a PR with any improvements.

<sub>Cover Photo from [pexels](https://www.pexels.com/photo/top-view-of-an-illuminated-port-and-a-container-ship-16196626/) </sub>