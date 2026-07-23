---
id: pid-control-practice
title: PID 控制从入门到进阶：位置式与增量式的取舍
date: 2024-08-12
tags: [控制算法, 飞控, PID]
summary: 从公式到代码：对比位置式与增量式 PID 的实现差异，介绍双环串级控制（角度环+角速度环）在四轴无人机悬停稳定性中的应用与调参方法论。
---

PID 是嵌入式控制里"最简单也最困难"的算法——公式三行就能写完，调参能调一个月。本文结合四轴无人机项目，把 PID 的理论、实现与调参串一遍。

## 两种实现形式

### 位置式 PID

输出直接是控制量的绝对值：

```c
float pid_positional(pid_t *pid, float setpoint, float measured, float dt)
{
    float error = setpoint - measured;

    pid->integral += error * dt;
    pid->integral = clamp(pid->integral, -pid->i_max, pid->i_max);  // 抗积分饱和

    float derivative = (error - pid->prev_error) / dt;
    pid->prev_error = error;

    return pid->kp * error + pid->ki * pid->integral + pid->kd * derivative;
}
```

### 增量式 PID

输出是控制量的增量，适合电机类执行器：

```c
float pid_incremental(pid_t *pid, float setpoint, float measured)
{
    float error = setpoint - measured;

    float delta = pid->kp * (error - pid->prev_error)
                + pid->ki * error
                + pid->kd * (error - 2 * pid->prev_error + pid->prev_prev_error);

    pid->prev_prev_error = pid->prev_error;
    pid->prev_error = error;
    return delta;
}
```

**怎么选**：

- 位置式：输出直观，限幅简单，适合阀门、舵机、温度控制
- 增量式：积分天然有界，手动/自动切换无扰，适合电机调速
- 飞控中我用的是**位置式 + 积分限幅**，因为电机需要的是绝对油门值

## 串级双环：飞控的正确打开方式

单环 PID 直接控角度，响应慢且容易振荡。工业和飞控的标准做法是**串级控制**：

```
角度设定 → [角度环 PID] → 角速度设定 → [角速度环 PID] → 电机输出
              (外环, 慢)                    (内环, 快)
```

- **外环（角度环）**：输入期望角度与实际角度的误差，输出期望角速度，100-250Hz
- **内环（角速度环）**：跟踪期望角速度，直接输出电机控制量，500Hz

```c
void control_update(attitude_t *att, rc_cmd_t *rc, float dt)
{
    // 外环：角度误差 → 期望角速度
    float roll_rate_sp  = pid_positional(&pid_angle_roll,
                          rc->roll_angle, att->roll, dt);
    float pitch_rate_sp = pid_positional(&pid_angle_pitch,
                          rc->pitch_angle, att->pitch, dt);

    // 内环：角速度误差 → 电机控制量
    float roll_out  = pid_positional(&pid_rate_roll,
                      roll_rate_sp, att->gyro_x, dt);
    float pitch_out = pid_positional(&pid_rate_pitch,
                      pitch_rate_sp, att->gyro_y, dt);

    motor_mix(rc->throttle, roll_out, pitch_out, 0);
}
```

内环用陀螺仪直接测得的角速度，响应快、抗扰强；外环保证角度精度。这是悬停稳定的关键。

## 调参方法论

我的调参顺序（内环优先）：

1. **内环 P**：逐渐增大直到机身开始高频振荡，回退到 60%
2. **内环 D**：抑制振荡余波，注意 D 会放大陀螺仪噪声，噪声大时先滤波
3. **内环 I**：消除静差（如重心偏移导致的持续倾斜），宁小勿大
4. **外环 P**：只用一个 P 通常就够，决定角度跟踪的"刚度"

> **经验之谈**：90% 的"PID 调不好"其实是机械问题——机架松动、电机不一致、传感器振动。先检查硬件，再怀疑参数。

## 常见坑

- **积分饱和**：大机动后回正过冲严重 → 加积分限幅或条件积分
- **微分噪声**：D 项直接对角度微分会把传感器噪声放大 → 对测量值微分（微分先行）或加低通滤波
- **dt 不稳定**：用变量 dt 而不是写死，调度抖动会直接影响 I/D 项

PID 本身只是起点，后续可以探索 LQR、ADRC，但先把这套经典串级玩透，手感就建立起来了。
