import {Slice, Node, Schema} from "prosemirror-model"

import {Step, StepResult} from "./step"
import {StepMap, Mappable} from "./map"

/// Replace a part of the document with a slice of new content.
/** 用新的内容切片替换文档的一部分 */
export class ReplaceStep extends Step {
  /// The given `slice` should fit the 'gap' between `from` and
  /// `to`—the depths must line up, and the surrounding nodes must be
  /// able to be joined with the open sides of the slice. When
  /// `structure` is true, the step will fail if the content between
  /// from and to is not just a sequence of closing and then opening
  /// tokens (this is to guard against rebased replace steps
  /// overwriting something they weren't supposed to).
  /**
   * 传入的`slice`应该适配`from`到`to`之间的区域，深度应该对齐，前后的nodes必须能被传入的slice
   * 的开放边界组合。
   * 
   * 当`structure`为true时，如果在from和to之间的内容不只是一系列闭合开放的标记step将会应用失败
   * （这时为了避免`rebased replace step`覆盖一些它们不应该覆盖的东西）
   * 
   * structure属性作用  
   * 1.控制是否能跨块修改内容  
   * 2.控制是否能跨层修改内容  
   * 3.控制是否能跨结构修改内容（如表格，列表）
   * @param from 替换文档的开始位置
   * @param to 替换文档的结束位置
   * @param slice 用于替换的内容切片
   * @param structure 
   */
  constructor(
    /// The start position of the replaced range.
    readonly from: number,
    /// The end position of the replaced range.
    readonly to: number,
    /// The slice to insert.
    readonly slice: Slice,
    /// @internal
    readonly structure = false
  ) {
    super()
  }
  /**
   * 将传入的文档应用当前replaceStep
   * @param doc 应用于当前step的文档
   * @returns stepResult
   */
  apply(doc: Node) {
    if (this.structure && contentBetween(doc, this.from, this.to))
      return StepResult.fail("Structure replace would overwrite content")
    return StepResult.fromReplace(doc, this.from, this.to, this.slice)
  }
  /** 获取当前replace的stepMap */
  getMap() {
    return new StepMap([this.from, this.to - this.from, this.slice.size])
  }
  /**
   * 根据传入的文档生成一个反转的replaceStep，方便实现撤销和取消撤销
   * @param doc 需要被反转的文档 一般为应用于前一个replaceStep的文档
   * @returns replaceStep
   */
  invert(doc: Node) {
    return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to))
  }
  /**
   * 根据传入的mapping对象更新当前的replaceStep产生一个新的replaceStep
   * 或者null如果当前replace对应的内容已被删除的话
   * @param mapping 传入的mapping对象，将当前replaceStep更新
   * @returns 如果当前from到to的内容已被移除则返回null否则返回更新后的replaceStep
   */
  map(mapping: Mappable) {
    let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1)
    if (from.deletedAcross && to.deletedAcross) return null
    return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice)
  }
  /**
   * 尝试将传入的step与当前的replaceStep合并（应该是尝试将两个step合并进行加速避免单个step各自应用）
   * @param other 另一个step
   * @returns 返回一个新的replaceStep或者null
   */
  merge(other: Step) {
    // 如果传入的step不是replaceStep实例或者传入的step或者当前的replaceStep的structure为true
    // 返回null（只合并同类型的step且保持结构完整的step不参与合并）
    if (!(other instanceof ReplaceStep) || other.structure || this.structure) return null
    // 如果两个step的slice可以直接连接且两个step是连接着的则合并为一个新的
    // 当前的replaceStep在前传入的replaceStep在后
    if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
      let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
          : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd)
      return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure)
    // 传入的replaceStep在前当前的replaceStep在后
    } else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
      let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
          : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd)
      return new ReplaceStep(other.from, this.to, slice, this.structure)
    } else {
      return null
    }
  }
  /** 将当前step转换为JSON对象 */
  toJSON(): any {
    let json: any = {stepType: "replace", from: this.from, to: this.to}
    if (this.slice.size) json.slice = this.slice.toJSON()
    if (this.structure) json.structure = true
    return json
  }

  /// @internal
  /**
   * 尝试将传入的JSON对象转换成replaceStep如果成功则返回如果失败则抛出错误
   * @param schema 文档架构
   * @param json JSON对象
   * @returns 一个Error或者一个新的replaceStep
   */
  static fromJSON(schema: Schema, json: any) {
    if (typeof json.from != "number" || typeof json.to != "number")
      throw new RangeError("Invalid input for ReplaceStep.fromJSON")
    return new ReplaceStep(json.from, json.to, Slice.fromJSON(schema, json.slice), !!json.structure)
  }
}

Step.jsonID("replace", ReplaceStep)

/// Replace a part of the document with a slice of content, but
/// preserve a range of the replaced content by moving it into the
/// slice.
/**
 * 使用一个内容切片替换文档的一部分但会将被替换的内容添加到slice中进行保留
 */
export class ReplaceAroundStep extends Step {
  /// Create a replace-around step with the given range and gap.
  /// `insert` should be the point in the slice into which the content
  /// of the gap should be moved. `structure` has the same meaning as
  /// it has in the [`ReplaceStep`](#transform.ReplaceStep) class.
  /**
   * 用传入的内容创建一个`replaceAroundStep`。  
   * `insert`应该指向用于将从原文档移除的内容的插入位置，`structure`属性和replace类一样
   * @param from 替换文档的开始位置
   * @param to 替换文档的结束位置
   * @param gapFrom 保留范围的开始位置
   * @param gapTo 保留范围的结束位置
   * @param slice 用于插入的内容
   * @param insert 保留的内容在用于替换内容的插入位置
   * @param structure 
   */
  constructor(
    /// The start position of the replaced range.
    readonly from: number,
    /// The end position of the replaced range.
    readonly to: number,
    /// The start of preserved range.
    readonly gapFrom: number,
    /// The end of preserved range.
    readonly gapTo: number,
    /// The slice to insert.
    readonly slice: Slice,
    /// The position in the slice where the preserved range should be
    /// inserted.
    readonly insert: number,
    /// @internal
    readonly structure = false
  ) {
    super()
  }
  /**
   * 尝试对传入的文档应用当前replaceAroundStep并返回其应用结果  
   * replaceAroundStep会将传入的doc中gapFrom到gapTo的slice插入到this.slice的insert位置
   * 然后再将this.slice应用于文档中from到to的位置
   * @param doc 用于应用当前replaceAroundStep的文档
   * @returns 返回应用的结果stepResult
   */
  apply(doc: Node) {
    if (this.structure && (contentBetween(doc, this.from, this.gapFrom) ||
                           contentBetween(doc, this.gapTo, this.to)))
      return StepResult.fail("Structure gap-replace would overwrite content")

    let gap = doc.slice(this.gapFrom, this.gapTo)
    if (gap.openStart || gap.openEnd)
      return StepResult.fail("Gap is not a flat range")
    let inserted = this.slice.insertAt(this.insert, gap.content)
    if (!inserted) return StepResult.fail("Content does not fit in gap")
    return StepResult.fromReplace(doc, this.from, this.to, inserted)
  }
  /** 获取当前replaceAroundStep的stepMap */
  getMap() {
    //this.from+this.gapTo,this.to-this.from+this.gapFrom-this.gapTp,this.slice.size ×
    //stepMap的设计太精妙了，这样就可以精确计算每一段内容在新文档中的映射位置
    return new StepMap([this.from, this.gapFrom - this.from, this.insert,
                        this.gapTo, this.to - this.gapTo, this.slice.size - this.insert])
  }
  /**
   * 根据传入的文档将当前replaceAroundStep反转
   * @param doc 用于将当前replaceAroundStep反转的文档
   * @returns 被传入文档反转的replaceAroundStep
   */
  invert(doc: Node) {
    let gap = this.gapTo - this.gapFrom
    return new ReplaceAroundStep(this.from, this.from + this.slice.size + gap,
                                 this.from + this.insert, this.from + this.insert + gap,
                                 doc.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from),
                                 this.gapFrom - this.from, this.structure)
  }
  /**
   * 根据传入的mapping对象尝试生成一个新的replaceAroundStep，
   * 如果保留的开头小于替换的开头或保留的结尾大于替换的结尾或当前替换区域在mapping对象中已被完全删除则返回null
   * 当前step对应的内容已被删除后续操作已无效
   * @param mapping mapping对象
   * @returns 一个新的replaceAroundStep或者null
   */
  map(mapping: Mappable) {
    let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1)
    let gapFrom = this.from == this.gapFrom ? from.pos : mapping.map(this.gapFrom, -1)
    let gapTo = this.to == this.gapTo ? to.pos : mapping.map(this.gapTo, 1)
    if ((from.deletedAcross && to.deletedAcross) || gapFrom < from.pos || gapTo > to.pos) return null
    return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert, this.structure)
  }
  /** 将当前replaceAroundStep转换成一个JSON对象 */
  toJSON(): any {
    let json: any = {stepType: "replaceAround", from: this.from, to: this.to,
                     gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert}
    if (this.slice.size) json.slice = this.slice.toJSON()
    if (this.structure) json.structure = true
    return json
  }

  /// @internal
  /**
   * 尝试将传入的json按照传入的schema转换成一个replaceAroundStep
   * @param schema 文档架构
   * @param json JSON对象
   * @returns 一个replaceAroundStep或者抛出一个错误
   */
  static fromJSON(schema: Schema, json: any) {
    if (typeof json.from != "number" || typeof json.to != "number" ||
        typeof json.gapFrom != "number" || typeof json.gapTo != "number" || typeof json.insert != "number")
      throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON")
    return new ReplaceAroundStep(json.from, json.to, json.gapFrom, json.gapTo,
                                 Slice.fromJSON(schema, json.slice), json.insert, !!json.structure)
  }
}

Step.jsonID("replaceAround", ReplaceAroundStep)

/**
 * 检查传入的文档在给定的范围内是否有内容，
 * 这个函数只有在replaceStep/replaceAroundStep的structure属性为true时才会被调用，
 * 当node存在且内容为空时则认为是块级元素，而structure属性则控制着是否能跨块修改 
 * 看完model之后再回来看这段代码
 * @param doc 传入的文档节点
 * @param from 开始位置
 * @param to 结束位置
 * @returns 传入的文档节点的开始位置到结束位置有内容则返回true无内容则返回false
 */
function contentBetween(doc: Node, from: number, to: number) {
  let $from = doc.resolve(from), dist = to - from, depth = $from.depth
  // 排除开始位置在某个节点尾部的情况
  while (dist > 0 && depth > 0 && $from.indexAfter(depth) == $from.node(depth).childCount) {
    depth--
    dist--
  }
  if (dist > 0) {
    let next = $from.node(depth).maybeChild($from.indexAfter(depth))
    while (dist > 0) {
      //没有子节点了当内容长度还是大于0或者子节点为叶子节点则认为是存在内容的
      if (!next || next.isLeaf) return true
      next = next.firstChild
      dist--
    }
  }
  return false
}
