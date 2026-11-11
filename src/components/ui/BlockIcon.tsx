import React from 'react';
import { JsonIcon } from '../../types';
import logoUrl from '../../assets/logo.png';

interface Palette {
  top: string;
  topDark: string;
  left: string;
  right: string;
  accent: string;
  shadow: string;
}

const palettes: Record<JsonIcon, Palette> = {
  grass: {
    top: '#9fd64a',
    topDark: '#5f9b2a',
    left: '#7a532f',
    right: '#583a20',
    accent: '#c7f06a',
    shadow: '#2d1d10'
  },
  diamond: {
    top: '#8ee8df',
    topDark: '#43b6b1',
    left: '#248b92',
    right: '#17656f',
    accent: '#d8fffb',
    shadow: '#0c343a'
  },
  gold: {
    top: '#ffd85e',
    topDark: '#d79d24',
    left: '#a76c19',
    right: '#74470e',
    accent: '#fff3b0',
    shadow: '#3b2306'
  },
  redstone: {
    top: '#ff7a66',
    topDark: '#cf3b31',
    left: '#8c2724',
    right: '#611616',
    accent: '#ffb4a4',
    shadow: '#2f0808'
  },
  ender: {
    top: '#b9a3ff',
    topDark: '#7c5fd3',
    left: '#4e388f',
    right: '#33225f',
    accent: '#e4d9ff',
    shadow: '#160e2e'
  },
  amethyst: {
    top: '#d5a3ff',
    topDark: '#9b5dd4',
    left: '#6f3b9f',
    right: '#4b236f',
    accent: '#f2ddff',
    shadow: '#24102f'
  },
  stone: {
    top: '#b9beb0',
    topDark: '#82887c',
    left: '#666c61',
    right: '#4a5046',
    accent: '#dfe3d6',
    shadow: '#22261f'
  }
};

export const BlockIcon: React.FC<{ type?: JsonIcon; size?: number; className?: string }> = ({
  type = 'grass',
  size = 56,
  className
}) => {
  const p = palettes[type] || palettes.grass;
  const seed = (type.charCodeAt(0) + type.length * 7) % 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`top-${type}`}>
          <polygon points="8,1 15,4.5 8,8 1,4.5" />
        </clipPath>
        <clipPath id={`left-${type}`}>
          <polygon points="1,4.5 8,8 8,15 1,11.5" />
        </clipPath>
        <clipPath id={`right-${type}`}>
          <polygon points="15,4.5 8,8 8,15 15,11.5" />
        </clipPath>
      </defs>

      <polygon points="8,1 15,4.5 8,8 1,4.5" fill={p.top} />
      <polygon points="1,4.5 8,8 8,15 1,11.5" fill={p.left} />
      <polygon points="15,4.5 8,8 8,15 15,11.5" fill={p.right} />

      <g clipPath={`url(#top-${type})`}>
        <rect x={3 + seed} y="3" width="1" height="1" fill={p.topDark} opacity="0.75" />
        <rect x={9 - seed} y="4" width="2" height="1" fill={p.topDark} opacity="0.55" />
        <rect x={6} y="5" width="1" height="1" fill={p.accent} opacity="0.6" />
        <rect x={10} y="2" width="1" height="1" fill={p.accent} opacity="0.5" />
        <rect x={4} y="6" width="2" height="1" fill={p.topDark} opacity="0.4" />
        <rect x={11} y="5" width="1" height="1" fill={p.topDark} opacity="0.6" />
      </g>

      <g clipPath={`url(#left-${type})`}>
        <rect x={2} y="6" width="2" height="1" fill={p.accent} opacity="0.18" />
        <rect x={4} y="9" width="1" height="2" fill={p.shadow} opacity="0.4" />
        <rect x={2} y="12" width="2" height="1" fill={p.shadow} opacity="0.35" />
        <rect x={5} y="7" width="1" height="1" fill={p.accent} opacity="0.2" />
      </g>
      <g clipPath={`url(#right-${type})`}>
        <rect x={10} y="7" width="2" height="1" fill={p.shadow} opacity="0.25" />
        <rect x={12} y="9" width="1" height="2" fill={p.shadow} opacity="0.3" />
        <rect x={9} y="11" width="2" height="1" fill={p.accent} opacity="0.1" />
      </g>

      {type === 'diamond' && (
        <g clipPath={`url(#top-${type})`}>
          <polygon points="8,2.6 9.4,4.5 8,6.4 6.6,4.5" fill={p.accent} opacity="0.9" />
          <polygon points="8,3.4 8.8,4.5 8,5.6 7.2,4.5" fill="#ffffff" opacity="0.65" />
        </g>
      )}
      {(type === 'redstone' || type === 'amethyst' || type === 'ender') && (
        <g clipPath={`url(#left-${type})`}>
          <rect x={3} y={7} width="1" height="1" fill={p.accent} opacity="0.9" />
          <rect x={5} y={10} width="1" height="1" fill={p.accent} opacity="0.8" />
        </g>
      )}
      {type === 'gold' && (
        <g clipPath={`url(#right-${type})`}>
          <rect x={10} y={6} width="1" height="1" fill={p.accent} opacity="0.9" />
          <rect x={12} y={8} width="1" height="1" fill={p.accent} opacity="0.7" />
        </g>
      )}

      <polyline points="8,1 15,4.5 8,8 1,4.5 8,1" fill="none" stroke={p.accent} strokeWidth="0.28" opacity="0.55" />
      <polyline points="1,4.5 8,8 8,15" fill="none" stroke={p.shadow} strokeWidth="0.28" opacity="0.8" />
      <polyline points="15,4.5 8,8 8,15" fill="none" stroke={p.shadow} strokeWidth="0.28" opacity="0.55" />
    </svg>
  );
};

export const PixelLogoTiles: React.FC<{ size?: number; className?: string }> = ({
  size = 30,
  className
}) => (
  <img
    src={logoUrl}
    width={size}
    height={size}
    className={className}
    alt="Sunspire"
    draggable={false}
    style={{
      display: 'block',
      objectFit: 'cover',
      borderRadius: Math.max(2, Math.round(size * 0.14)),
      imageRendering: 'auto'
    }}
  />
);

export const GithubMark: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export const MicrosoftMark: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" fill="none" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);
