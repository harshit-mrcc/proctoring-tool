export async function requestCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}

export async function requestMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

export async function requestScreenShare(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
}

export function stopMediaStream(stream: MediaStream | null) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function estimateLightingScore(
  webcam: HTMLVideoElement,
  canvas: HTMLCanvasElement
): number {
  if (!webcam || !canvas || !webcam.videoWidth || !webcam.videoHeight)
    return 0;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    sum +=
      0.2126 * imageData[i] +
      0.7152 * imageData[i + 1] +
      0.0722 * imageData[i + 2];
  }
  return sum / (canvas.width * canvas.height);
}

export async function measureInternetSpeedMbps(): Promise<number> {
  const connection = (
    navigator as Navigator & { connection?: { downlink?: number } }
  ).connection;
  if (
    connection &&
    typeof connection.downlink === "number" &&
    connection.downlink > 0
  ) {
    return Number(connection.downlink);
  }
  const started = performance.now();
  const response = await fetch(`/speed_probe?ts=${Date.now()}`, {
    cache: "no-store",
  });
  const blob = await response.blob();
  const ended = performance.now();
  const durationSeconds = Math.max((ended - started) / 1000, 0.001);
  const megabits = (blob.size * 8) / 1_000_000;
  return megabits / durationSeconds;
}

export async function testMicrophone(
  stream: MediaStream
): Promise<boolean> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) {
      return true;
    }
    const audioContext = new Ctx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const started = Date.now();
    let peak = 0;
    while (Date.now() - started < 2200) {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      peak = Math.max(peak, Math.sqrt(sumSquares / data.length));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    source.disconnect();
    await audioContext.close();
    return peak >= 0.01;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
