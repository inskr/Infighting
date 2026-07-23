---
id: stm32-baremetal-scheduler
title: STM32 裸机多任务调度框架设计与实践
date: 2025-04-18
tags: [STM32, 裸机开发, 任务调度]
summary: 在四轴无人机飞控项目中，没有 RTOS 的裸机环境如何组织多任务？本文介绍一个基于时间片轮询的轻量级调度框架，涵盖任务表设计、SysTick 时基与负载评估。
---

在四轴无人机飞控项目中，我选择基于 STM32F103 裸机开发，而不是直接上 FreeRTOS。原因有两个：一是飞控任务数量少且实时性要求明确，裸机调度足够；二是想彻底搞清楚"操作系统到底在干什么"。

## 为什么需要调度框架

裸机开发最常见的问题是 `while(1)` 大循环里堆满各种功能：传感器采集、姿态解算、PID 控制、无线通信……一旦某个任务耗时变长，其他任务全部被阻塞，飞控直接失控。

一个最小可用的调度框架需要解决三件事：

1. **任务按固定周期执行**（如姿态解算 500Hz、遥控解析 50Hz）
2. **任务之间互不阻塞**（单个任务超时可以被检出）
3. **CPU 负载可观测**（知道还剩多少余量）

## 任务表设计

核心思路是"函数指针 + 周期计数"，用结构体数组描述所有任务：

```c
typedef struct {
    void (*task_func)(void);  // 任务入口
    uint32_t period_ms;       // 执行周期
    uint32_t last_run;        // 上次执行时刻
    uint32_t max_cost_us;     // 历史最大耗时
    const char *name;         // 任务名（调试用）
} task_t;

static task_t task_table[] = {
    { task_attitude_update,  2,  0, 0, "attitude"  },  // 500Hz 姿态解算
    { task_pid_control,      2,  0, 0, "pid"       },  // 500Hz 控制输出
    { task_nrf24_receive,   20,  0, 0, "nrf24"     },  // 50Hz  遥控接收
    { task_battery_check,  100,  0, 0, "battery"   },  // 10Hz  电压检测
    { task_led_heartbeat,  500,  0, 0, "led"       },  // 2Hz   心跳灯
};

#define TASK_NUM (sizeof(task_table) / sizeof(task_t))
```

## 调度循环与耗时统计

主循环遍历任务表，到期的任务立即执行，并用 DWT 周期计数器统计耗时：

```c
void scheduler_run(void)
{
    for (uint8_t i = 0; i < TASK_NUM; i++) {
        uint32_t now = HAL_GetTick();
        if (now - task_table[i].last_run >= task_table[i].period_ms) {
            task_table[i].last_run = now;

            uint32_t start = DWT->CYCCNT;
            task_table[i].task_func();
            uint32_t cost = (DWT->CYCCNT - start) / (SystemCoreClock / 1000000U);

            if (cost > task_table[i].max_cost_us) {
                task_table[i].max_cost_us = cost;  // 记录最差情况
            }
        }
    }
}
```

使用 DWT 前需要在初始化中使能：

```c
void dwt_init(void)
{
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CYCCNT = 0;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
}
```

## 实测数据与结论

在 72MHz 的 STM32F103 上实测：

| 任务 | 周期 | 平均耗时 | 最大耗时 |
|------|------|---------|---------|
| 姿态解算（含四元数更新） | 2ms | 180μs | 240μs |
| 双环 PID | 2ms | 45μs | 60μs |
| NRF24L01 接收解析 | 20ms | 90μs | 150μs |

总负载约 15%，余量充足。**关键经验**：周期任务的单次耗时必须远小于周期，否则要考虑拆分状态机或上 RTOS。这套框架后来也被我复用到了智能手表项目中，配合 LVGL 的 `lv_timer_handler` 一起工作得很好。
