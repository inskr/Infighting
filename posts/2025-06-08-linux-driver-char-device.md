---
id: linux-driver-char-device
title: 嵌入式 Linux 驱动开发入门：从字符设备到设备树
date: 2025-06-08
tags: [嵌入式Linux, RK3588, 驱动开发]
summary: 以 RK3588 开发板为例，梳理 Linux 字符设备驱动的骨架：file_operations、自动创建设备节点、设备树匹配与 GPIO 资源获取，附完整可编译示例。
---

最近在学 RK3588 平台的 Linux 驱动开发。相比单片机直接操作寄存器，Linux 驱动多了一层"规矩"，但这层规矩让硬件管理变得可维护。本文用最小例子走通字符设备全流程。

## 最小字符设备骨架

```c
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/device.h>

#define DEV_NAME "myedge_dev"

static int major;
static struct class *my_class;
static struct cdev my_cdev;

static int my_open(struct inode *inode, struct file *filp)
{
    pr_info("myedge: device opened\n");
    return 0;
}

static ssize_t my_read(struct file *filp, char __user *buf,
                       size_t count, loff_t *ppos)
{
    char msg[] = "hello from kernel\n";
    return simple_read_from_buffer(buf, count, ppos, msg, sizeof(msg));
}

static struct file_operations fops = {
    .owner = THIS_MODULE,
    .open  = my_open,
    .read  = my_read,
};

static int __init my_init(void)
{
    dev_t devno;
    alloc_chrdev_region(&devno, 0, 1, DEV_NAME);
    major = MAJOR(devno);

    cdev_init(&my_cdev, &fops);
    cdev_add(&my_cdev, devno, 1);

    // 自动创建 /dev 节点，不需要手动 mknod
    my_class = class_create(DEV_NAME);
    device_create(my_class, NULL, devno, NULL, DEV_NAME);

    pr_info("myedge: loaded, major=%d\n", major);
    return 0;
}

static void __exit my_exit(void)
{
    dev_t devno = MKDEV(major, 0);
    device_destroy(my_class, devno);
    class_destroy(my_class);
    cdev_del(&my_cdev);
    unregister_chrdev_region(devno, 1);
}

module_init(my_init);
module_exit(my_exit);
MODULE_LICENSE("GPL");
```

Makefile：

```makefile
obj-m += myedge.o
KDIR := /path/to/rk3588/kernel
PWD  := $(shell pwd)

all:
	make -C $(KDIR) M=$(PWD) ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- modules
```

## 设备树：硬件描述与驱动分离

驱动里不应硬编码 GPIO 编号，资源由设备树描述：

```dts
myedge {
    compatible = "shiyikun,myedge";
    led-gpios = <&gpio3 RK_PC5 GPIO_ACTIVE_HIGH>;
    status = "okay";
};
```

驱动侧通过 `of` API 获取资源：

```c
static int my_probe(struct platform_device *pdev)
{
    struct device_node *np = pdev->dev.of_node;
    int gpio;

    gpio = of_get_named_gpio(np, "led-gpios", 0);
    if (!gpio_is_valid(gpio)) {
        dev_err(&pdev->dev, "invalid led-gpios\n");
        return -EINVAL;
    }

    gpio_request(gpio, "myedge_led");
    gpio_direction_output(gpio, 0);
    return 0;
}

static const struct of_device_id my_of_match[] = {
    { .compatible = "shiyikun,myedge" },
    { /* sentinel */ }
};
MODULE_DEVICE_TABLE(of, my_of_match);
```

`compatible` 字符串是设备树节点与驱动匹配的唯一纽带——这个名字必须两边完全一致。

## 调试技巧

- `dmesg -w` 实时看 `pr_info` 输出
- `cat /proc/device-tree/myedge/status` 确认节点已启用
- `ls /sys/class/myedge_dev` 确认 class 创建成功

## 单片机思维 vs Linux 思维

最大的转变是：单片机里"我的程序拥有整个硬件"，Linux 里"内核统一管理硬件，驱动只是服务员"。理解了这层边界，pinmux、时钟、电源域这些概念就都顺了。下一步计划写一个 I2C 子系统下的传感器驱动。
