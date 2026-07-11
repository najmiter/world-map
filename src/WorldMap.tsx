import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MapRenderer } from './renderer';
import type { HoverInfo } from './types';
import './WorldMap.css';
import type { MapTheme } from './types';
import { THEMES } from './map/themes';
import { flagEmoji } from './map/utils';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export default function WorldMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<MapTheme>(THEMES[0]);

  const switchTheme = (t: MapTheme) => {
    setTheme(t);
    rendererRef.current?.setTheme(t);
  };

  useEffect(() => {
    const renderer = new MapRenderer(containerRef.current!, baseRef.current!, topRef.current!, {
      onHover: setHover,
      onReady: () => setReady(true),
    });
    rendererRef.current = renderer;
    renderer.init();
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const tooltipStyle = hover
    ? {
        left: Math.min(hover.x + 16, window.innerWidth - 240),
        top: Math.min(hover.y + 18, window.innerHeight - 92),
      }
    : undefined;

  return (
    <div
      className="map-root"
      ref={containerRef}
      style={
        {
          background: theme.oceanOut,
          '--paper': theme.paper,
          '--ink': theme.ink,
        } as CSSProperties
      }>
      <canvas ref={baseRef} className="map-canvas" />
      <canvas ref={topRef} className="map-canvas map-canvas-top" />

      <div className="theme-picker" role="radiogroup" aria-label="Color theme">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme.id === t.id}
            className={theme.id === t.id ? 'active' : ''}
            onClick={() => switchTheme(t)}>
            <span className="swatches">
              {Object.values(t.continents)
                .slice(0, 4)
                .map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="zoom-controls">
        <button type="button" aria-label="Zoom in" onClick={() => rendererRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => rendererRef.current?.zoomOut()}>
          −
        </button>
        <button type="button" aria-label="Reset view" onClick={() => rendererRef.current?.resetView()}>
          ⟲
        </button>
      </div>

      <p className="map-hint">
        Drag to pan · Scroll to zoom · Click a country to focus · Click the ocean to reset <br />
        <span>
          By{' '}
          <a href="https://github.com/najmiter" target="_blank" rel="noopener noreferrer">
            @najmiter
          </a>
        </span>
      </p>

      <div className={`tooltip ${hover ? 'visible' : ''}`} style={tooltipStyle}>
        {hover && (
          <>
            <div className="tooltip-name">
              <span className="tooltip-flag">{flagEmoji(hover.iso)}</span>
              {hover.name}
            </div>
            <div className="tooltip-meta">
              {hover.continent}
              {hover.pop > 0 && <> · {compact.format(hover.pop)} people</>}
            </div>
          </>
        )}
      </div>

      {!ready && (
        <div className="map-loading">
          <div className="spinner" />
          <p>Loading the world…</p>
        </div>
      )}
    </div>
  );
}
