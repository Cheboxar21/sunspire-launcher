import React, { useEffect, useRef } from 'react';
import { Account } from '../../types';
import { useLauncher } from '../../state/LauncherContext';
import { useSkinData } from '../../lib/useSkinData';

interface SkinHeadProps {
  account: Account | null;
  size?: number;
  className?: string;
}

function drawFallback(ctx: CanvasRenderingContext2D) {
  const pixels = [
    ['#3b2a1a', 1, 0, 6, 2],
    ['#3b2a1a', 0, 1, 8, 2],
    ['#c58e68', 1, 2, 6, 1],
    ['#c58e68', 0, 3, 8, 3],
    ['#ffffff', 1, 3, 2, 1],
    ['#3d6c8e', 2, 3, 1, 1],
    ['#ffffff', 5, 3, 2, 1],
    ['#3d6c8e', 5, 3, 1, 1],
    ['#c58e68', 1, 6, 6, 1],
    ['#a36f4f', 2, 6, 4, 1],
    ['#8a5a3f', 2, 7, 4, 1]
  ] as const;
  ctx.clearRect(0, 0, 64, 64);
  for (const [color, x, y, w, h] of pixels) {
    ctx.fillStyle = color;
    ctx.fillRect(Number(x) * 8, Number(y) * 8, Number(w) * 8, Number(h) * 8);
  }
}

export const SkinHead: React.FC<SkinHeadProps> = ({ account, size = 48, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { skinRevision } = useLauncher();
  const skin = useSkinData(account, skinRevision);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, 64, 64);
      ctx.imageSmoothingEnabled = false;
      if (image.width >= 64 && image.height >= 32) {
        ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 64, 64);
        try {
          ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 64, 64);
        } catch {
          // old skins may not have a hat layer
        }
      } else {
        drawFallback(ctx);
      }
    };
    image.onerror = () => {
      if (!cancelled) drawFallback(ctx);
    };
    image.src = skin.skinDataUrl || '/assets/steve.png';
    return () => {
      cancelled = true;
    };
  }, [skin.skinDataUrl]);

  return (
    <span className={className || 'skin-head'} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} width={64} height={64} style={{ width: size, height: size }} />
    </span>
  );
};
