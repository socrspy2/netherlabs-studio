export type ToolId =
  | "select"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "line"
  | "text"
  | "pen"
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

export type GradientStop = {
  offset: number; // 0..1
  color: string;
  opacity: number;
};

export type CornerRadius = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

export type SolidFill = {
  enabled: boolean;
  kind: "solid";
  color: string;
  opacity: number;
};

export type LinearGradientFill = {
  enabled: boolean;
  kind: "linear";
  angle: number; // degrees
  stops: GradientStop[];
};

export type Fill = SolidFill | LinearGradientFill;

export type SolidStroke = {
  enabled: boolean;
  kind: "solid";
  color: string;
  width: number;
  align: StrokeAlign;
  dashed: boolean;
  opacity: number;
};

export type LinearGradientStroke = {
  enabled: boolean;
  kind: "linear";
  angle: number;
  stops: GradientStop[];
  width: number;
  align: StrokeAlign;
  dashed: boolean;
  opacity: number;
};

export type Stroke = SolidStroke | LinearGradientStroke;

export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "linear-dodge"
  | "linear-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "add"
  | "subtract"
  | "divide";

export type Effects = {
  blur: number;
  backgroundBlur: number;
};

export type BaseShape = {
  id: string;
  name: string;
  type: "rectangle" | "ellipse" | "line" | "text" | "path" | "image";
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
  effects?: Effects;
  blendMode?: LayerBlendMode;
};

export type TextShape = BaseShape & {
  type: "text";
  text: string;
  font: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  align: "left" | "center" | "right";
  textColor: string; // legacy
  textFill?: Fill;
};

export type BezierHandle = { x: number; y: number };

export type PathPoint = {
  x: number;
  y: number;
  in?: BezierHandle | null;
  out?: BezierHandle | null;
};

export type PathShape = BaseShape & {
  type: "path";
  points: PathPoint[]; // local coordinates
  closed: boolean;
};

export type ImageShape = BaseShape & {
  type: "image";
  src: string; // data URL or URL
};

export type Shape = BaseShape | TextShape | PathShape | ImageShape;

export type GroupNode = {
  id: string;
  kind: "group";
  name: string;
  visible: boolean;
  locked: boolean;
  mask?: {
    enabled: boolean;
    maskId: string;
  };
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

export type CanvasBackground =
  | { kind: "preset"; value: "white" | "black" | "blue" }
  | { kind: "custom"; color: string }
  | { kind: "checkerboard" };

export type CanvasSize = {
  width: number;
  height: number;
};

export type EditorDocument = {
  layers: LayerNode[];
  selection: string[];
  tool: ToolId;
  viewport: ViewportState;
  canvasBackground: CanvasBackground;
  canvasSize: CanvasSize;
};
