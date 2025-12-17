type BrushOpts = {
  baseSize: number;
  color: string;
  hardness: number; // reserved for later (soft brush)
  opacity: number;
};

export class Brush {
  private drawing = false;
  private last: { x: number; y: number } | null = null;

  constructor(private ctx: CanvasRenderingContext2D, private opts: BrushOpts) {
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = opts.color;
  }

  setOptions(next: Partial<BrushOpts>) {
    this.opts = { ...this.opts, ...next };
    this.ctx.strokeStyle = this.opts.color;
  }

  pointerDown(x: number, y: number, pressure: number) {
    this.drawing = true;
    this.last = { x, y };
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.applyPressure(pressure);
  }

  pointerMove(x: number, y: number, pressure: number) {
    if (!this.drawing || !this.last) return;
    this.applyPressure(pressure);

    this.ctx.lineTo(x, y);
    this.ctx.stroke();

    this.last = { x, y };
  }

  pointerUp() {
    this.drawing = false;
    this.last = null;
    this.ctx.closePath();
  }

  private applyPressure(pressure: number) {
    const p = Math.max(0.05, pressure || 0.35);
    this.ctx.globalAlpha = this.opts.opacity * p;
    this.ctx.lineWidth = this.opts.baseSize * (0.5 + p);
  }
}
