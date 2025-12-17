export type ToolId =
  | "select"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "line"
  | "text"
  | "hand"
  | "zoom";

export type StrokeAlign = "center" | "inside" | "outside";

export type Shadow = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
};

export type CornerRadius = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

export type Fill = {
  enabled: boolean;
  color: string;
  opacity: number;
};

export type Stroke = {
  enabled: boolean;
  color: string;
  width: number;
  align: StrokeAlign;
  dashed: boolean;
  opacity: number;
};

export type BaseShape = {
  id: string;
  name: string;
  type: "rectangle" | "ellipse" | "line" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: Fill;
  stroke: Stroke;
  radius: CornerRadius;
  shadow: Shadow | null;
};

export type TextShape = BaseShape & {
  type: "text";
  text: string;
  font: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  textColor: string;
};

export type Shape = BaseShape | TextShape;

export type GroupNode = {
  id: string;
  kind: "group";
  name: string;
  visible: boolean;
  locked: boolean;
  children: LayerNode[];
};

export type ShapeNode = {
  id: string;
  kind: "shape";
  shape: Shape;
};

export type LayerNode = GroupNode | ShapeNode;

export type ViewportState = {
  pan: { x: number; y: number };
  zoom: number;
};

export type EditorDocument = {
  layers: LayerNode[];
  selection: string[];
  tool: ToolId;
  viewport: ViewportState;
};
