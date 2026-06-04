# Tellux Examples

这些示例通过 Vite 从本仓库的 `src` 直接引入 Tellux，适合开发时验证源码行为。

`examples/public/tellux/` 存放示例使用的 Tellux 静态资源。Vite 会把 `examples/public`
作为开发服务器的静态资源根目录，示例会通过 `tellux.baseUrl = '/tellux/'`
加载本地的云和 STBN 纹理。

示例默认使用 `TemplateUrlResource` 加载 ArcGIS World Imagery：

```txt
https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

## 运行

```bash
pnpm examples
```

打开：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/basic.html`
- `http://127.0.0.1:5173/fly-to.html`
- `http://127.0.0.1:5173/click.html`
- `http://127.0.0.1:5173/data-sources.html`
