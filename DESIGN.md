---
name: Cache Lens
description: 把缓存成本变成可读光学仪表的整体 Liquid Glass 设计系统
colors:
  cache-teal: "#087f79"
  cache-teal-bright: "#13b5aa"
  cache-teal-deep: "#055f5b"
  cache-mist: "#d8f1ee"
  optical-sky: "#eaf0f7"
  midnight-field: "#09131f"
  light-ink: "#0b1728"
  dark-ink: "#dce7f3"
  light-muted: "#60728a"
  dark-muted: "#8fa1b7"
typography:
  display:
    fontFamily: "ui-rounded, SF Pro Rounded, SF Pro Display, -apple-system, PingFang SC, sans-serif"
    fontSize: "clamp(42px, 5vw, 62px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, PingFang SC, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, PingFang SC, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  control: "12px"
  card: "16px"
  header: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.cache-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    height: "44px"
  input:
    backgroundColor: "rgba(255, 255, 255, 0.36)"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    padding: "11px 14px"
  card:
    backgroundColor: "rgba(249, 251, 254, 0.72)"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.card}"
    padding: "20px 22px"
---

# Design System: Cache Lens

## Overview

**Creative North Star: "The Cache Lens / 缓存折射镜"**

Cache Lens 把中转站倍率、缓存命中率和真实成本看成同一台光学仪表中的不同读数。整体界面处在一幅低频率的冰蓝光场中，玻璃不是贴上去的装饰气泡，而是导航、控制和实时结果之间连续的折射层级。

高密度表单使用稳定、克制的半透明阅读材质；实时结果、模式切换和主操作使用更清透的功能玻璃。视觉效果永远服务于数值理解，不改变计费口径，也不压低文本对比度。

**Key Characteristics:**

- 单幅连续光场，青绿色数据墨水，极少量紫蓝色边缘色散。
- 功能玻璃用于导航与操作，稳定玻璃用于表单与说明。
- 缓存命中率使用横向折射轨表达，不使用漂浮白色胶囊或气泡。
- 明暗主题共用同一层级，支持减少动态和减少透明度。

## Colors

颜色来自冷静的运算环境：青绿负责可操作状态和关键数字，紫蓝只用于玻璃边缘的光学色散，中性色承担长时间阅读。

### Primary

- **缓存青绿**：主操作、实时结果、焦点和缓存轨迹；面积保持克制。
- **深海青绿**：浅色主题下的悬停、链接和高对比数据。

### Secondary

- **色散紫蓝**：仅作为玻璃边缘和结果镜片的折射提示，不作为第二套主品牌色。

### Neutral

- **光学雾蓝**：浅色背景与大尺度环境光场。
- **午夜光场**：深色主题背景，保持蓝黑而非纯黑。
- **运算墨色**：浅色主题主文字。
- **霜白文字**：深色主题主文字。

**The One Accent Rule.** 青绿色是唯一交互强调色；紫蓝只能表现折射，不能与青绿色争夺操作优先级。

## Typography

**Display Font:** 系统圆体与 SF Pro Display 回退栈  
**Body Font:** 系统 UI 字体与 PingFang SC 回退栈  
**Label/Mono Font:** JetBrains Mono，仅用于数值、倍率和公式

**Character:** 文本保持原生、清楚、熟悉；大数值略带仪表感，公式使用等宽字体稳定列宽。界面不依赖外部网络字体完成关键阅读。

### Hierarchy

- **Display**（700，响应式 42–62px，1.0）：实时成本和预算 token 结论。
- **Headline**（约 700，22px）：产品名称，仅出现在顶栏。
- **Title**（700，18px，1.35）：步骤卡和主要分区标题。
- **Body**（400，15px，1.5）：说明、状态和表单帮助，尽量不超过 72ch。
- **Label/Data**（600，12–13px）：字段标签、倍率、价格和公式。

**The Data Voice Rule.** 等宽字体只为数字关系服务，不用于普通段落或导航。

## Layout

桌面端使用最大 1440px 容器和 28px 外侧留白；设置区与结果区形成左右工作台，左右内容共用唯一的页面滚动，不设置结果区内部滚动。1180px 以下顶栏动作允许换行，1080px 以下转为单列，720px 以下进一步压缩卡片，560px 以下使用 10px 页面边距与底部实时摘要。所有模式必须保持零横向滚动和零嵌套纵向滚动。

间距遵循 4、8、16、24、28px 的紧凑节奏。界面密度偏工具型，但标题、字段和结果之间要有稳定分组，不用大面积空白制造“高级感”。

## Elevation & Depth

系统使用环境光、透明度、背景模糊和内侧高光共同表达深度。大部分内容卡仅使用低幅环境阴影；顶栏、模式控制和结果镜片使用更强的玻璃阴影。悬停只轻微抬升，避免玻璃件像独立漂浮气泡。

### Shadow Vocabulary

- **阅读层**：低扩散阴影加一像素内高光，用于表单和数据卡。
- **功能玻璃层**：更宽的环境阴影和清晰折射边缘，用于顶栏、分段控件和结果。
- **交互抬升**：仅在悬停与主操作出现，位移不超过 1px。

**The Continuous Field Rule.** 深度必须看起来来自同一光场中的折射层级，而不是许多互不相关的发光组件。

## Shapes

内容卡使用克制的 16px 圆角，输入控件使用 12px 圆角，顶部功能镜片使用 28px 圆角，紧凑切换器和状态标签可使用完整胶囊形。圆角必须与组件尺度匹配；禁止把随机白色圆角矩形当作液体或缓存粒子。

玻璃边缘由一像素半透明描边、顶部高光和少量青紫色散构成。结果卡右下角允许一条大尺度镜片高光，但不能覆盖文字。

## Components

### Buttons

- **Shape:** 44px 最小高度的完整胶囊轮廓。
- **Primary:** 深青绿折射渐变、白色文字、10px × 18px 内边距。
- **Hover / Focus:** 轻微抬升；焦点使用清晰青绿双层焦点环。
- **Ghost:** 使用清透玻璃而非纯白底。

### Chips

- **Style:** 仅承载价格快照、模式或来源等短元数据；低对比底色、一像素边缘。
- **State:** 选中态使用青绿色文字与内高光，不使用实心亮色大块。

### Cards / Containers

- **Corner Style:** 阅读卡 16px，功能顶栏 28px。
- **Background:** 半透明冷白或蓝黑材质，保证文本区域稳定。
- **Shadow Strategy:** 阅读层克制，只有结果镜片与顶栏使用功能玻璃层。
- **Internal Padding:** 16–24px，手机端收紧到 16–17px。

### Inputs / Fields

- **Style:** 稳定透明底、一像素描边、12px 圆角；手机字号不得低于 16px。
- **Focus:** 青绿描边加外层低透明焦点环。
- **Error / Disabled:** 错误使用语义红色；禁用态保留可读文字并降低材质亮度。

### Navigation

顶栏把品牌、模式、主题与操作组织在同一块功能玻璃中。桌面端保持横向仪表台，手机端按“模式—计算方式—主题—操作”分行，不隐藏任何模式。

### Result Lens

结果镜片优先显示“每 1M 成本”或预算 token 结论；缓存命中率由一条青绿到紫蓝的折射轨显示，轨道宽度直接映射百分比。下方公式和等效倍率始终保留文本解释，颜色不是唯一信息载体。

## Do's and Don'ts

### Do:

- **Do** 把玻璃用于层级和操作反馈，并为密集数据提供稳定阅读底。
- **Do** 使用单幅大尺度光场和连续边缘高光制造液态感。
- **Do** 在明暗主题、390px 手机宽度、减少动态和高对比偏好下验证每次新增界面。
- **Do** 保持焦点可见、正文可读、核心结果不依赖透明度单独传达。

### Don't:

- **Don't** 使用漂浮白色圆角矩形、随机气泡、药丸碎片或重复小光斑冒充 Liquid Glass。
- **Don't** 在每张内容卡上叠加同等级强模糊、发光和阴影。
- **Don't** 用紫色主按钮或常见 AI 紫粉渐变破坏缓存青绿的唯一强调色规则。
- **Don't** 让折射、动画或装饰遮挡数值、字段标签和安全说明。
