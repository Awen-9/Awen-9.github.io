---
title: "在 Windows 和 macOS 上启动博客"
description: "装 Node 和 Git、拉代码、装依赖、启动，以及 Windows 上要注意的几件事。"
date: 2026-10-27T11:00:00+08:00
category: "博客搭建"
tags: ["Astro", "Windows", "教程"]
series: "博客使用手册"
---

这个博客的源码在 Windows 和 macOS 上都能跑。两边要装的东西一样，都是 Node.js 和 Git，装好以后的命令也完全相同。下面的命令在 macOS 的"终端"和 Windows 的 PowerShell 里都能直接用。

## 1. 安装 Node.js 和 Git

Node.js 需要 22.23 或更新的版本。

**macOS**

1. 安装 Homebrew，已经装过可以跳过：在"终端"里运行 https://brew.sh 首页上的那行安装命令。
2. 安装 Node 和 Git：`brew install node git`。
3. 检查版本：`node -v` 应该显示 v22.23 或更高，`git --version` 能显示版本号就行。

不想用 Homebrew 的话，也可以到 https://nodejs.org 下载 LTS 版的 .pkg 安装包。

**Windows**

1. 到 https://nodejs.org 下载 LTS 版的 .msi 安装包，一路默认安装。
2. 到 https://git-scm.com/download/win 下载 Git，一路默认安装。
3. 关掉已经打开的 PowerShell 窗口再重新打开，这样才能用上新装的命令。然后检查：`node -v`、`git --version`。

## 2. 拿到代码

代码推送到 GitHub 以后，在想放代码的目录里运行：

```bash
git clone https://github.com/awen-9/awen-9.github.io.git
cd awen-9.github.io
```

Windows 上建议放在路径短一点的地方，比如 `D:\blog`，不要放进很深的目录，依赖里有些文件路径本来就长。

文章文件名都是中文，`git status` 默认会把中文显示成 `\346\226\207` 这样的转义码。运行一次下面这行，两个系统上都能正常显示中文：

```bash
git config --global core.quotepath false
```

## 3. 安装依赖

```bash
npm ci
```

`npm ci` 按 `package-lock.json` 安装，装出来的版本和 GitHub 上发布时用的一样。Windows 和 macOS 各自需要的编译工具，`package-lock.json` 里都写了，自动装对应系统的版本。

`package-lock.json` 里记的下载地址是公司内网的 npm 源。电脑连不上内网时，`npm ci` 会卡住或报 `ETIMEDOUT`，改用下面这行，从官方源下载，和 GitHub Actions 上的做法一样：

```bash
npm ci --registry=https://registry.npmjs.org/ --replace-registry-host=always
```

## 4. 启动

```bash
npm run dev       # 打开 http://localhost:4321 ，改文件后页面自动刷新
npm run build     # 构建到 dist/ 目录
npm run preview   # 预览构建结果
```

`npm run dev` 会一直占着这个窗口，按 Ctrl C 停止。如果 4321 端口被别的程序占了，Astro 会自动换成 4322 之类的端口，以终端里打印出来的地址为准。

写文章的步骤见[《写一篇新文章》](/2026/10/27/写一篇新文章/)。

## Windows 上要注意的

**PowerShell 提示"禁止运行脚本"。** 第一次在 PowerShell 里运行 `npm` 时，可能看到"无法加载文件 npm.ps1，因为在此系统上禁止运行脚本"。这是 Windows 默认的安全设置，运行一次下面这行，允许运行本机的脚本，以后就不会再出现：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

不想改设置的话，用"命令提示符"（cmd）代替 PowerShell 也可以。

**不要直接拷 `node_modules`。** 从 Mac 上把整个文件夹复制到 Windows 时，跳过 `node_modules`、`dist`、`.astro` 这三个文件夹，到 Windows 上重新 `npm ci`。`node_modules` 里有按系统编译好的程序，Mac 上装的版本在 Windows 上跑不起来。

**换行符不用管。** Windows 版 Git 默认在下载代码时把换行符换成 Windows 的格式，推送时再换回来。这不影响构建：把全部源码转成 Windows 换行符后构建过一次，55 个页面都正常，目录和标题链接也没有问题。

**文件用 UTF-8 保存。** 文章里都是中文，编辑器要用 UTF-8 编码保存。VS Code 和新版 Windows 记事本默认就是 UTF-8。如果用的是其他编辑器，保存后页面出现乱码，就检查一下编码。

**搜索快捷键是 Ctrl K。** 页面上的提示会根据系统自动显示成 ⌘K 或 Ctrl K。

## 常见问题

**`node -v` 提示找不到命令。** 安装完 Node 以后要重新打开终端或 PowerShell。还不行的话，Windows 上重启一次电脑。

**`npm ci` 报版本不支持或者语法错误。** 多半是 Node 版本太旧，用 `node -v` 看一下，低于 v22.23 就重新装 LTS 版。

**`npm ci` 报 `EPERM` 或者文件被占用（Windows）。** 先停掉正在运行的 `npm run dev`，关掉打开了项目文件夹的编辑器终端，再重新运行。杀毒软件扫描 `node_modules` 也可能造成这个问题，等它扫完再试。
