import {Fragment} from "./fragment"
import {NodeType} from "./schema"

/** 状态边界含有两个属性 type内容输入节点类型 next对应输入内容跳转的下一状态 */
type MatchEdge = {type: NodeType, next: ContentMatch}

/// Instances of this class represent a match state of a node type's
/// [content expression](#model.NodeSpec.content), and can be used to
/// find out whether further content matches here, and whether a given
/// position is a valid end of the node.
/** ContentMatch类实例表示一个节点的内容表达式的匹配状态，以及可以用于找出是否有更深的内容能被当前节点匹配
 * 以及指定的位置是否是当前节点的有效终点(即如果匹配到该类节点则不往下继续匹配了)  
 * (内容node.content 自动机)
 */
export class ContentMatch {
  /// @internal
  /** 当前节点接受输入内容的状态边界  匹配边界 {nodeType, contentMatch}[] */
  readonly next: MatchEdge[] = []
  /// @internal
  /** 包裹缓存 这个属性的长度为偶数因为计数位存储对应的被包裹的节点类型对应偶数位则存储包裹该节点类型的路径 */
  readonly wrapCache: (NodeType | readonly NodeType[] | null)[] = []

  /// @internal
  constructor(
    /// True when this match state represents a valid end of the node.
    /** 当前匹配状态表示节点的有效终止状态时true */
    readonly validEnd: boolean
  ) {}

  /// @internal
  //MARK ContentMatch.parse
  /**
   * 根据指定的内容表达式、节点类型解析出一个内容匹配状态机
   * @param string contentExpr 内容表达式表示能作为当前节点类型子节点的节点类型
   * @param nodeTypes 节点类型 一般为schema.nodes 当前架构的所有节点类型
   * @returns 一个内容匹配自动机
   */
  static parse(string: string, nodeTypes: {readonly [name: string]: NodeType}): ContentMatch {
    // 将传入的内容表达式和节点类型转换为标记流对象
    let stream = new TokenStream(string, nodeTypes)
    // 如果第一个标记为null意味着没有内容表达式，则返回一个空的内容匹配自动机
    if (stream.next == null) return ContentMatch.empty
    // 解析标记流 将标记流根据其自带的节点类型转换成可操作的对象
    let expr = parseExpr(stream)
    // 标记流解析完之后 stream.next应该指向undefined，因为内部标记应该全部消耗完
    // 如果解析过程中有标记被遗漏没解析到则抛出错误
    if (stream.next) stream.err("Unexpected trailing text")
    // 生成内容匹配自动机
    let match = dfa(nfa(expr))
    // 如果有死状态则抛出错误
    checkForDeadEnds(match, stream)
    return match
  }

  /// Match a node type, returning a match after that node if
  /// successful.
  /**
   * 匹配一个节点类型，如果成功则返回该节点类型的内容匹配自动机  
   * (指定节点是否为当前状态的边界节点类型)  
   * @param type 节点类型
   * @returns 查询当前节点的内容子节点的contentMatch
   */
  matchType(type: NodeType): ContentMatch | null {
    for (let i = 0; i < this.next.length; i++)
      if (this.next[i].type == type) return this.next[i].next
    return null
  }

  /// Try to match a fragment. Returns the resulting match when
  /// successful.
  /**
   * 尝试匹配一个文档片段。当成功时返回匹配成功的内容匹配自动机状态  
   * 用传入的文档片段的开始位置到结束位置的节点类型去匹配当前内容匹配自动机的状态边界  
   * 如果文档片段最后一个节点类型能作为内容匹配机的输入边界则返回这个边界，否则返回null
   * @param frag 文档片段
   * @param start 开始位置 默认为0即第一个子节点
   * @param end 结束位置，默认为该文档片段的子节点数量
   * @returns 内容匹配自动机(contentMatch)或者null
   */
  matchFragment(frag: Fragment, start = 0, end = frag.childCount): ContentMatch | null {
    let cur: ContentMatch | null = this
    for (let i = start; cur && i < end; i++)
      cur = cur.matchType(frag.child(i).type)
    return cur
  }

  /// @internal
  /** 当前状态边界数量不为0且边界节点类型是内联节点
   * 当前状态是否接受内联内容 当前状态边界的节点类型是否是内联的 */
  get inlineContent() {
    return this.next.length != 0 && this.next[0].type.isInline
  }

  /// Get the first matching node type at this match position that can
  /// be generated.
  /**获取当前状态第一个边界非文本非必需属性节点类型  */
  get defaultType(): NodeType | null {
    for (let i = 0; i < this.next.length; i++) {
      let {type} = this.next[i]
      if (!(type.isText || type.hasRequiredAttrs())) return type
    }
    return null
  }

  /// @internal
  /**
   * 将传入的内容匹配自动机与当前内容匹配自动机的边界节点类型进行遍历比较如果存在相同的边界节点类型
   * 则认为两个内容匹配自动机是兼容的
   * @param other 另一个内容匹配自动机
   * @returns 如果当前内容匹配自动机与传入的内容匹配自动机兼容则返回true否则返回false
   */
  compatible(other: ContentMatch) {
    for (let i = 0; i < this.next.length; i++)
      for (let j = 0; j < other.next.length; j++)
        if (this.next[i].type == other.next[j].type) return true
    return false
  }

  /// Try to match the given fragment, and if that fails, see if it can
  /// be made to match by inserting nodes in front of it. When
  /// successful, return a fragment of inserted nodes (which may be
  /// empty if nothing had to be inserted). When `toEnd` is true, only
  /// return a fragment if the resulting match goes to the end of the
  /// content expression.
  /**
   * 尝试使用当前节点类型的内容匹配自动机匹配传入的fragment，如果失败了，查看能否通过在fragment前面
   * 插入节点以成功匹配。当匹配成功，返回被插入过节点
   * (也许不会被插入节点如果fragment不需要插入节点就能匹配成功的话)的fragment。
   * 当`toEnd`为true时，只会返回匹配结果完全通过内容表达式的fragment  
   * 这里是指指定的fragment必须是当前内容匹配自动机的终止状态  
   * (比如 contentMatch.fillBefore(Fragment.empty, true)要求内容节点是一系列节点以满足
   * 如"heading paragraph+"这样的
   * [contentExpression](https://prosemirror.net/docs/guide/#schema.content_expressions))
   * @param after 文档片段 被用来与当前内容自动机的状态边界节点类型比较
   * @param toEnd 
   * @param startIndex 开始索引 默认值为0，从开始索引处匹配传入的fragment
   * @returns 如果指定fragment能通过当前内容匹配自动机则返回该路径否则返回null 路径中间可能被自动填充
   */
  fillBefore(after: Fragment, toEnd = false, startIndex = 0): Fragment | null {
    let seen: ContentMatch[] = [this]
    function search(match: ContentMatch, types: readonly NodeType[]): Fragment | null {
      // 传入的fragment是否能通过当前内容匹配自动机
      let finished = match.matchFragment(after, startIndex)
      // 通过且到达终止状态或通过但不要求达到终止状态
      if (finished && (!toEnd || finished.validEnd))
        // 返回对应类型的空内容节点文档片段
        return Fragment.from(types.map(tp => tp.createAndFill()!))
      // 如果当前节点的内容匹配自动机没通过匹配或没有到达终止状态并且toEnd(为true即完全通过内容匹配自动机)
      // 
      for (let i = 0; i < match.next.length; i++) {
        let {type, next} = match.next[i]
        // 非文本节点或非必要属性节点且自动机中不包含对应节点类型的状态
        if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
          seen.push(next)
          let found = search(next, types.concat(type))
          if (found) return found
        }
      }
      return null
    }

    return search(this, [])
  }

  /// Find a set of wrapping node types that would allow a node of the
  /// given type to appear at this position. The result may be empty
  /// (when it fits directly) and will be null when no such wrapping
  /// exists.
  /**
   * 找到能允许指定类型的节点出现在当前位置的一系列包裹节点。结果可能是空的([])如果当前内容匹配自动机
   * 刚好能匹配指定节点类型也可能是null如果当前节点匹配机不能匹配指定类型节点  
   * 优先在当前contentMatch.wrapCache中查找否则会将新内容推入到缓存中，这个包裹节点可以理解为一个路径
   * @param target 目标节点
   * @returns 
   */
  findWrapping(target: NodeType): readonly NodeType[] | null {
    for (let i = 0; i < this.wrapCache.length; i += 2)
      if (this.wrapCache[i] == target) return this.wrapCache[i + 1] as (readonly NodeType[] | null)
    let computed = this.computeWrapping(target)
    this.wrapCache.push(target, computed)
    return computed
  }

  /// @internal
  /**
   * 根据指定的节点类型沿着内容匹配机的状态创建一条路径
   * @param target 指定的节点类型
   * @returns 
   */
  computeWrapping(target: NodeType): readonly NodeType[] | null {
    type Active = {match: ContentMatch, type: NodeType | null, via: Active | null}
    let seen = Object.create(null), active: Active[] = [{match: this, type: null, via: null}]
    while (active.length) {
      let current = active.shift()!, match = current.match
      if (match.matchType(target)) {
        let result: NodeType[] = []
        for (let obj: Active = current; obj.type; obj = obj.via!)
          result.push(obj.type)
        // 上面的for循环是沿着路径向上push的 reverse应该是从上层到内容节点
        return result.reverse()
      }
      for (let i = 0; i < match.next.length; i++) {
        let {type, next} = match.next[i]
        if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
          active.push({match: type.contentMatch, type, via: current})
          seen[type.name] = true
        }
      }
    }
    return null
  }

  /// The number of outgoing edges this node has in the finite
  /// automaton that describes the content expression.
  /** 描述内容表达式的有限自动机当前状态拥有的状态转移边界数量 */
  get edgeCount() {
    return this.next.length
  }

  /// Get the _n_​th outgoing edge from this node in the finite
  /// automaton that describes the content expression.
  /**
   * 获取描述内容表达式的有限自动机当前状态第n个状态转移边界
   * @param n 指定输出边界索引
   * @returns 自动机中指定索引的匹配边界
   */
  edge(n: number): MatchEdge {
    if (n >= this.next.length) throw new RangeError(`There's no ${n}th edge in this content match`)
    return this.next[n]
  }

  /// @internal
  /** 获取当前内容表达式有限自动机的状态转移字符串 
   * next[i].next状态中的自动机是其自身 */
  toString() {
    let seen: ContentMatch[] = []
    function scan(m: ContentMatch) {
      seen.push(m)
      for (let i = 0; i < m.next.length; i++)
        if (seen.indexOf(m.next[i].next) == -1) scan(m.next[i].next)
    }
    scan(this)
    return seen.map((m, i) => {
      let out = i + (m.validEnd ? "*" : " ") + " "
      for (let i = 0; i < m.next.length; i++)
        out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next)
      return out
    }).join("\n")
  }

  /// @internal
  /** 创建一个终止状态的内容匹配自动机 */
  static empty = new ContentMatch(true)
}
/** 标记流，将传进来的contentExpr(内容表达式)转换成标记流存储 */
class TokenStream {
  inline: boolean | null = null
  pos = 0
  /** 标记 */
  tokens: string[]

  /**
   * 将传入的节点类型保存起来，传入的内容表达式通过正则表达式转换成标记数组
   * @param string 内容表达式(contentExpr)
   * @param nodeTypes 节点类型
   */
  constructor(
    readonly string: string,
    readonly nodeTypes: {readonly [name: string]: NodeType}
  ) {
    this.tokens = string.split(/\s*(?=\b|\W|$)/)
    // 移除数组末尾空标记
    if (this.tokens[this.tokens.length - 1] == "") this.tokens.pop()
    // 移除数组开头空标记
    if (this.tokens[0] == "") this.tokens.shift()
  }

  /** 返回当前标记流pos指向的标记 */
  get next() { return this.tokens[this.pos] }

  /**
   * @param tok 标记
   * @returns 如果当前标记流的next属性与指定的tok相等则pos++并返回当前pos或true(pos为0时返回)
   */
  eat(tok: string) { return this.next == tok && (this.pos++ || true) }

  /**
   * 抛出内容表达式不包含指定str的错误
   * @param str 标记
   */
  err(str: string): never { throw new SyntaxError(str + " (in content expression '" + this.string + "')") }
}

// 将标记流(tokenStream)的标记根据其带的节点类型转换成具体表达式对象
type Expr =
  {type: "choice", exprs: Expr[]} |                                   //对应表达式的| 即可选节点 或 可选内容 即标记流中的单个标记对应多个节点类型
  {type: "seq", exprs: Expr[]} |                                      //对应表达式的( 即以`(`开始的一系列内容
  {type: "plus", expr: Expr} |                                        //对应表达式的+ 即1个或多个
  {type: "star", expr: Expr} |                                        //对应表达式的* 即0个或多个
  {type: "opt", expr: Expr} |                                         //对应表达式的? 即0个或1个
  {type: "range", min: number, max: number, expr: Expr} |             //对应表达式的{ 即以`{`开始的一系列内容
  {type: "name", value: NodeType}                                     //对应表达式的\w 即内容表达式所表示的节点类型名称

  /**
   * 解析表达式
   * @param stream 标记流对象
   * @returns 返回根据标记流和标记流的节点类型生成的一个具体表达式对象
   */
function parseExpr(stream: TokenStream): Expr {
  let exprs: Expr[] = []
  do { exprs.push(parseExprSeq(stream)) }
  while (stream.eat("|"))
  return exprs.length == 1 ? exprs[0] : {type: "choice", exprs}
}
/**
 * 解析表达式序列
 * @param stream 标记流对象
 * @returns 
 */
function parseExprSeq(stream: TokenStream): Expr {
  let exprs: Expr[] = []
  do { exprs.push(parseExprSubscript(stream)) }
  while (stream.next && stream.next != ")" && stream.next != "|")
  return exprs.length == 1 ? exprs[0] : {type: "seq", exprs}
}

/**
 * 解析表达式尾标(单词后面跟的符号)
 * @param stream 
 * @returns 
 */
function parseExprSubscript(stream: TokenStream): Expr {
  let expr = parseExprAtom(stream)
  for (;;) {
    if (stream.eat("+"))
      expr = {type: "plus", expr}
    else if (stream.eat("*"))
      expr = {type: "star", expr}
    else if (stream.eat("?"))
      expr = {type: "opt", expr}
    else if (stream.eat("{"))
      expr = parseExprRange(stream, expr)
    else break
  }
  return expr
}

/**
 * 解析数字
 * @param stream 
 * @returns 
 */
function parseNum(stream: TokenStream) {
  if (/\D/.test(stream.next)) stream.err("Expected number, got '" + stream.next + "'")
  let result = Number(stream.next)
  stream.pos++
  return result
}

/**
 * 解析表达式范围
 * @param stream 
 * @param expr 
 * @returns 
 */
function parseExprRange(stream: TokenStream, expr: Expr): Expr {
  let min = parseNum(stream), max = min
  if (stream.eat(",")) {
    if (stream.next != "}") max = parseNum(stream)
    else max = -1
  }
  if (!stream.eat("}")) stream.err("Unclosed braced range")
  return {type: "range", min, max, expr}
}
/**
 * 尝试在标记流保存的节点类型中找到对应名称的节点类型，如果没找到则抛出错误
 * @param stream 标记流
 * @param name 名称，一般为内容表达式表达的子节点类型名（也可以是节点组名）
 * @returns 返回指定名称代表的所有节点类型数组(组名对应多种节点类型)
 */
function resolveName(stream: TokenStream, name: string): readonly NodeType[] {
  let types = stream.nodeTypes, type = types[name]
  // 如果传入的节点类型名称在标记流的节点类型中有保存则以数组的形式直接返回该节点类型[nodeType]
  if (type) return [type]
  let result: NodeType[] = []
  // 遍历标记流所有节点类型
  for (let typeName in types) {
    let type = types[typeName]
    // 如果节点类型的组名称包含传入的节点名称，将对应节点类型推入结果数组中
    // (可以认为节点组名称是节点类型名称的别名，只是可以多种节点类型共用一个组命)
    if (type.isInGroup(name)) result.push(type)
  }
  // 没找到指定名称对应的节点类型 标记流抛出错误
  if (result.length == 0) stream.err("No node type or group '" + name + "' found")
  return result
}
/**
 * 解析表达式原子
 * @param stream 标记流
 * @returns 
 */
function parseExprAtom(stream: TokenStream): Expr {
  // 如果标记流的当前标记是"("标记
  if (stream.eat("(")) {
    let expr = parseExpr(stream)
    if (!stream.eat(")")) stream.err("Missing closing paren")
    return expr
  // 如果标记流的当前标记是单词(\W非单词)
  } else if (!/\W/.test(stream.next)) {
    let exprs = resolveName(stream, stream.next).map(type => {
      // 标记流inline类型与内容表达式找到的节点类型保持一致
      if (stream.inline == null) stream.inline = type.isInline
      // 如果标记流inline类型与内容表达式找到的节点类型不一致，说明出错了
      // 因为一个节点的内容不能同时存在块内容和内联内容
      else if (stream.inline != type.isInline) stream.err("Mixing inline and block content")
      // 将标记流中的单词转换为Expr对象通过map返回
      return {type: "name", value: type} as Expr
    })
    // 成功处理一个标记，索引+1
    stream.pos++
    // 如果表达式的长度为1则说明当前标记(单词)只对应一种节点类型，直接返回
    // 如果表达式的长度大于1则说明当前标记(单词)对应多个节点类型，包装一层在返回
    return exprs.length == 1 ? exprs[0] : {type: "choice", exprs}
  } else {
    //意料之外的标记 抛出错误
    stream.err("Unexpected token '" + stream.next + "'")
  }
}

// The code below helps compile a regular-expression-like language
// into a deterministic finite automaton. For a good introduction to
// these concepts, see https://swtch.com/~rsc/regexp/regexp1.html
/** 下面的代码将编译类正则表达式语言编译成确定有限自动机 这些概念的介绍可以查看上面的网址 */

/** 非确定有限机的状态边界情况 term:边界条件(节点类型) to:状态转移目标 */
type Edge = {term: NodeType | undefined, to: number | undefined}

// Construct an NFA from an expression as returned by the parser. The
// NFA is represented as an array of states, which are themselves
// arrays of edges, which are `{term, to}` objects. The first state is
// the entry state and the last node is the success state.
//
// Note that unlike typical NFAs, the edge ordering in this one is
// significant, in that it is used to contruct filler content when
// necessary.
//MARK nfa
/**
 * 从解析器返回的表达式中构造一个NFA。NFA是一个包含自身边界({term, to}对象)数组的数组状态
 * 第一个状态是入口状态而最后一个则是成功状态
 * @param expr 表达式
 * @returns NFA
 */
function nfa(expr: Expr): Edge[][] {
  let nfa: Edge[][] = [[]]
  // 创建一个新状态并将编译结果连接新状态
  connect(compile(expr, 0), node())
  return nfa
  // 生成一个状态并返回该状态索引
  function node() { return nfa.push([]) - 1 }
  /**
   * 创建一个从from状态到to状态的边界
   * @param from 开始状态索引
   * @param to 目标状态索引
   * @param term 当前状态的边界类型(节点类型或undefined)
   * @returns 返回一个状态的边界
   */
  function edge(from: number, to?: number, term?: NodeType) {
    let edge = {term, to}
    nfa[from].push(edge)
    return edge
  }
  /**
   * 连接边界到目标状态`状态转移`
   * @param edges 边界
   * @param to 目标状态
   */
  function connect(edges: Edge[], to: number) {
    edges.forEach(edge => edge.to = to)
  }
  /**
   * 根据表达式及初始状态编译NFA
   * @param expr 表达式
   * @param from 开始状态
   */
  function compile(expr: Expr, from: number): Edge[] {
    // 如果当前表达式的类型是"choice"则意味着有多个子表达式 将子表达式分别编译并连接后返回
    if (expr.type == "choice") {
      return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), [] as Edge[])
    // 如果当前表达式的类型是"seq" 对应"|"
    // 在当前状态循环处理子表达式
    // 返回最后一个子表达式的处理结果
    // 非最后子表达式处理结果则连接到新状态并将当前状态指向新状态
    } else if (expr.type == "seq") {
      for (let i = 0;; i++) {
        let next = compile(expr.exprs[i], from)
        if (i == expr.exprs.length - 1) return next
        connect(next, from = node())
      }
    // 如果当前表达式的类型是"star" 对应"*"
    // 生成一个新状态
    // 在当前状态创建一条转移到新状态的边界
    // 在新状态编译子表达式并将其结果连接到新状态
    // 创建一个新状态的边界并返回
    } else if (expr.type == "star") {
      let loop = node()
      edge(from, loop)
      connect(compile(expr.expr, loop), loop)
      return [edge(loop)]
    // 如果当前表达式的类型是"plus" 对应"+"
    // 创建一个新状态
    // 在当前状态和新状态编译子表达式并连接至新状态
    // 在新状态创建一条边并返回
    } else if (expr.type == "plus") {
      let loop = node()
      connect(compile(expr.expr, from), loop)
      connect(compile(expr.expr, loop), loop)
      return [edge(loop)]
    // 如果当前表达式的类型是"opt" 对应"?"
    // 在当前状态创建一条边并将当前状态的子表达时在当前状态编译返回的结果与新创建的边连和并返回
    } else if (expr.type == "opt") {
      return [edge(from)].concat(compile(expr.expr, from))
    // 如果当前表达式是"range" 对应"{min, max?}"
    } else if (expr.type == "range") {
      let cur = from
      for (let i = 0; i < expr.min; i++) {
        let next = node()
        connect(compile(expr.expr, cur), next)
        cur = next
      }
      if (expr.max == -1) {
        connect(compile(expr.expr, cur), cur)
      } else {
        for (let i = expr.min; i < expr.max; i++) {
          let next = node()
          edge(cur, next)
          connect(compile(expr.expr, cur), next)
          cur = next
        }
      }
      return [edge(cur)]
    // 如果当前表达式的类型为"name"
    // 在当前状态创建一条将表达式值作为类型的边界
    } else if (expr.type == "name") {
      return [edge(from, undefined, expr.value)]
    // 抛出错误 未知表达式类型
    } else {
      throw new Error("Unknown expr type")
    }
  }
}

function cmp(a: number, b: number) { return b - a }

// Get the set of nodes reachable by null edges from `node`. Omit
// nodes with only a single null-out-edge, since they may lead to
// needless duplicated nodes.
/**
 * 获取能被状态的空边界到达的状态集合。忽略只有单个空跳转边界，因为它们可能导致不必要的重复状态
 * @param nfa 非确定有限自动机
 * @param node 状态节点下标
 * @returns 当前状态空边界能到达的状态集合
 */
function nullFrom(nfa: Edge[][], node: number): readonly number[] {
  let result: number[] = []
  scan(node)
  return result.sort(cmp)

  function scan(node: number): void {
    let edges = nfa[node]
    if (edges.length == 1 && !edges[0].term) return scan(edges[0].to!)
    result.push(node)
    for (let i = 0; i < edges.length; i++) {
      let {term, to} = edges[i]
      if (!term && result.indexOf(to!) == -1) scan(to!)
    }
  }
}

// Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
// of state objects (`ContentMatch` instances) with transitions
// between them.
/**
 * 将一个由`nfa`函数生成的NFA编译成一个DFA，以一系列状态对象(`ContentMatch`实例)为模型并在它们之间转换
 * @param nfa 非确定有限自动机
 * @returns 确定有限自动机
 */
function dfa(nfa: Edge[][]): ContentMatch {
  let labeled = Object.create(null)
  return explore(nullFrom(nfa, 0))
  // 探索指定的状态
  function explore(states: readonly number[]) {
    let out: [NodeType, number[]][] = []
    // 遍历状态
    states.forEach(node => {
      // 遍历指定状态的边界
      nfa[node].forEach(({term, to}) => {
        // 如果边界类型未定义 直接返回
        if (!term) return
        let set: number[] | undefined
        // 将set指向当前状态边界类型的路径
        for (let i = 0; i < out.length; i++) 
          if (out[i][0] == term) 
            set = out[i][1]
        // 遍历空边界转移的状态
        nullFrom(nfa, to!).forEach(node => {
          // 如果没有当前边界类型的路径则创建一个
          if (!set) 
            out.push([term, set = []])
          // 有路径则将路径添加进去
          if (set.indexOf(node) == -1) 
            set.push(node)
        })
      })
    })
    // 根据当前状态创建的内容匹配机
    let state = labeled[states.join(",")] = new ContentMatch(states.indexOf(nfa.length - 1) > -1)
    console.log(labeled)
    for (let i = 0; i < out.length; i++) {
      let states = out[i][1].sort(cmp)
      // 根据终止状态创建的内容匹配机
      state.next.push({type: out[i][0], next: labeled[states.join(",")] || explore(states)})
    }
    return state
  }
}
/**
 * 检查deadEnds(死状态)
 * @param match 内容匹配自动机
 * @param stream 标记流
 */
function checkForDeadEnds(match: ContentMatch, stream: TokenStream) {
  for (let i = 0, work = [match]; i < work.length; i++) {
    let state = work[i], dead = !state.validEnd, nodes: string[] = []
    for (let j = 0; j < state.next.length; j++) {
      let {type, next} = state.next[j]
      nodes.push(type.name)
      if (dead && !(type.isText || type.hasRequiredAttrs())) dead = false
      if (work.indexOf(next) == -1) work.push(next)
    }
    if (dead) stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)")
  }
}
