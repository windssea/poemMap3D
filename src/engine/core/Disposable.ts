export interface Disposable {
  dispose(): void
}

/** 统一回收：按登记的逆序释放 */
export class DisposableGroup implements Disposable {
  private readonly items: (Disposable | (() => void))[] = []

  add<T extends Disposable | (() => void)>(d: T): T {
    this.items.push(d)
    return d
  }

  dispose(): void {
    while (this.items.length) {
      const d = this.items.pop()!
      if (typeof d === 'function') d()
      else d.dispose()
    }
  }
}
