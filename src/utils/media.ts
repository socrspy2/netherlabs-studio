export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function probeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

export function probeVideoMetadata(src: string): Promise<{ width: number; height: number; duration: number; poster?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.onloadeddata = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      let poster: string | undefined;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          poster = canvas.toDataURL("image/png");
        }
      } catch {
        // ignore poster failures; metadata is still useful
      }
      resolve({ width, height, duration, poster });
    };
    video.onerror = () => resolve({ width: 0, height: 0, duration: 0 });
    video.src = src;
  });
}
