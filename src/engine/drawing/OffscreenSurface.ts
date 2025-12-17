export class OffscreenSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D ctx not available");
    this.ctx = ctx;
    this.clear();
  }

  resize(width: number, height: number) {
    const prev = this.toImageData();
    this.canvas.width = width;
    this.canvas.height = height;
    this.clear();
    if (prev) this.ctx.putImageData(prev, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  toImageData() {
    try {
      return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    } catch {
      return null;
    }
  }

  async toPngBlob(): Promise<Blob> {
    return await new Promise((resolve) => {
      this.canvas.toBlob((b) => resolve(b as Blob), "image/png");
    });
  }

  async drawBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Failed to load blob image"));
      img.src = url;
    });
    this.clear();
    this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    URL.revokeObjectURL(url);
  }
}
