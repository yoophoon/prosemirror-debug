/**
 * 比较数组、可枚举对象或原始值是否全等
 * @param a 
 * @param b 
 * @returns 如果传入内容一样则返回true，否则返回false
 */
export function compareDeep(a: any, b: any) {
  // 如果a和b全等 返回true
  if (a === b) return true
  // 如果两者中存在不为对象的类型 返回false
  if (!(a && typeof a == "object") ||
      !(b && typeof b == "object")) return false
  // 如果两者中只有一方为数组类型 返回false
  let array = Array.isArray(a)
  if (Array.isArray(b) != array) return false
  // 两者都为数组类型
  if (array) {
    // 长度不一致 返回false
    if (a.length != b.length) return false
    // 同位置的元素不一致 返回false
    for (let i = 0; i < a.length; i++) if (!compareDeep(a[i], b[i])) return false
  } else {
    // 键名找不到对应的键值或者键值不相等 返回false
    for (let p in a) if (!(p in b) || !compareDeep(a[p], b[p])) return false
    // 看b中的属性a是否拥有 没有则返回false
    for (let p in b) if (!(p in a)) return false
  }
  // 返回true
  return true
}
