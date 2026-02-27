import { type RefObject } from "react";

interface VideoBoxProps {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  autoPlay?: boolean;
}

export function VideoBox({
  videoRef,
  canvasRef,
  autoPlay = true,
}: VideoBoxProps) {
  return (
    <div className="video-box">
      <video ref={videoRef} autoPlay={autoPlay} playsInline muted />
      <canvas ref={canvasRef} width={640} height={480} hidden />
    </div>
  );
}
