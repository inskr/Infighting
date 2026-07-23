---
id: nrf24l01-low-latency-protocol
title: NRF24L01 2.4GHz 低延迟通信协议设计笔记
date: 2024-10-15
tags: [无线通信, STM32, 飞控]
summary: 遥控器与飞控之间的通信既要低延迟又要可靠：本文介绍基于 NRF24L01 的自定帧格式、ACK 重传策略、通道跳频与 PID 参数动态下调节点的设计。
---

四轴无人机的遥控链路如果延迟大、丢包高，飞得再稳的 PID 也救不回来。本文记录我基于 NRF24L01 设计的 2.4GHz 通信协议。

## 硬件与基础配置

NRF24L01 通过 SPI 与 STM32 连接，关键初始化参数：

```c
void nrf24_init(void)
{
    nrf_write_reg(NRF_REG_SETUP_AW,   0x03);   // 5 字节地址
    nrf_write_reg(NRF_REG_SETUP_RETR, 0x1F);   // 重传 500μs，最多 15 次
    nrf_write_reg(NRF_REG_RF_CH,      40);     // 2.440GHz 信道
    nrf_write_reg(NRF_REG_RF_SETUP,   0x0F);   // 2Mbps，0dBm 发射功率
    nrf_write_reg(NRF_REG_CONFIG,     0x0E);   // CRC 16bit，使能接收中断
}
```

> **为什么选 2Mbps**：空中速率越高，单包占用时间越短，被 WiFi 干扰碰撞的概率越低，实测 2Mbps 下遥控延迟约 8ms。

## 自定义帧格式

一包 32 字节（NRF24L01 最大有效载荷），布局如下：

| 偏移 | 字段 | 长度 | 说明 |
|------|------|------|------|
| 0 | 帧头 | 1B | 固定 `0xA5` |
| 1 | 类型 | 1B | 0x01=遥控，0x02=PID 调参 |
| 2-9 | 通道数据 | 8B | 4 通道 × uint16（油门/横滚/俯仰/偏航） |
| 10-28 | 扩展数据 | 19B | PID 参数或预留 |
| 29 | 序号 | 1B | 丢包统计 |
| 30-31 | CRC16 | 2B | 校验 |

解析代码：

```c
typedef struct __attribute__((packed)) {
    uint8_t  header;      // 0xA5
    uint8_t  type;
    uint16_t ch[4];       // 四通道
    uint8_t  payload[19];
    uint8_t  seq;
    uint16_t crc16;
} radio_frame_t;

bool radio_parse(const uint8_t *buf, radio_frame_t *frame)
{
    memcpy(frame, buf, sizeof(radio_frame_t));
    if (frame->header != 0xA5) return false;
    return crc16_calc((uint8_t *)frame, 30) == frame->crc16;
}
```

注意 `__attribute__((packed))` 防止结构体对齐填充导致帧布局错乱。

## PID 参数动态调节

调试期最痛苦的是每改一次 PID 都要重新烧录。我在协议里加了调参帧：上位机下发 `0x02` 类型帧，飞控在线更新参数并回传确认：

```c
void handle_tune_frame(const radio_frame_t *f)
{
    float kp, ki, kd;
    memcpy(&kp, &f->payload[0], 4);
    memcpy(&ki, &f->payload[4], 4);
    memcpy(&kd, &f->payload[8], 4);
    pid_set_gains(&pid_roll, kp, ki, kd);
    radio_send_ack(f->seq);  // 回传确认
}
```

配合地面站实时曲线，悬停调试效率提升了至少 5 倍。

## 抗干扰与失控保护

- **序号检测**：连续丢包 10 帧（约 200ms）判定失控，油门渐变到 0 并尝试降落
- **跳频预留**：固定信道受干扰严重时，可按约定序列切换 `RF_CH`
- **接收中断**：用 IRQ 引脚触发 EXTI，避免轮询浪费 SPI 带宽

## 实测

- 端到端延迟：约 8ms（含飞控解析）
- 开阔地距离：> 200m（0dBm + PCB 天线）
- 失控保护触发到安全降落：< 3s

这套协议结构简单但够用，后续如果要上 MAVLink，帧解析层可以直接替换。
