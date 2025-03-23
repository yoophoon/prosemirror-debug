import {Fragment} from "./fragment"
import {Node} from "./node"
import {Schema, NodeType, MarkType} from "./schema"
import {Mark} from "./mark"
import {DOMNode} from "./dom"

/// A description of a DOM structure. Can be either a string, which is
/// interpreted as a text node, a DOM node, which is interpreted as
/// itself, a `{dom, contentDOM}` object, or an array.
///
/// An array describes a DOM element. The first value in the array
/// should be a string—the name of the DOM element, optionally prefixed
/// by a namespace URL and a space. If the second element is plain
/// object, it is interpreted as a set of attributes for the element.
/// Any elements after that (including the 2nd if it's not an attribute
/// object) are interpreted as children of the DOM elements, and must
/// either be valid `DOMOutputSpec` values, or the number zero.
///
/// The number zero (pronounced “hole”) is used to indicate the place
/// where a node's child nodes should be inserted. If it occurs in an
/// output spec, it should be the only child element in its parent
/// node.
/**
 * DOM结构描述符。可以是一个字符串(会被认为是文本节点)，一个DOM节点会被认为是它本身，
 * 一个{dom, contentDOM}对象或者一个数组  
 * 数组描述一个DOM元素，第一个元素应该是DOM元素的标签名(可以用命名空间url或者空格作为前缀)。
 * 如果第二个元素是一个素对象则会被认为是元素的属性。之后的任何元素都会被认为是子元素
 * 并且必须是有效的`DOMOutputSpec`值或者是数字0。  
 * 0发音`hole`(洞)被用来表明节点的子节点应该被插入的地方。如果它出现在输出规范中，
 * 那这应该是它父元素唯一一个子元素
 */
export type DOMOutputSpec = string | DOMNode | {dom: DOMNode, contentDOM?: HTMLElement} | readonly [string, ...any[]]

/// A DOM serializer knows how to convert ProseMirror nodes and
/// marks of various types to DOM nodes.
/** DOM序列化器知道怎么把pm-nodes&marks转换成不同的DOM节点 */
export class DOMSerializer {
  /// Create a serializer. `nodes` should map node names to functions
  /// that take a node and return a description of the corresponding
  /// DOM. `marks` does the same for mark names, but also gets an
  /// argument that tells it whether the mark's content is block or
  /// inline content (for typical use, it'll always be inline). A mark
  /// serializer may be `null` to indicate that marks of that type
  /// should not be serialized.
  /**
   * 创建一个序列化器。`node`应该映射节点名称到函数(接受一个节点并返回对应的DOM描述符)。
   * `marks`也一样但会接受一个表明被标记的内容是块还是内联内容的参数(通常来说它会是内联的)。
   * mark序列化器也许会是`null`以表明这种类型的mark不应该被序列化
   * @param nodes 节点序列化函数
   * @param marks mark序列化函数
   */
  constructor(
    /// The node serialization functions.
    /** 节点序列化函数 */
    readonly nodes: {[node: string]: (node: Node) => DOMOutputSpec},
    /// The mark serialization functions.
    /** mark序列化函数 */
    readonly marks: {[mark: string]: (mark: Mark, inline: boolean) => DOMOutputSpec}
  ) {}

  /// Serialize the content of this fragment to a DOM fragment. When
  /// not in the browser, the `document` option, containing a DOM
  /// document, should be passed so that the serializer can create
  /// nodes.
  /**
   * 将当前fragment的内容序列化成DOMFragment。当不在浏览器环境时，
   * `document`选项应该被明确明确以让当前序列化器能创建节点  
   * (内部嵌套的节点会通过递归处理，最终结果是documentFragment为顶层节点的DOM树)
   * @param fragment 文档片段
   * @param options 选项
   * @param target 目标对象
   * @returns 一个documentFragment对象表示当前pm-fragment
   */
  serializeFragment(fragment: Fragment, options: {document?: Document} = {}, target?: HTMLElement | DocumentFragment) {
    if (!target) target = doc(options).createDocumentFragment()

    let top = target!, 
        active: [Mark, HTMLElement | DocumentFragment][] = []
    // 对当前文档的子节点进行遍历
    fragment.forEach(node => {
      // 如果激活的mark数量不为0或者节点的marks数量不为0
      if (active.length || node.marks.length) {
        let keep = 0, rendered = 0
        while (keep < active.length && rendered < node.marks.length) {
          let next = node.marks[rendered]
          // 节点指定的mark在markSpec中没有定义
          if (!this.marks[next.type.name]) { rendered++; continue }
          // 如果当前mark和即将要应用的mark不相等或mark不能跨节点
          // (不能跨节点的mark必然不能从前一个node延续到当前node)
          if (!next.eq(active[keep][0]) || next.type.spec.spanning === false) break
          keep++; rendered++
        }
        // 将最低层级mark所表示的DOM弹出并赋值给top，方便复用mark创建的DOM
        while (keep < active.length) top = active.pop()![1]
        while (rendered < node.marks.length) {
          let add = node.marks[rendered++]
          let markDOM = this.serializeMark(add, node.isInline, options)
          if (markDOM) {
            active.push([add, top])
            top.appendChild(markDOM.dom)
            top = markDOM.contentDOM || markDOM.dom as HTMLElement
          }
        }
      }
      // 深入子节点继续处理节点序列化为DOM的工作
      top.appendChild(this.serializeNodeInner(node, options))
    })

    return target
  }

  /// @internal
  /**
   * 如果DOMOutputSpec没有指定洞则contentDOM为DOM的子节点否则contentDOM为DOM本身
   * @param node 节点实例
   * @param options 包含Document的对象
   * @returns 
   */
  serializeNodeInner(node: Node, options: {document?: Document}) {
    let {dom, contentDOM} =
      renderSpec(doc(options), this.nodes[node.type.name](node), null, node.attrs)
    if (contentDOM) {
      if (node.isLeaf)
        // 如果当前节点存在内容节点当其节点类型又是叶子节点则抛出错误
        throw new RangeError("Content hole not allowed in a leaf node spec")
      this.serializeFragment(node.content, options, contentDOM)
    }
    return dom
  }

  /// Serialize this node to a DOM node. This can be useful when you
  /// need to serialize a part of a document, as opposed to the whole
  /// document. To serialize a whole document, use
  /// [`serializeFragment`](#model.DOMSerializer.serializeFragment) on
  /// its [content](#model.Node.content).
  /**
   * 将pm-node序列化成DOM节点。这在需要将文档的一部分(非全部文档)序列化成DOM节点时很有用。
   * 需要序列化整个文档时采用`serializerFragment`将其内容序列化  
   * (这里说的整个文档应该是指doc，因为当前方法会为节点套上mark，而一般顶层节点不需要做这些，
   * 直接使用`serializerFragment`更直接)
   * @param node 节点实例
   * @param options 包含Document的对象
   * @returns 表示当前节点实例的DOM，节点的marks会被应用到DOM上
   */
  serializeNode(node: Node, options: {document?: Document} = {}) {
    let dom = this.serializeNodeInner(node, options)
    for (let i = node.marks.length - 1; i >= 0; i--) {
      let wrap = this.serializeMark(node.marks[i], node.isInline, options)
      if (wrap) {
        ;(wrap.contentDOM || wrap.dom).appendChild(dom)
        dom = wrap.dom
      }
    }
    return dom
  }

  /// @internal
  /**
   * @param mark Mark
   * @param inline boolean 是否为内联
   * @param options 包含指定Document的对象
   * @returns 序列化当前mark实例生成{DOM, contentDOM}
   */
  serializeMark(mark: Mark, inline: boolean, options: {document?: Document} = {}) {
    // 序列化函数
    let toDOM = this.marks[mark.type.name]
    return toDOM && renderSpec(doc(options), toDOM(mark, inline), null, mark.attrs)
  }

  /// Render an [output spec](#model.DOMOutputSpec) to a DOM node. If
  /// the spec has a hole (zero) in it, `contentDOM` will point at the
  /// node with the hole.
  /**
   * 将DOMOutputSpec对象渲染成一个DOM节点。如果规范有洞(0)存在，它的`contentDOM`将会指向这个带有洞的DOM节点
   * @param doc window.document
   * @param structure DOMOutputSpec
   * @param xmlNS xmlNameSpace
   */
  static renderSpec(doc: Document, structure: DOMOutputSpec, xmlNS?: string | null): {
    dom: DOMNode,
    contentDOM?: HTMLElement
  }
  static renderSpec(doc: Document, structure: DOMOutputSpec, xmlNS: string | null = null,
                    blockArraysIn?: {[name: string]: any}): {
    dom: DOMNode,
    contentDOM?: HTMLElement
  } {
    return renderSpec(doc, structure, xmlNS, blockArraysIn)
  }

  /// Build a serializer using the [`toDOM`](#model.NodeSpec.toDOM)
  /// properties in a schema's node and mark specs.
  /**
   * 使用schema的节点和mark规范中的`toDOM`属性构建一个DOMSerializer  
   * (会尝试在schema.cached属性上查找domSerializer，如果没有则根据传入的schema
   * 重新生成一个DOMSerializer并将其缓存在schema.cached.domSerialier上)
   * @param schema 文档架构
   * @returns DOMSerializer
   */
  static fromSchema(schema: Schema): DOMSerializer {
    return schema.cached.domSerializer as DOMSerializer ||
      (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)))
  }

  /// Gather the serializers in a schema's node specs into an object.
  /// This can be useful as a base to build a custom serializer from.
  /**
   * 将架构的节点规范的序列化器聚集到一个对象上。这作为构建一个自定义序列化器的基础是很有用的  
   * 函数会自动补上文本节点的序列化器
   * @param schema 文档架构
   * @returns 一个包含所有节点的toDOM序列化器对象
   */
  static nodesFromSchema(schema: Schema) {
    let result = gatherToDOM(schema.nodes)
    if (!result.text) result.text = node => node.text
    return result as {[node: string]: (node: Node) => DOMOutputSpec}
  }

  /// Gather the serializers in a schema's mark specs into an object.
  /**
   * 将架构的mark规范的序列化器聚集到一个对象上
   * @param schema 文档架构
   * @returns 一个包含所有mark的toDOM序列化器对象
   */
  static marksFromSchema(schema: Schema) {
    return gatherToDOM(schema.marks) as {[mark: string]: (mark: Mark, inline: boolean) => DOMOutputSpec}
  }
}
/**
 * 返回一个{[nodeType.name:string]:schema.nodes[nodeType.name].spec.toDOM}对象
 * @param obj schema.nodes||schema.marks
 * @returns 返回包含所有字段的
 */
function gatherToDOM(obj: {[node: string]: NodeType | MarkType}) {
  let result: {[node: string]: (value: any, inline: boolean) => DOMOutputSpec} = {}
  for (let name in obj) {
    let toDOM = obj[name].spec.toDOM
    if (toDOM) result[name] = toDOM
  }
  return result
}
/**
 * 获取Document对象
 * @param options 包含文档对象的配置
 * @returns 返回配置中的文档对象或者返回窗口的文档对象
 */
function doc(options: {document?: Document}) {
  return options.document || window.document
}

const suspiciousAttributeCache = new WeakMap<any, readonly any[] | null>()
/**
 * 这个函数会首先查找缓存，如果指定的对象有其缓存的信息则直接返回其缓存信息，
 * 否则根据传入的对象获取其内部的属性缓存并返回
 * @param attrs 属性对象
 * @returns 获取对象及其内部的属性并将其作为数组返回
 */
function suspiciousAttributes(attrs: {[name: string]: any}): readonly any[] | null {
  let value = suspiciousAttributeCache.get(attrs)
  if (value === undefined)
    suspiciousAttributeCache.set(attrs, value = suspiciousAttributesInner(attrs))
  return value
}
/**
 * @param attrs 属性对象
 * @returns 获取对象及其内部的属性并将其作为数组返回
 */
function suspiciousAttributesInner(attrs: {[name: string]: any}): readonly any[] | null {
  let result: any[] | null = null
  function scan(value: any) {
    if (value && typeof value == "object") {
      // 数组
      if (Array.isArray(value)) {
        if (typeof value[0] == "string") {
          if (!result) result = []
          result.push(value)
        } else {
          // 如果当前元素类型不是字符串则递归处理
          for (let i = 0; i < value.length; i++) scan(value[i])
        }
      } else {
      // 其余的可枚举对象 对其键值进行递归处理
        for (let prop in value) scan(value[prop])
      }
    }
  }
  scan(attrs)
  return result
}

/**
 * 
 * @param doc 文档对象 一般为window.document
 * @param structure DOMOutputSpec 文档输出结构
 * @param xmlNS xml命名空间  XMLNameSpace
 * @param blockArraysIn 
 * @returns 
 */
function renderSpec(doc: Document, structure: DOMOutputSpec, xmlNS: string | null,
                    blockArraysIn?: {[name: string]: any}): {
  dom: DOMNode,
  contentDOM?: HTMLElement
} {
  // 如果structure为字符串
  if (typeof structure == "string")
    return {dom: doc.createTextNode(structure)}
  if ((structure as DOMNode).nodeType != null)
    return {dom: structure as DOMNode}
  if ((structure as any).dom && (structure as any).dom.nodeType != null)
    return structure as {dom: DOMNode, contentDOM?: HTMLElement}
  let tagName = (structure as [string])[0], suspicious
  if (typeof tagName != "string") throw new RangeError("Invalid array passed to renderSpec")
  // [看仓库提交历史 作者是想要避免跨域脚本攻击](https://github.com/ProseMirror/prosemirror-model/commit/6e977d7e43b6074d73414a7f6429e310e8f15546)
  // 如果节点属性存在当前DOMOutputSpec数组信息则抛出错误
  if (blockArraysIn && (suspicious = suspiciousAttributes(blockArraysIn)) &&
      suspicious.indexOf(structure) > -1)
    throw new RangeError("Using an array from an attribute object as a DOM spec. This may be an attempted cross site scripting attack.")
  let space = tagName.indexOf(" ")
  if (space > 0) {
    xmlNS = tagName.slice(0, space)
    tagName = tagName.slice(space + 1)
  }
  let contentDOM: HTMLElement | undefined
  let dom = (xmlNS ? doc.createElementNS(xmlNS, tagName) : doc.createElement(tagName)) as HTMLElement
  // 获取节点属性 start应该是子元素位置的索引
  let attrs = (structure as any)[1], start = 1
  // 属性存在且属性是一个对象但不是数组且属性对象没有nodeType属性
  if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
    start = 2
    // 遍历属性对象并将其值赋给DOM
    for (let name in attrs) if (attrs[name] != null) {
      // prosemirror对于元素属性采用命名空间是用`namespace name:attribute`的形式
      let space = name.indexOf(" ")
      if (space > 0) dom.setAttributeNS(name.slice(0, space), name.slice(space + 1), attrs[name])
      else dom.setAttribute(name, attrs[name])
    }
  }
  for (let i = start; i < (structure as readonly any[]).length; i++) {
    let child = (structure as any)[i] as DOMOutputSpec | 0
    // 如果节点是子元素占位符0(hole)
    if (child === 0) {
      if (i < (structure as readonly any[]).length - 1 || i > start)
        throw new RangeError("Content hole must be the only child of its parent node")
      return {dom, contentDOM: dom}
    // 其他节点 一个DOMOutputSpec只允许有一个contentDOM
    } else {
      let {dom: inner, contentDOM: innerContent} = renderSpec(doc, child, xmlNS, blockArraysIn)
      dom.appendChild(inner)
      if (innerContent) {
        if (contentDOM) throw new RangeError("Multiple content holes")
        contentDOM = innerContent as HTMLElement
      }
    }
  }
  return {dom, contentDOM}
}
