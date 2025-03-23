import {compareDeep} from "./comparedeep"
import {Attrs, MarkType, Schema} from "./schema"

/// A mark is a piece of information that can be attached to a node,
/// such as it being emphasized, in code font, or a link. It has a
/// type and optionally a set of attributes that provide further
/// information (such as the target of the link). Marks are created
/// through a `Schema`, which controls which types exist and which
/// attributes they have.
/**
 * mark是一些能被附加到节点的信息，比如加粗、代码片段或者链接。它拥有一个markType以及一系列提供
 * 额外信息的属性(比如链接的target)。marks被`Schema`创建，它的类型及属性都是受限的
 */
export class Mark {
  /// @internal
  /**
   * 
   * @param type 当前mark的类型
   * @param attrs 当前mark的属性
   */
  constructor(
    /// The type of this mark.
    readonly type: MarkType,
    /// The attributes associated with this mark.
    readonly attrs: Attrs
  ) {}

  /// Given a set of marks, create a new set which contains this one as
  /// well, in the right position. If this mark is already in the set,
  /// the set itself is returned. If any marks that are set to be
  /// [exclusive](#model.MarkSpec.excludes) with this mark are present,
  /// those are replaced by this one.
  /**
   * 创建一个新的包含当前marks集合及传入marks集合的新集合(position matters)。
   * 如果当前mark已经存在于集合中，则返回自身。如果存在`exclusive`包含的marks，
   * 那将会被当前marks替换
   * @param set 被添加到当前mark的marks集合
   * @returns 
   */
  addToSet(set: readonly Mark[]): readonly Mark[] {
    let copy, placed = false
    for (let i = 0; i < set.length; i++) {
      let other = set[i]
      if (this.eq(other)) return set
      if (this.type.excludes(other.type)) {
        if (!copy) copy = set.slice(0, i)
      } else if (other.type.excludes(this.type)) {
        return set
      } else {
        if (!placed && other.type.rank > this.type.rank) {
          if (!copy) copy = set.slice(0, i)
          copy.push(this)
          placed = true
        }
        if (copy) copy.push(other)
      }
    }
    if (!copy) copy = set.slice()
    if (!placed) copy.push(this)
    return copy
  }

  /// Remove this mark from the given set, returning a new set. If this
  /// mark is not in the set, the set itself is returned.
  /**
   * 从给定的marks集合中移除当前mark，返回一个新的集合。如果当前mark不在集合中则直接返回集合自身
   * @param set marks集合
   * @returns 如果当前mark存在指定的marks集合中则将其从集合中移除并返回该集合如果不存在直接返回该集合
   */
  removeFromSet(set: readonly Mark[]): readonly Mark[] {
    for (let i = 0; i < set.length; i++)
      if (this.eq(set[i]))
        return set.slice(0, i).concat(set.slice(i + 1))
    return set
  }

  /// Test whether this mark is in the given set of marks.
  /**
   * 测试当前mark是否存在传入的marks集合中
   * @param set marks集合
   * @returns 如果当前mark存在于传入的集合中则返回true否则返回false
   */
  isInSet(set: readonly Mark[]) {
    for (let i = 0; i < set.length; i++)
      if (this.eq(set[i])) return true
    return false
  }

  /// Test whether this mark has the same type and attributes as
  /// another mark.
  /**
   * 测试当前mark是否于指定mark相等
   * @param other 用于比较的mark
   * @returns 如果两个mark相等则返回true否则返回false
   */
  eq(other: Mark) {
    return this == other ||
      (this.type == other.type && compareDeep(this.attrs, other.attrs))
  }

  /// Convert this mark to a JSON-serializeable representation.
  /**
   * 将当前mark转换成JSON对象
   * @returns 当前mark的JSON对象
   */
  toJSON(): any {
    let obj: any = {type: this.type.name}
    for (let _ in this.attrs) {
      obj.attrs = this.attrs
      break
    }
    return obj
  }

  /// Deserialize a mark from JSON.
  /**
   * 将JSON对象反序列化成mark
   * @param schema 文档架构
   * @param json JSON对象
   * @returns mark
   */
  static fromJSON(schema: Schema, json: any) {
    if (!json) throw new RangeError("Invalid input for Mark.fromJSON")
    let type = schema.marks[json.type]
    if (!type) throw new RangeError(`There is no mark type ${json.type} in this schema`)
    let mark = type.create(json.attrs)
    type.checkAttrs(mark.attrs)
    return mark
  }

  /// Test whether two sets of marks are identical.
  /**
   * 测试两个marks集合是否完全一样(position matters)
   * @param a marks集合
   * @param b marks集合
   * @returns 如果指定的两个marks集合完全一样则返回true否则返回false
   */
  static sameSet(a: readonly Mark[], b: readonly Mark[]) {
    if (a == b) return true
    if (a.length != b.length) return false
    for (let i = 0; i < a.length; i++)
      if (!a[i].eq(b[i])) return false
    return true
  }

  /// Create a properly sorted mark set from null, a single mark, or an
  /// unsorted array of marks.
  /**
   * 创建一个被正确排序的marks集合(position matters)
   * (根据mark.rank进行排序，这在schema初始化的时候会默认根据markSpec位置生成一个自增的rank)
   * @param marks marks集合，可能为空、单个mark或者无序的marks数组
   * @returns 
   */
  static setFrom(marks?: Mark | readonly Mark[] | null): readonly Mark[] {
    if (!marks || Array.isArray(marks) && marks.length == 0) return Mark.none
    if (marks instanceof Mark) return [marks]
    let copy = marks.slice()
    copy.sort((a, b) => a.type.rank - b.type.rank)
    return copy
  }

  /// The empty set of marks.
  /** 空marks集合 */
  static none: readonly Mark[] = []
}
