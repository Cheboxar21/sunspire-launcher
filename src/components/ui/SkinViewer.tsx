import React, { useEffect, useRef } from 'react';
import * as skinview3d from 'skinview3d';
import { Account } from '../../types';
import { useLauncher } from '../../state/LauncherContext';
import { useSkinData } from '../../lib/useSkinData';

interface SkinViewerProps {
  account: Account | null;
  className?: string;
}

export const SkinViewer: React.FC<SkinViewerProps> = ({ account, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);
  const { skinRevision } = useLauncher();
  const skin = useSkinData(account, skinRevision);
  const skinRef = useRef(skin);
  skinRef.current = skin;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const viewer = new skinview3d.SkinViewer({
      canvas,
      width: Math.max(220, wrapper.clientWidth),
      height: Math.max(260, wrapper.clientHeight),
      skin: skinRef.current.skinDataUrl || '/assets/steve.png',
      model: skinRef.current.slimArms ? 'slim' : 'default',
      preserveDrawingBuffer: false
    });
    viewer.background = null;
    viewer.fov = 38;
    viewer.zoom = 0.92;
    viewer.controls.enableZoom = false;
    viewer.controls.enablePan = false;
    viewer.controls.enableRotate = true;
    viewer.controls.rotateSpeed = 0.7;
    viewer.playerObject.rotation.y = -0.32;
    viewer.camera.position.set(0, 10, 48);
    viewer.animation = new skinview3d.IdleAnimation();
    viewerRef.current = viewer;

    const observer = new ResizeObserver(() => {
      if (!wrapperRef.current || viewer.disposed) return;
      const width = Math.max(200, wrapperRef.current.clientWidth);
      const height = Math.max(240, wrapperRef.current.clientHeight);
      viewer.setSize(width, height);
    });
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;
    viewer
      .loadSkin(skin.skinDataUrl || '/assets/steve.png', {
        model: skin.slimArms ? 'slim' : 'default'
      })
      .catch(() => {});
  }, [skin.skinDataUrl, skin.slimArms]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;
    if (skin.capeDataUrl) {
      viewer.loadCape(skin.capeDataUrl).catch(() => {});
    } else {
      viewer.loadCape(null);
    }
  }, [skin.capeDataUrl]);

  return (
    <div ref={wrapperRef} className={className || 'skin-viewer'}>
      <div className="skin-viewer-grid" aria-hidden="true" />
      <div className="skin-viewer-glow" aria-hidden="true" />
      <canvas ref={canvasRef} className="skin-viewer-canvas" />
      <div className="skin-viewer-floor" aria-hidden="true" />
    </div>
  );
};
