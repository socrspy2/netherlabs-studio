export type ToolId =
  | "select"
  | "direction"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "trapezoid"
  | "star"
  | "polygon"
  | "wave"
  | "arrow"
  | "line"
  | "text"
  | "pen"
  | "hand";

export type StrokeAlign = "center" | "inside" | "outside";

export type Shadow = {
  enabled?: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
  quality?: "low" | "medium" | "high";
};

export type Glow = {
  enabled: boolean;
  mode: "outer" | "inner";
  color: string;
  opacity: number;
  blur: number;
  spread: number;
  offset: { x: number; y: number };
  quality?: "low" | "medium" | "high";
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

export type Fill = SolidFill | LinearGradientFill | MediaFill;

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

export type AssetKind = "image" | "video";

export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  mimeType: string;
  src: string;
  width: number;
  height: number;
  duration?: number;
  poster?: string;
  map?: string;
  createdAt: number;
};

export type MediaFillMode = "cover" | "contain" | "stretch" | "tile";

export type MediaFill = {
  enabled: boolean;
  kind: "media";
  assetId: string;
  mode: MediaFillMode;
  offset: { x: number; y: number };
  scale: number;
  repeat?: boolean;
};

export type BaseShape = {
  id: string;
  name: string;
  type: "rectangle" | "ellipse" | "line" | "text" | "path" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: { x: number; y: number };
  rotation: number;
  matrix?: DOMMatrix;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: Fill;
  stroke: Stroke;
  radius: CornerRadius;
  shadow: Shadow | null;
  glow?: Glow | null;
  effects?: Effects;
  blendMode?: LayerBlendMode;
};

export type TextShape = BaseShape & {
  type: "text";
  text: string;
  font: string;
  fontStyle?: "normal" | "italic";
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
  align: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  textColor: string; // legacy
  textFill?: Fill;
};

export type BezierHandle = { x: number; y: number };

export type PathPoint = {
  x: number;
  y: number;
  in?: BezierHandle | null;
  out?: BezierHandle | null;
  pointType?: "corner" | "smooth" | "broken";
};

export type PathShape = BaseShape & {
  type: "path";
  points: PathPoint[]; // local coordinates
  closed: boolean;
};

export type ImageShape = BaseShape & {
  type: "image";
  src: string; // data URL or URL
  assetId?: string;
  mediaKind?: AssetKind;
  poster?: string;
  fillMode?: MediaFillMode;
  fillOffset?: { x: number; y: number };
  fillScale?: number;
  repeat?: boolean;
  masks?: MediaMask[];
  playback?: { autoplay: boolean; loop: boolean; muted: boolean };
};

export type Shape = BaseShape | TextShape | PathShape | ImageShape;

export type BitmapMask = {
  id: string;
  kind: "bitmap";
  name: string;
  visible: boolean;
  inverted?: boolean;
  data?: string; // placeholder for future bitmap mask data
};

export type ShapeMask = {
  id: string;
  kind: "shape";
  name: string;
  visible: boolean;
  inverted?: boolean;
  shape: Shape;
};

export type MediaMask = ShapeMask | BitmapMask;

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

export type GridSettings = {
  size: number;
  color: string;
  visible: boolean;
  magnetic: boolean;
};

export type EditorDocument = {
  layers: LayerNode[];
  selection: string[];
  tool: ToolId;
  viewport: ViewportState;
  canvasBackground: CanvasBackground;
  canvasSize: CanvasSize;
  grid: GridSettings;
};
