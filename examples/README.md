# Tellux Examples

这些示例通过 Vite 从本仓库的 `src` 直接引入 Tellux，适合开发时验证源码行为。

`examples/public/tellux/` 存放示例使用的 Tellux 静态资源。Vite 会把 `examples/public`
作为开发服务器的静态资源根目录，示例会通过 `tellux.baseUrl = '/tellux/'`
加载本地的云和 STBN 纹理。

## 运行

```bash
$env:VITE_CESIUM_ION_TOKEN="your-token"
pnpm examples
```

打开：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/basic.html`
- `http://127.0.0.1:5173/click.html`

如果没有设置 `VITE_CESIUM_ION_TOKEN`，页面仍会启动，但 Cesium Ion 资源可能无法加载。
