# 素材来源

首页地球有两套皮：第一帧是现画的手绘海图，照片贴图到了再淡入换掉。两者的出处都在这里。

## 手绘海图（兜底）

`src/scripts/world.ts` 里的海岸线来自 Natural Earth 的 1:110m land 数据，
只取每个多边形的外环、在经纬度平面上简化到 0.22°、按 0.1° 取整后存成扁平数组，
画的时候再投到等距圆柱投影上。纸张、点阵陆地、经纬网都是在 canvas 里现画的，没有图片文件。

- 来源：https://www.naturalearthdata.com/
- 数据集：https://github.com/nvkelso/natural-earth-vector（`geojson/ne_110m_land.geojson`）
- 许可：公有领域（Natural Earth 不要求署名，这里记一笔是为了好追溯）

## 照片贴图

`public/textures/` 下的白天、夜灯、海面高光和云，来自 Three.js 示例的贴图集，
底图来自公开的科学数据集，包括 NASA 的影像。

- 来源：https://threejs.org/examples/textures/planets/
- 自然色昼面贴图由 Solar System Scope 提供，CC BY 4.0：https://www.solarsystemscope.com/textures/
