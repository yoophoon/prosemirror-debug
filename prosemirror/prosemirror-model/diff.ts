import {Fragment} from "./fragment"

/**
 * 查找两个文档片段内容不一致的起点位置
 * @param a a文档
 * @param b b文档
 * @param pos 开始比较位置
 * @returns 两文档一致则返回null
 */
export function findDiffStart(a: Fragment, b: Fragment, pos: number): number | null {
  for (let i = 0;; i++) {
    // 如果i是某个文档的子元素数量
    if (i == a.childCount || i == b.childCount)
      // 如果两个文档子元素数量一样多 则表示文档一致否则返回pos
      return a.childCount == b.childCount ? null : pos

    let childA = a.child(i), childB = b.child(i)
    // 如果两文档的第i个子节点是一样的，则pos累加这个子元素的尺寸
    if (childA == childB) { pos += childA.nodeSize; continue }
    // 如果子元素的mark不一致则返回pos
    if (!childA.sameMarkup(childB)) return pos
    // 如果两子元素的文本不一致则返回一致内容终点的位置
    if (childA.isText && childA.text != childB.text) {
      for (let j = 0; childA.text![j] == childB.text![j]; j++)
        pos++
      return pos
    }
    // 两文档有内容节点
    if (childA.content.size || childB.content.size) {
      // 递归查找
      let inner = findDiffStart(childA.content, childB.content, pos + 1)
      if (inner != null) return inner
    }
    // 位置加上当前子节点的尺寸
    pos += childA.nodeSize
  }
}
/**
 * 
 * @param a 文档a
 * @param b 文档b
 * @param posA 位置a
 * @param posB 位置b
 * @returns 
 */
export function findDiffEnd(a: Fragment, b: Fragment, posA: number, posB: number): {a: number, b: number} | null {
  // 遍历
  for (let iA = a.childCount, iB = b.childCount;;) {
    // 是否遍历完其中一个文档
    if (iA == 0 || iB == 0)
      // 两个都遍历完则返回null否则返回初始位置
      return iA == iB ? null : {a: posA, b: posB}
    // 如果两个子节点相等
    let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize
    if (childA == childB) {
      posA -= size; posB -= size
      continue
    }
    // 如果两个子节点mark不一致
    if (!childA.sameMarkup(childB)) return {a: posA, b: posB}
    // 两个子元素的文本不一致 返回两文本不一致的终点
    if (childA.isText && childA.text != childB.text) {
      let same = 0, minSize = Math.min(childA.text!.length, childB.text!.length)
      while (same < minSize && childA.text![childA.text!.length - same - 1] == childB.text![childB.text!.length - same - 1]) {
        same++; posA--; posB--
      }
      return {a: posA, b: posB}
    }
    // 如果两个子元素有内容 递归查找
    if (childA.content.size || childB.content.size) {
      let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1)
      if (inner) return inner
    }
    // 子元素一致 继续向前比较
    posA -= size; posB -= size
  }
}
