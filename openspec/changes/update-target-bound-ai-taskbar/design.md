# Design: AI 任务栏跟随生成图片目标

## Goals

- 单选生成图片时，现有任务栏跟随目标并恢复提示词
- 编辑提示词后创建新任务并替换原图片
- 保留原图片元素的 ID、位置、尺寸和选择上下文
- 失败或目标不存在时不修改画布内容
- 只保存 URL、ID 和 prompt，不复制大图数据

## Non-Goals

- 不扩展到视频、音频或文本目标
- 不改变话题、草稿或附件状态
- 不改造左侧图片入口和外部 iframe 工具
- 不重构 provider 或任务队列

## Data Model

- image element:
  - `generationPrompt`
  - `generationTaskId`
  - `generationAnchorId`
- anchor:
  - `prompt`
  - `resultElementId`
  - `targetElementId`
  - `sourceTaskId`
  - `latestTaskId`
- task params:
  - `anchorId`
  - `replaceElementId`
  - `targetElementId`
  - `sourceTaskId`
  - `sourcePrompt`

## Flow

### Initial generation

1. AI 任务栏创建图片工作流和独立 anchor
2. 工作流图片步骤写入对应 `anchorId`
3. 图片任务完成并插入画布
4. 图片元素写入 prompt、任务 ID 和 anchor ID
5. anchor 回写结果元素 ID 和最新任务关系

### Target editing

1. 用户单选一张带生成 prompt 的图片
2. 任务栏恢复 prompt，并根据图片矩形和视口计算吸附位置
3. 用户修改 prompt 并提交
4. 新任务携带目标元素 ID、anchor ID 和来源任务 ID
5. 任务成功后通过 `Transforms.setNode` 更新原元素 URL 和元数据
6. 目标不存在或生成失败时保留当前画布，不退化为新增图片

## Safety And Performance

- 不把 base64 或完整任务历史写入画布元素和 anchor
- 视口事件通过 `requestAnimationFrame` 合并布局刷新
- 取消选择后不再计算目标吸附位置
- 原位更新元素，避免删除和重建造成布局变化
