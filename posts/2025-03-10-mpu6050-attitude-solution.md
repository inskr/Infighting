---
id: mpu6050-attitude-solution
title: MPU6050 姿态解算：四元数与卡尔曼滤波实战
date: 2025-03-10
tags: [STM32, 传感器, 姿态解算]
summary: 从 I2C 原始数据到稳定的欧拉角输出：介绍 MPU6050 数据读取、四元数姿态更新、卡尔曼滤波降噪的完整链路，最终实现姿态角误差小于 ±1.5°。
---

姿态解算是飞控的核心。本文记录我在四轴无人机项目中，基于 MPU6050 六轴传感器实现姿态角解算的完整过程，最终姿态角误差稳定在 **±1.5° 以内**。

## 硬件链路

MPU6050 通过 I2C 与 STM32F103 通信，挂载在 I2C1（PB6/PB7），地址 `0x68`。上电后先做三件事：

```c
void mpu6050_init(void)
{
    mpu_write_reg(0x6B, 0x00);  // 解除睡眠
    mpu_write_reg(0x1B, 0x18);  // 陀螺仪量程 ±2000°/s
    mpu_write_reg(0x1C, 0x08);  // 加速度计量程 ±4g
    mpu_write_reg(0x1A, 0x03);  // DLPF 低通滤波 44Hz
}
```

> **踩坑记录**：DLPF 带宽设太高会把电机振动噪声直接放进来，设太低又会引入相位延迟。44Hz 是悬停稳定性与响应速度之间比较平衡的点。

## 四元数姿态更新

直接用欧拉角积分会遇到万向锁，所以采用四元数表示姿态。每次采样后用一阶龙格库塔法更新四元数：

```c
void quaternion_update(quat_t *q, float gx, float gy, float gz, float dt)
{
    float q0 = q->q0, q1 = q->q1, q2 = q->q2, q3 = q->q3;

    float dq0 = 0.5f * (-q1 * gx - q2 * gy - q3 * gz) * dt;
    float dq1 = 0.5f * ( q0 * gx + q2 * gz - q3 * gy) * dt;
    float dq2 = 0.5f * ( q0 * gy - q1 * gz + q3 * gx) * dt;
    float dq3 = 0.5f * ( q0 * gz + q1 * gy - q2 * gx) * dt;

    q->q0 += dq0; q->q1 += dq1;
    q->q2 += dq2; q->q3 += dq3;

    quat_normalize(q);  // 必须归一化，否则误差累积发散
}
```

陀螺仪零偏校准放在上电静止阶段，采集 500 帧取平均：

```c
static float gyro_bias[3] = {0};

void gyro_calibrate(void)
{
    int16_t raw[3];
    for (int i = 0; i < 500; i++) {
        mpu_read_gyro_raw(raw);
        for (int j = 0; j < 3; j++) gyro_bias[j] += raw[j];
        delay_ms(2);
    }
    for (int j = 0; j < 3; j++) gyro_bias[j] /= 500.0f;
}
```

## 卡尔曼滤波降噪

单纯积分会漂移，需要用加速度计做观测修正。对每个姿态角建立一维卡尔曼滤波器：

```c
float kalman_update(kalman_t *kf, float angle_measured, float gyro_rate, float dt)
{
    // 预测
    kf->angle += (gyro_rate - kf->bias) * dt;
    kf->P[0][0] += dt * (dt * kf->P[1][1] - kf->P[0][1] - kf->P[1][0] + kf->Q_angle);
    kf->P[0][1] -= dt * kf->P[1][1];
    kf->P[1][0] -= dt * kf->P[1][1];
    kf->P[1][1] += kf->Q_bias * dt;

    // 更新
    float S = kf->P[0][0] + kf->R_measure;
    float K0 = kf->P[0][0] / S;
    float K1 = kf->P[1][0] / S;
    float y = angle_measured - kf->angle;

    kf->angle += K0 * y;
    kf->bias  += K1 * y;
    // ... P 矩阵更新略
    return kf->angle;
}
```

调参经验：`Q_angle` 控制对陀螺仪的信任度，`R_measure` 控制对加速度计的信任度。振动大的机架需要适当增大 `R_measure`。

## 效果

- 静态漂移：< 0.1°/min
- 动态误差：< ±1.5°（剧烈机动时）
- 更新频率：500Hz

下篇文章会讲基于这个姿态数据的双环 PID 控制器设计。
