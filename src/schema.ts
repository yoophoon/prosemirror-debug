import { nodes,marks } from "prosemirror-schema-basic";
import { mermaidNodeSpec } from "prosemirror-mermaid";
import { SchemaSpec, Schema } from "prosemirror-model";

const schemaSpec:SchemaSpec={
  nodes:{
    ...nodes,
    mermaid:mermaidNodeSpec,
  },
  marks
}

export const schema=new Schema(schemaSpec)