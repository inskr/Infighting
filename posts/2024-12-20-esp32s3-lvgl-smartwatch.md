---
id: esp32s3-lvgl-smartwatch
title: 在 ESP32-S3 上用 LVGL 构建流畅的智能手表 UI
date: 2024-12-20
tags: [ESP32, LVGL, 物联网]
summary: 基于 ESP32-S3 的智能手表项目复盘：LVGL 图形库移植、事件驱动的界面导航架构、WiFi 数据通道，以及针对内存瓶颈的字体与图片资源优化技巧。
---

这是我大三上学期的项目：一块基于 ESP32-S3 的多功能智能手表，支持数字时钟、消息通知、天气显示。本文复盘其中最有价值的几个技术决策。

## 为什么是 LVGL

 ESP32-S3 没有强大的 GPU，但 LVGL（Light and Versatile Graphics Library）在 MCU 上的表现足够好：

- 纯 C 编写，移植只需要实现一个 flush 回调
- 自带事件系统、动画引擎、样式系统
- 支持部分刷新，降低 SPI 屏幕的带宽压力

移植核心代码：

```c
static void disp_flush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *color_map)
{
    st7789_push_pixels(area->x1, area->y1, area->x2, area->y2, (uint16_t *)color_map);
    lv_disp_flush_ready(drv);  // 必须调用，否则 LVGL 卡死
}

void lvgl_port_init(void)
{
    lv_init();
    static lv_disp_draw_buf_t draw_buf;
    static lv_color_t buf[240 * 40];  // 40 行缓冲区，约 19KB
    lv_disp_draw_buf_init(&draw_buf, buf, NULL, 240 * 40);

    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);
    disp_drv.draw_buf = &draw_buf;
    disp_drv.flush_cb = disp_flush;
    disp_drv.hor_res = 240;
    disp_drv.ver_res = 240;
    lv_disp_drv_register(&disp_drv);
}
```

## 事件驱动的界面导航

手表有多个界面（表盘、通知、天气、设置），用裸 if-else 管理会迅速失控。我设计了一个简单的页面栈：

```c
typedef struct {
    void (*create)(lv_obj_t *parent);
    void (*destroy)(void);
} page_ops_t;

static const page_ops_t *page_stack[8];
static int stack_top = -1;

void page_push(const page_ops_t *page)
{
    if (stack_top >= 0) page_stack[stack_top]->destroy();
    page_stack[++stack_top] = page;
    page->create(lv_scr_act());
}

void page_pop(void)
{
    if (stack_top <= 0) return;
    page_stack[stack_top--]->destroy();
    page_stack[stack_top]->create(lv_scr_act());
}
```

配合 LVGL 的手势事件，左右滑动切换页面、下滑返回，导航逻辑非常清晰。

## 内存优化：最痛的一课

ESP32-S3 的 SRAM 只有 512KB，中文全字库根本放不下。优化手段：

1. **字体裁剪**：用 LVGL 官方的 font converter，只导出界面实际用到的 200 多个汉字，从 2MB 压到 60KB
2. **图片转 C 数组 + RLE 压缩**：天气图标用 `LV_IMG_CF_TRUE_COLOR_CHROMA_KEYED`，体积减半
3. **图片放 Flash**：所有静态资源声明为 `const`，链接到外部 Flash，不占 RAM

```c
// 只包含用到的字符
lv_font_t my_font_cn = {
    .unicode_first = 0x4E00, .unicode_last = 0x9FA5,
    // 通过 range + glyph_id 映射裁剪后的字形
};
```

## WiFi 数据通道

手表通过 WiFi 连接上位机，接收消息通知和天气数据，协议用简单的 JSON over TCP：

```json
{"type": "weather", "temp": 26, "icon": "sunny", "city": "太原"}
```

接收任务用 FreeRTOS 独立任务运行（ESP-IDF 环境），收到数据后通过 `lv_port_sem` 保护地更新 UI。

## 总结

这个项目让我深刻理解：**资源受限环境下的 UI 开发，本质上是一场内存与性能的权衡艺术**。LVGL 的事件驱动架构值得学习，这套页面栈模式后来也被我用到了其他项目中。
