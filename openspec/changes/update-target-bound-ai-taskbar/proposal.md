# Change: AI 任务栏跟随生成图片目标

## Why

生成图片插入画布后，现有 AI 任务栏仍固定在底部。用户无法在图片旁恢复原提示词并继续编辑，重新生成也不能稳定替换同一个图片目标。

## What Changes

- 生成图片元素保留 prompt、任务 ID 和 anchor ID 等轻量绑定元数据
- 单选生成图片时，复用现有 AI 任务栏并吸附到图片附近
- 任务栏恢复目标图片的原提示词
- 修改提示词后创建新的图片生成任务，并原位替换目标图片
- 替换成功时保留元素 ID、位置和尺寸；失败或目标丢失时不新增图片
- 批量生成图片按独立 anchor 和目标元素分别绑定

## Impact

- Affected specs:
  - `ai-input-generation`
  - `image-generation`
  - `image-generation-feedback`
- Affected code:
  - `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx`
  - `packages/drawnix/src/hooks/useAutoInsertToCanvas.ts`
  - `packages/drawnix/src/mcp/tools/image-generation.ts`
  - `packages/drawnix/src/types/image-generation-anchor.types.ts`
  - `packages/drawnix/src/utils/image-generation-anchor-*`
