import {ReplaceError, Schema, Slice, Node} from "prosemirror-model"

import {StepMap, Mappable} from "./map"

/** 由JSON生成的steps */
const stepsByID: {[id: string]: {fromJSON(schema: Schema, json: any): Step}} = Object.create(null)

/// A step object represents an atomic change. It generally applies
/// only to the document it was created for, since the positions
/// stored in it will only make sense for that document.
///
/// New steps are defined by creating classes that extend `Step`,
/// overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
/// methods, and registering your class with a unique
/// JSON-serialization identifier using
/// [`Step.jsonID`](#transform.Step^jsonID).
/**
 * step对象标识一个原子变化。通常只用于为其所创建的文档，
 * 因为其内部存储的`positions`只有在这个文档中才有意义
 * （有点绕，大意是说特定的step只能用于特定的文档，因为这个特定的step就是为了特定的文档被创造的）
 * 
 * 新的steps通过创建继承了`Step`并重载了`apply`,`invert`,`map`,`getMap`和`fromJSON`
 * 方法的类来定义并且使用`Step.jsonID`创建用一个独一无二的JSON-serialization标识符注册该类
 */
export abstract class Step {
  /// Applies this step to the given document, returning a result
  /// object that either indicates failure, if the step can not be
  /// applied to this document, or indicates success by containing a
  /// transformed document.
  /**
   * 将当前step应用于传入的文档，如果应用成功则放回一个成功的stepResult，如果应用失败则
   * 返回一个失败的stepResult（成功则stepResult.fail=null,失败则stepResult.doc=null）
   * @param doc 被应用当前Step的文档
   */
  abstract apply(doc: Node): StepResult

  /// Get the step map that represents the changes made by this step,
  /// and which can be used to transform between positions in the old
  /// and the new document.
  /**
   * 获取表示被当前step所做的变更的stepMap，stepMap可以用来转换新旧文档的位置信息
   * @returns 默认返回一个空的stepMap，应该是要被重载的
   */
  getMap(): StepMap { return StepMap.empty }

  /// Create an inverted version of this step. Needs the document as it
  /// was before the step as argument.
  /**
   * 返回反转到目标文档的step（这样子做就能实现撤销和取消撤销了）
   * @param doc 用于反转当前setp的文档，一般是被保存在tr中的历史node
   */
  abstract invert(doc: Node): Step

  /// Map this step through a mappable thing, returning either a
  /// version of that step with its positions adjusted, or `null` if
  /// the step was entirely deleted by the mapping.
  /**
   * 用过一个mappable对象映射当前step
   * 要么返回一个调整过位置的step要么返回`null`如果当前step完全被这个映射对象删除的话
   * @param mapping 
   */
  abstract map(mapping: Mappable): Step | null

  /// Try to merge this step with another one, to be applied directly
  /// after it. Returns the merged step when possible, null if the
  /// steps can't be merged.
  /**
   * 尝试合并当前step与给定的step（将给定的step直接应用于当前step之后）
   * @param other 另一个step
   * @returns 如果能合并则返回合并之后的step否则返回null
   */
  merge(other: Step): Step | null { return null }

  /// Create a JSON-serializeable representation of this step. When
  /// defining this for a custom subclass, make sure the result object
  /// includes the step type's [JSON id](#transform.Step^jsonID) under
  /// the `stepType` property.
  /**
   * 创建一个JSON-serializable来表示当前step。
   * 定义了这个方法的子类必须包括`stepType`属性保留step类型的JSON id
   */
  abstract toJSON(): any

  /// Deserialize a step from its JSON representation. Will call
  /// through to the step class' own implementation of this method.
  /**
   * 从一个JSON内容中反序列化生成一个step。方法会调用stepClass自己实现的fromJSON方法
   * @param schema 文档架构
   * @param json JSON对象
   * @returns 一个step对象
   */
  static fromJSON(schema: Schema, json: any): Step {
    if (!json || !json.stepType) throw new RangeError("Invalid input for Step.fromJSON")
    let type = stepsByID[json.stepType]
    if (!type) throw new RangeError(`No step type ${json.stepType} defined`)
    // 调用stepClass上的fromJSON方法生成一个step
    return type.fromJSON(schema, json)
  }

  /// To be able to serialize steps to JSON, each step needs a string
  /// ID to attach to its JSON representation. Use this method to
  /// register an ID for your step classes. Try to pick something
  /// that's unlikely to clash with steps from other modules.
  /**
   * 为了能够序列化step到JSON，每一个step都需要一个字符穿id附加到它的JSON内容上。使用这个方法
   * 为目标stepClass类注册一个ID。尝试挑选一些不与来自其他模块的step冲突的id
   * @param id 用于表示step的id
   * @param stepClass 一个包含fromJSON方法的对象
   * @returns stepClass
   */
  static jsonID(id: string, stepClass: {fromJSON(schema: Schema, json: any): Step}) {
    if (id in stepsByID) throw new RangeError("Duplicate use of step JSON ID " + id)
    stepsByID[id] = stepClass
    ;(stepClass as any).prototype.jsonID = id
    return stepClass
  }
}

/// The result of [applying](#transform.Step.apply) a step. Contains either a
/// new document or a failure value.
/**
 * 应用一个step的结果，包含一个文档或者一个错误值
 */
export class StepResult {
  /// @internal
  /**
   * stepResult的两个属性 doc保存应用成功的结果，failed保存应用失败的结果
   * @param doc 成功应用一个step时的被转换过的文档
   * @param failed 应用step失败时的错误信息
   */
  constructor(
    /// The transformed document, if successful.
    readonly doc: Node | null,
    /// The failure message, if unsuccessful.
    readonly failed: string | null
  ) {}

  /// Create a successful step result.
  /**
   * 创建一个应用成功的stepResult
   * @param doc 成功应用step的doc
   * @returns stepResult
   */
  static ok(doc: Node) { return new StepResult(doc, null) }

  /// Create a failed step result.
  /**
   * 创建一个应用失败的stepResult
   * @param message 应用失败的fail信息
   * @returns stepResult
   */
  static fail(message: string) { return new StepResult(null, message) }

  /// Call [`Node.replace`](#model.Node.replace) with the given
  /// arguments. Create a successful result if it succeeds, and a
  /// failed one if it throws a `ReplaceError`.
  /**
   * 用传入的参数调用`Node.replace`。如果成功则创建一个成功的结果，如果失败则创建一个失败的结果
   * node.replace过程中可能会抛出错误，失败的结果正是捕获这个错误之后返回的
   * @param doc doc文档
   * @param from 开始位置
   * @param to 结束位置
   * @param slice 文档切片
   * @returns stepResult 如果替换成功则返回StepResult.ok，如果失败则返回stepResult.fail
   */
  static fromReplace(doc: Node, from: number, to: number, slice: Slice) {
    try {
      return StepResult.ok(doc.replace(from, to, slice))
    } catch (e) {
      if (e instanceof ReplaceError) return StepResult.fail(e.message)
      throw e
    }
  }
}
