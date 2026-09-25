import type { RayHit } from './RaycastSystem'

/**
 * 悬停：记下光标下的地面与所属诗词地点。
 * 指到可点的地点时光标变成手形、对应地名签浮起高亮；其余情况保持「可拖动」的手掌。
 * 不画方块选框——这不是搭建游戏，只需告诉读者「这里能点」。
 */
export class HoverSystem {
  hit: RayHit | null = null
  placeId: string | null = null

  constructor(private readonly canvas: HTMLElement) {}

  set(hit: RayHit | null, placeId: string | null): boolean {
    this.hit = hit
    const changed = placeId !== this.placeId
    this.placeId = placeId
    this.canvas.classList.toggle('pointing', !!placeId)
    return changed
  }
}
