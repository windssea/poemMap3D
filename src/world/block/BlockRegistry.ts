import { type BlockDefinition, BlockRenderLayer, BlockShape } from './BlockDefinition'
import { type BlockId, MAX_BLOCK_ID } from './BlockState'

/**
 * 方块注册表：id → 定义，并预先展开成热路径用的扁平查表（mesher / 生成器逐格调用）。
 */
export class BlockRegistry {
  private readonly defs: (BlockDefinition | undefined)[] = []
  private readonly byName = new Map<string, BlockDefinition>()

  /* 热路径查表 */
  readonly shape = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly layer = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly solid = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly opaque = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly occludes = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly liquid = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly replaceable = new Uint8Array(MAX_BLOCK_ID + 1)
  readonly receivesAO = new Uint8Array(MAX_BLOCK_ID + 1)
  /** 用于环境光遮蔽取样：此格是否算「实心」 */
  readonly aoSolid = new Uint8Array(MAX_BLOCK_ID + 1)

  register(def: BlockDefinition): BlockDefinition {
    if (def.id < 0 || def.id > MAX_BLOCK_ID) throw new Error(`方块 id 越界：${def.id}`)
    if (this.defs[def.id]) throw new Error(`方块 id 重复：${def.id}（${this.defs[def.id]!.name} / ${def.name}）`)
    if (this.byName.has(def.name)) throw new Error(`方块名重复：${def.name}`)
    if (def.shape === BlockShape.CUSTOM_VOXEL && !def.boxes?.length) throw new Error(`自定义体素方块缺少 boxes：${def.name}`)
    if (def.occludesNeighbor && def.shape !== BlockShape.FULL_CUBE) throw new Error(`只有整块才能遮挡邻面：${def.name}`)
    this.defs[def.id] = def
    this.byName.set(def.name, def)
    this.shape[def.id] = def.shape
    this.layer[def.id] = def.renderLayer
    this.solid[def.id] = def.solid ? 1 : 0
    this.opaque[def.id] = def.opaque ? 1 : 0
    this.occludes[def.id] = def.occludesNeighbor ? 1 : 0
    this.liquid[def.id] = def.liquid ? 1 : 0
    this.replaceable[def.id] = def.replaceable ? 1 : 0
    this.receivesAO[def.id] = def.receivesAO ? 1 : 0
    this.aoSolid[def.id] = def.opaque && def.shape === BlockShape.FULL_CUBE ? 1 : def.renderLayer === BlockRenderLayer.Cutout && def.shape === BlockShape.FULL_CUBE ? 1 : 0
    return def
  }

  get(id: BlockId): BlockDefinition {
    const d = this.defs[id]
    if (!d) throw new Error(`未注册的方块 id：${id}`)
    return d
  }

  has(id: BlockId): boolean {
    return !!this.defs[id]
  }

  byKey(name: string): BlockDefinition {
    const d = this.byName.get(name)
    if (!d) throw new Error(`未注册的方块：${name}`)
    return d
  }

  all(): BlockDefinition[] {
    return this.defs.filter((d): d is BlockDefinition => !!d)
  }
}
