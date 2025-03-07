/// There are several things that positions can be mapped through.
/// Such objects conform to this interface.
/** 位置可以被映射的对象都应该实现这个这个接口 */
export interface Mappable {
  /// Map a position through this object. When given, `assoc` (should
  /// be -1 or 1, defaults to 1) determines with which side the
  /// position is associated, which determines in which direction to
  /// move when a chunk of content is inserted at the mapped position.
  /**
   * 通过这个对象映射位置。
   * 当`assoc`参数（1(默认)或者-1）被传递时这将会确定哪一边会被关联即确定当插入一段内容时的映射位置
   * 
   * （这里应该是指prosemirror内部会根据这个传入值计算鼠标的位置
   * 如插入内容时鼠标位置应该是在插入内容之前还是在插入内容之后）
   * @param pos 需要获取映射信息的位置
   * @param assoc 关联方向 1为右边2为左边
   * @returns 映射的数字
   */
  map: (pos: number, assoc?: number) => number

  /// Map a position, and return an object containing additional
  /// information about the mapping. The result's `deleted` field tells
  /// you whether the position was deleted (completely enclosed in a
  /// replaced range) during the mapping. When content on only one side
  /// is deleted, the position itself is only considered deleted when
  /// `assoc` points in the direction of the deleted content.
  /**
   * 映射一个位置信息并返回一个包含关于这个映射的额外信息的对象(mapResult)。
   * `mapResult.delete`字段表明这个映射的位置是否被删除（完全封闭在被替换的范围内）。
   * 当一侧的内容被删除时，位置本身只有在`assoc`指向被删除内容的方向才会被认为是被删除的
   * 
   * （大概意思就是正常情况下向后删除的内容位置会被认为是删除的而向前删除的内容位置会被认为没有删除
   * 但如果指定了assoc=-1，则上面情况应该反过来）
   * @param pos 需要获取映射信息的位置
   * @param assoc 关联方向 1为右边2为左边
   * @returns `mapResult` 映射结果
   */
  mapResult: (pos: number, assoc?: number) => MapResult
}

// Recovery values encode a range index and an offset. They are
// represented as numbers, because tons of them will be created when
// mapping, for example, a large number of decorations. The number's
// lower 16 bits provide the index, the remaining bits the offset.
//
// Note: We intentionally don't use bit shift operators to en- and
// decode these, since those clip to 32 bits, which we might in rare
// cases want to overflow. A 64-bit float can represent 48-bit
// integers precisely.
/**
 * recovery的值为被编码的范围下标（低16位）和一个偏移值（高16位）。
 * 它们以数字展示，因为生成映射关系时会创建大量的recovery，比如大量的decoration。
 * (这里的range应该是指文档一处变更的范围而不是stepMap的ranges，因为stepMap.ranges是一个以
 * 三个元素为一组标记文档变更范围的数组，而recover的index指的是第几组stepMap.ranges，而offset
 * 则是指文档变更时这个光标在index指向的那一组范围内的偏移值，这么做应该是为了加速反转)
 * 
 * 注意：prosemirror并不倾向使用位移操作符来编码和解码这些信息，因为32位芯片可能会溢出，
 * 64位芯片可以精确的展示48位整数（2进制位）
 */
const lower16 = 0xffff
const factor16 = Math.pow(2, 16)
/**
 * 根据传入的索引值及偏移值创建一个recover
 * @param index 索引值
 * @param offset 偏移值
 * @returns recover
 */
function makeRecover(index: number, offset: number) { return index + offset * factor16 }
/**
 * 将传入的值与0xffff进行按位与运算，获取存在该值上的索引值
 * @param value 获取存在该值上的索引
 * @returns 一个索引值
 */
function recoverIndex(value: number) { return value & lower16 }
/**
 * 将传入的value通过`(value - (value & lower16)) / factor16`计算获取存在该值上的偏移值
 * @param value 获取该值上的偏移值
 * @returns 一个偏移值
 */
function recoverOffset(value: number) { return (value - (value & lower16)) / factor16 }

/**
 * DEL_BEFORE=0b0001
 * DEL_AFTER =0b0010
 * DEL_ACROSS=0b0100
 * DEL_SIDE  =0b1000
 */
const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8

/// An object representing a mapped position with extra
/// information.
/** 一个用于表示映射位置即其额外信息的对象 */
export class MapResult {
  /// @internal
  constructor(
    /// The mapped version of the position.
    readonly pos: number,
    /// @internal
    readonly delInfo: number,
    /// @internal
    readonly recover: number | null
  ) {}

  /// Tells you whether the position was deleted, that is, whether the
  /// step removed the token on the side queried (via the `assoc`)
  /// argument from the document.
  /** 表明当前位置是否被删除，只有删除的方向与`assoc`指向的方向相反才会是false
   * （stepMap内部对delInfo做了处理，单边删除delInfo的DEL_SIDE位就会是1）
   */
  get deleted() { return (this.delInfo & DEL_SIDE) > 0 }

  /// Tells you whether the token before the mapped position was deleted.
  /** 表明被映射的位置之前是否被删除 */
  get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0 }

  /// True when the token after the mapped position was deleted.
  /** 表明被映射的位置之后是否被删除 */
  get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0 }

  /// Tells whether any of the steps mapped through deletes across the
  /// position (including both the token before and after the
  /// position).
  /** 表明step映射的位置是否被连续删除即该位置的前后都被删除 */
  get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0 }
}

/// A map describing the deletions and insertions made by a step, which
/// can be used to find the correspondence between positions in the
/// pre-step version of a document and the same position in the
/// post-step version.
/** 一个描述由step创建的删除和插入的映射，可以被用来查找旧文档与新文档之间的位置对应关系 */
export class StepMap implements Mappable {
  /// Create a position map. The modifications to the document are
  /// represented as an array of numbers, in which each group of three
  /// represents a modified chunk as `[start, oldSize, newSize]`.
  /**
   * 创建一个位置映射。文档的变动以一个由数字组成的数组呈现，
   * 数组中被修改的内容以`[start,oldSize,newSize]`三个成员呈现（这里采用的是一维数组）
   * @param ranges 用于记录当前step变动的信息数组[文档变动的开始位置,旧内容长度,新内容长度]
   * 常规情况下这个数组应该只包含三个成员一些特殊情况如多光标插入、删除及应用多个decoration时
   * 数组长度将会超过3但其仍应该是3的倍数
   * @param inverted 表明当前stepMap使用用于反转前面一个step
   * @returns instance of StepMap，如果传入的ranges为空则认为文档的位置关系没有发生变更
   * 返回一个empty stepMap
   */
  constructor(
    /// @internal
    readonly ranges: readonly number[],
    /// @internal
    readonly inverted = false
  ) {
    if (!ranges.length && StepMap.empty) return StepMap.empty
  }

  /// @internal
  /**
   * 根据传入的recover值算出目标位置（position）
   * @param value stepMap.recover
   * @returns pos
   */
  recover(value: number) {
    let diff = 0, index = recoverIndex(value)
    if (!this.inverted) for (let i = 0; i < index; i++)
      diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1]
    return this.ranges[index * 3] + diff + recoverOffset(value)
  }

  /**
   * 根据传入的前一个文档中的位置及映射方向返回关于该位置的映射结果(是否被删除及删除方式)
   * @param pos 前一个文档中需要被映射的位置
   * @param assoc 需要映射的方向（-1向左 1向右）
   * @returns 返回一个mapResult
   */
  mapResult(pos: number, assoc = 1): MapResult { return this._map(pos, assoc, false) as MapResult }
  /**
   * 根据传入的前一个文档中的位置及映射方向放回关于该位置在当前文档中的位置
   * （每一个step对应一个文档，历史文档及历史step均保存在transform上，
   * prosemirror则是由继承了transform类的transaction）
   * @param pos 前一个文档中需要被映射的位置
   * @param assoc 需要映射的方向（-1向左 1向右）
   * @returns 直接返回在当前文档中的位置
   */
  map(pos: number, assoc = 1): number { return this._map(pos, assoc, true) as number }

  /// @internal
  /**
   * 内部方法根据传入参数simple的值分别返回一个position数值或者一个mapResult对象
   * @param pos 前一个文档中需要被映射的位置
   * @param assoc 需要映射的方向（-1向左 1向右）
   * @param simple 需要映射结果的类型 true则直接返回一个表示当前文档位置的数字，
   * false则返回一个对象该对象包含了当前文档的位置信息、删除信息及recover信息
   * @returns simple?number:mapResult
   */
  _map(pos: number, assoc: number, simple: boolean) {
    //[start,oldSize,newSize] this.inverted=false
    //[start,newSize,oldSize] this.inverted=true
    let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i] - (this.inverted ? diff : 0)
      // 如果开始位置在要被映射位置之前则中断循环（因为位置没有变动）
      if (start > pos) break
      // 被映射的位置处于文档变化的起点和终点之间
      // 根据当前stepMap的inverted调整变动尺寸的下标
      // （这也是为啥文档反转时其对应的stepMap仅仅只由stepMap.invert(this.ranges,true)）
      let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize
      if (pos <= end) {
        //oldSize的尺寸是否为0(上一个step是否有内容被删除) 
        //    如果只是新增内容则映射关联方向为assoc
        //    如果有内容删除则判断被映射的位置是不是等于当前变更的起始位置
        //      如果相等则关联方向为左
        //      如果不相等则继续判断被映射位置是不是等于当前变更的结束位置
        //        如果相等则关联方向向右
        //        如果不相等则以传入的assoc关联方向为准
        // 这里主要还是有一个自动关联映射方向的问题，如果被映射的位置不在文档变动部分的开头或者结尾，
        // 则关联位置以传入的assoc为准，否则会自动变更这两个地方的映射方向
        // 即优先映射与上一份文档相同的内容的位置
        // (感觉这里prosemirror的作者有点炫技的成分，side=(pos==start&&-1)||(pos==end&&1)||assoc）
        // (我错了，人家作者只是想极致压榨性能，通常情况下用户输入，oldSize就是0，上面注释留作轻视大佬的耻辱柱）
        let side = !oldSize ? assoc : 
                              pos == start ? -1 : 
                                            pos == end ? 1 : assoc
        // 获取映射结果
        let result = start + diff + (side < 0 ? 0 : newSize)
        if (simple) return result
        // 标记recover，方便加速某些反转
        let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start)
        let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS
        if (assoc < 0 ? pos != start : pos != end) del |= DEL_SIDE
        return new MapResult(result, del, recover)
      }
      diff += newSize - oldSize
    }
    // 如果开始位置在要被映射位置之后则映射之后的位置为 posMaped=pos+diff
    return simple ? pos + diff : new MapResult(pos + diff, 0, null)
  }

  /// @internal
  /**
   * 查询传入的位置是否在指定的范围内
   * @param pos 传入的位置信息
   * @param recover 传入的包含range的index即在range内的offset信息的组合值
   * @returns 如果传入的位置在传入的recover指定的index范围内则返回true否则返回false
   */
  touches(pos: number, recover: number) {
    let diff = 0, index = recoverIndex(recover)
    let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i] - (this.inverted ? diff : 0)
      if (start > pos) break
      let oldSize = this.ranges[i + oldIndex], end = start + oldSize
      if (pos <= end && i == index * 3) return true
      diff += this.ranges[i + newIndex] - oldSize
    }
    return false
  }

  /// Calls the given function on each of the changed ranges included in
  /// this map.
  /**
   * 被包含在当前映射内的所有被修改的范围均会调用一次传入的回调函数
   * @param f 回调函数
   */
  forEach(f: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void) {
    let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2
    for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
      let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff)
      let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex]
      f(oldStart, oldStart + oldSize, newStart, newStart + newSize)
      diff += newSize - oldSize
    }
  }

  /// Create an inverted version of this map. The result can be used to
  /// map positions in the post-step document to the pre-step document.
  /**
   * 创建当前映射的反转版本。结果可以用来将上一个step中的文档的位置映射到当前step中的文档的位置
   * @returns 一个被反转的step映射
   */
  invert() {
    return new StepMap(this.ranges, !this.inverted)
  }

  /// @internal
  /** 将当前映射的范围信息转为字符穿，反转stepMap会带有前缀`-` */
  toString() {
    return (this.inverted ? "-" : "") + JSON.stringify(this.ranges)
  }

  /// Create a map that moves all positions by offset `n` (which may be
  /// negative). This can be useful when applying steps meant for a
  /// sub-document to a larger document, or vice-versa.
  /**
   * 创建一个映射以将所有的位置移动n。这在应用带有子文档的steps的大文档很有用，反之亦然(vice-versa)
   * @param n 偏移的值
   * @returns 如果偏移的值为0则放回一个空的stepMap如果<0则向左偏移n位，如果>0则向右偏移n位
   */
  static offset(n: number) {
    return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n])
  }

  /// A StepMap that contains no changed ranges.
  /** 创建一个不包含修改范围的stepMap */
  static empty = new StepMap([])
}

/// A mapping represents a pipeline of zero or more [step
/// maps](#transform.StepMap). It has special provisions for losslessly
/// handling mapping positions through a series of steps in which some
/// steps are inverted versions of earlier steps. (This comes up when
/// ‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
/// collaboration or history management.)
/**
 * 一个mapping对象表示0个或多个stepMaps的管线。
 * 该类含有一些特别的规定用于优化处理通过一系列step产设的位置映射，因为有些step是其前一步step的
 * 反转step。(这通常出现在用于协同编辑的`rebasing step`或者历史记录管理)
 */
export class Mapping implements Mappable {
  /// Create a new mapping with the given position maps.
  /**
   * 
   * @param maps stepMap栈
   * @param mirror 
   * @param from 
   * @param to 
   */
  constructor(
    maps?: readonly StepMap[],
    /// @internal
    public mirror?: number[],
    /// The starting position in the `maps` array, used when `map` or
    /// `mapResult` is called.
    public from = 0,
    /// The end position in the `maps` array.
    public to = maps ? maps.length : 0
  ) {
    this._maps = (maps as StepMap[]) || []
    this.ownData = !(maps || mirror)
  }

  /// The step maps in this mapping.
  /** 当前mapping对象中存储的stepMap栈 */
  get maps(): readonly StepMap[] { return this._maps }

  private _maps: StepMap[]
  // False if maps/mirror are shared arrays that we shouldn't mutate
  /** 如果maps或者mirror是那些我们不应该变更的数组ownData的值为false */
  private ownData: boolean

  /// Create a mapping that maps only through a part of this one.
  /**
   * 创建当前mapping对象的切片（即当前mapping对象的部分内容）
   * @param from 开始位置，默认值为0
   * @param to 结束位置，默认值为mapping.maps.length
   * @returns 一个新的mapping对象
   */
  slice(from = 0, to = this.maps.length) {
    return new Mapping(this._maps, this.mirror, from, to)
  }

  /// Add a step map to the end of this mapping. If `mirrors` is
  /// given, it should be the index of the step map that is the mirror
  /// image of this one.
  /**
   * 向当前mapping对象添加一个stepMap。
   * 如果传入`mirror`，这个值应该是当前stepMap镜像的stepMap的索引
   * @param map 一个stepMap对象
   * @param mirrors 当前传入的stepMap的镜像的索引
   */
  appendMap(map: StepMap, mirrors?: number) {
    if (!this.ownData) {
      this._maps = this._maps.slice()
      this.mirror = this.mirror && this.mirror.slice()
      this.ownData = true
    }
    this.to = this._maps.push(map)
    if (mirrors != null) this.setMirror(this._maps.length - 1, mirrors)
  }

  /// Add all the step maps in a given mapping to this one (preserving
  /// mirroring information).
  /**
   * 将传入的mapping对象中的所有的stepMap都添加到当前的mapping对象中（保留镜像信息）
   * @param mapping mapping对象，这个对象里的所有stepMap都会被添加到当前的mapping中
   */
  appendMapping(mapping: Mapping) {
    for (let i = 0, startSize = this._maps.length; i < mapping._maps.length; i++) {
      let mirr = mapping.getMirror(i)
      // mirror只会经前前面已有的stepMap
      this.appendMap(mapping._maps[i], mirr != null && mirr < i ? startSize + mirr : undefined)
    }
  }

  /// Finds the offset of the step map that mirrors the map at the
  /// given offset, in this mapping (as per the second argument to
  /// `appendMap`).
  /**
   * 查找传入索引指向的stepMap的镜像stepMap的索引，当前mapping对象appendMap时的第二个参数
   * （这里的解释太绕了，就是获取传入索引的stepMap的镜像的索引）
   * @param n stepMap的索引
   * @returns 如果索引指向的stepMap有对应的镜像则返回该镜像的索引否则undefined
   */
  getMirror(n: number): number | undefined {
    if (this.mirror) for (let i = 0; i < this.mirror.length; i++)
      if (this.mirror[i] == n) return this.mirror[i + (i % 2 ? -1 : 1)]
  }

  /// @internal
  /**
   * 建立n、m指向的stepMap的镜像关系
   * @param n 当前stepMap的索引
   * @param m 镜像setpMap的索引
   */
  setMirror(n: number, m: number) {
    if (!this.mirror) this.mirror = []
    this.mirror.push(n, m)
  }

  /// Append the inverse of the given mapping to this one.
  /**
   * 将传入的mapping对象反转后添加到当前mapping上
   * @param mapping 需要被反转的mapping对象
   */
  appendMappingInverted(mapping: Mapping) {
    for (let i = mapping.maps.length - 1, totalSize = this._maps.length + mapping._maps.length; i >= 0; i--) {
      let mirr = mapping.getMirror(i)
      this.appendMap(mapping._maps[i].invert(), mirr != null && mirr > i ? totalSize - mirr - 1 : undefined)
    }
  }

  /// Create an inverted version of this mapping.
  /**
   * 创建当前mapping对象的反转mapping对象
   * @returns 当前mapping对象的反转版本
   */
  invert() {
    let inverse = new Mapping
    inverse.appendMappingInverted(this)
    return inverse
  }

  /// Map a position through this mapping.
  /**
   * 通过当前mapping对象映射指定位置
   * @param pos 需要被映射的位置
   * @param assoc 关联方向
   * @returns 对应的映射位置
   */
  map(pos: number, assoc = 1) {
    // 存在镜像时使用当前mapping实例的_map方法计算（对镜像的stepMap有加速）
    if (this.mirror) return this._map(pos, assoc, true) as number
    // 不存在镜像时直接根据当前mapping对象上的stepMaps一个个映射
    for (let i = this.from; i < this.to; i++)
      pos = this._maps[i].map(pos, assoc)
    return pos
  }

  /// Map a position through this mapping, returning a mapping
  /// result.
  /**
   * 通过当前mapping对象映射指定位置
   * @param pos 需要被映射的位置
   * @param assoc 关联方向
   * @returns 对应的映射位置的mapResult
   */
  mapResult(pos: number, assoc = 1) { return this._map(pos, assoc, false) as MapResult }

  /// @internal
  /**
   * 内部使用的获取指定位置的映射信息
   * @param pos 需要被映射的位置
   * @param assoc 关联方向
   * @param simple 是否返回简单位置 true返回一个数字标识位置 false返回一个mapResult标识位置
   * @returns number|mapResult
   */
  _map(pos: number, assoc: number, simple: boolean) {
    let delInfo = 0

    for (let i = this.from; i < this.to; i++) {
      let map = this._maps[i], result = map.mapResult(pos, assoc)
      // 加速映射  stepMap.recover和mirror都是为了加速计算映射位置的属性
      if (result.recover != null) {
        let corr = this.getMirror(i)
        if (corr != null && corr > i && corr < this.to) {
          i = corr
          pos = this._maps[corr].recover(result.recover)
          continue
        }
      }

      delInfo |= result.delInfo
      pos = result.pos
    }

    return simple ? pos : new MapResult(pos, delInfo, null)
  }
}
