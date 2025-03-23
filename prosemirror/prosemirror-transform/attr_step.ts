import {Fragment, Slice, Node, Schema} from "prosemirror-model"
import {Step, StepResult} from "./step"
import {StepMap, Mappable} from "./map"

/// Update an attribute in a specific node.
/** AttrStep 更新指定节点的属性所产生的step */
export class AttrStep extends Step {
  /// Construct an attribute step.
  /**
   * 构造一个attrStep
   * @param pos 被更新属性的节点的位置
   * @param attr 属性的键名
   * @param value 属性的新值
   */
  constructor(
    /// The position of the target node.
    readonly pos: number,
    /// The attribute to set.
    readonly attr: string,
    // The attribute's new value.
    readonly value: any
  ) {
    super()
  }

  apply(doc: Node) {
    let node = doc.nodeAt(this.pos)
    if (!node) return StepResult.fail("No node at attribute step's position")
    let attrs = Object.create(null)
    for (let name in node.attrs) attrs[name] = node.attrs[name]
    attrs[this.attr] = this.value
    let updated = node.type.create(attrs, null, node.marks)
    // 这里最终是采用prosemirror-model/replace/replaceTwoWay方法将节点元素替换掉但保留内容
    // 符合不修改只替换的原则
    return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1))
  }

  getMap() {
    // step作用于节点属性而非节点内容 所以没有map
    return StepMap.empty
  }

  invert(doc: Node) {
    // 用指定的文档节点产生一个新的attrStep，指定的文档应该是当前attrStep.apply应用的节点
    // 从tr.docs的历史栈中获取
    return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos)!.attrs[this.attr])
  }

  map(mapping: Mappable) {
    // 通过指定的mapping更新当前attrStep.pos属性
    let pos = mapping.mapResult(this.pos, 1)
    return pos.deletedAfter ? null : new AttrStep(pos.pos, this.attr, this.value)
  }

  toJSON(): any {
    return {stepType: "attr", pos: this.pos, attr: this.attr, value: this.value}
  }

  static fromJSON(schema: Schema, json: any) {
    if (typeof json.pos != "number" || typeof json.attr != "string")
      throw new RangeError("Invalid input for AttrStep.fromJSON")
    return new AttrStep(json.pos, json.attr, json.value)
  }
}

Step.jsonID("attr", AttrStep)

/// Update an attribute in the doc node.
/** docAttrStep用于更新文档根节点的属性 */
export class DocAttrStep extends Step {
  /// Construct an attribute step.
  /**
   * 构造一个docAttrStep实例
   * @param attr 指定属性键名
   * @param value 用于更新的属性值
   */
  constructor(
    /// The attribute to set.
    readonly attr: string,
    // The attribute's new value.
    readonly value: any
  ) {
    super()
  }

  apply(doc: Node) {
    // 与attrStep.apply不同，docAttrStep.apply直接作用于指定节点上而非节点指定位置处的节点
    let attrs = Object.create(null)
    for (let name in doc.attrs) attrs[name] = doc.attrs[name]
    attrs[this.attr] = this.value
    let updated = doc.type.create(attrs, doc.content, doc.marks)
    return StepResult.ok(updated)
  }

  getMap() {
    return StepMap.empty
  }

  invert(doc: Node) {
    return new DocAttrStep(this.attr, doc.attrs[this.attr])
  }

  map(mapping: Mappable) {
    return this
  }

  toJSON(): any {
    return {stepType: "docAttr", attr: this.attr, value: this.value}
  }

  static fromJSON(schema: Schema, json: any) {
    if (typeof json.attr != "string")
      throw new RangeError("Invalid input for DocAttrStep.fromJSON")
    return new DocAttrStep(json.attr, json.value)
  }
}

Step.jsonID("docAttr", DocAttrStep)