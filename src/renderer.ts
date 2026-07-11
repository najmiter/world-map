import { geoContains, geoEquirectangular, geoPath } from 'd3-geo';
import type { GeoPath, GeoProjection } from 'd3-geo';
import { select } from 'd3-selection';
import type { Selection } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import type { Topology } from 'topojson-specification';
import { hexLightness, shade } from './map/color';
import { clamp, nextTask } from './map/utils';
import type { Callbacks, CountryFeature, LabelInfo, Level, MapTheme, PathCache } from './types';
import { CONTINENT_FALLBACK, THEMES } from './map/themes';
import { DATA_URLS, GRATICULE, HIGH_DETAIL_ZOOM, MAX_ZOOM, SPHERE, WATER_LABELS } from './map/constants';
import { buildLevel, mainPolygon } from './map/geo';

const LABEL_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const WATER_TIER_MIN_K = [1, 1.7, 3.2];

export class MapRenderer {
  private container: HTMLElement;
  private base: HTMLCanvasElement;
  private top: HTMLCanvasElement;
  private scene: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private tctx: CanvasRenderingContext2D;
  private sctx: CanvasRenderingContext2D;
  private cb: Callbacks;

  private w = 0;
  private h = 0;
  private dpr = 1;
  private projection: GeoProjection = geoEquirectangular();
  private basePath: GeoPath = geoPath(this.projection);
  private graticulePath: Path2D | null = null;

  private waterPts: ([number, number] | null)[] = [];
  private theme: MapTheme = THEMES[0];

  private t: ZoomTransform = zoomIdentity;

  private minK = 1;
  private zoomB: ZoomBehavior<HTMLCanvasElement, unknown>;
  private sel: Selection<HTMLCanvasElement, unknown, null, undefined>;

  private levels: (Level | null)[] = [null, null, null];
  private caches = new Map<number, PathCache>();
  private projEpoch = 0;

  private sceneT: ZoomTransform | null = null;
  private sceneLevel = -1;
  private raf = 0;
  private interacting = false;
  private hovered: CountryFeature | null = null;
  private hoverD: Path2D | null = null;
  private destroyed = false;
  private abort: AbortController | null = null;
  private ro: ResizeObserver | null = null;
  private onMoveBound = (e: MouseEvent) => this.onMove(e);
  private onLeaveBound = () => this.onLeave();
  private onClickBound = (e: MouseEvent) => this.onClick(e);

  constructor(container: HTMLElement, base: HTMLCanvasElement, top: HTMLCanvasElement, cb: Callbacks) {
    this.container = container;
    this.base = base;
    this.top = top;
    this.cb = cb;
    this.scene = document.createElement('canvas');
    this.bctx = base.getContext('2d')!;
    this.tctx = top.getContext('2d')!;
    this.sctx = this.scene.getContext('2d')!;
    this.sel = select(top);

    this.zoomB = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([this.minK, MAX_ZOOM])
      .clickDistance(3)
      .on('start', () => {
        this.interacting = true;
        this.setHovered(null);
        this.cb.onHover(null);
      })
      .on('zoom', (ev: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        this.t = ev.transform;
        this.requestRender();
      })
      .on('end', () => {
        this.interacting = false;
        this.requestRender();
      });
  }

  private fitTransform(): ZoomTransform {
    const k = this.minK;
    return zoomIdentity.translate((this.w * (1 - k)) / 2, (this.h * (1 - k)) / 2).scale(k);
  }

  init(): void {
    this.resize();
    this.sel.call(this.zoomB.transform, this.fitTransform());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.sel.call(this.zoomB);
    this.top.addEventListener('mousemove', this.onMoveBound);
    this.top.addEventListener('mouseleave', this.onLeaveBound);
    this.top.addEventListener('click', this.onClickBound);
    this.top.style.cursor = 'grab';
    this.abort = new AbortController();
    void this.loadAll(this.abort.signal);
  }

  destroy(): void {
    this.destroyed = true;
    this.projEpoch++;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.abort?.abort();
    this.ro?.disconnect();
    this.sel.on('.zoom', null);
    this.top.removeEventListener('mousemove', this.onMoveBound);
    this.top.removeEventListener('mouseleave', this.onLeaveBound);
    this.top.removeEventListener('click', this.onClickBound);
  }

  setTheme(theme: MapTheme): void {
    this.theme = theme;
    this.sceneT = null;
    this.requestRender();
  }

  zoomIn(): void {
    this.sel.transition().duration(280).call(this.zoomB.scaleBy, 1.6);
  }

  zoomOut(): void {
    this.sel
      .transition()
      .duration(280)
      .call(this.zoomB.scaleBy, 1 / 1.6);
  }

  resetView(): void {
    this.sel.transition().duration(800).call(this.zoomB.transform, this.fitTransform());
  }

  private async loadAll(signal: AbortSignal): Promise<void> {
    for (let i = 0; i < DATA_URLS.length; i++) {
      try {
        const res = await fetch(DATA_URLS[i], { signal });
        const topo = (await res.json()) as Topology;
        if (this.destroyed) return;
        this.levels[i] = await buildLevel(topo);
      } catch {
        return;
      }
      if (this.destroyed) return;
      if (i === 0) this.cb.onReady();
      void this.buildCache(i);
    }
  }

  private async buildCache(li: number): Promise<void> {
    const epoch = this.projEpoch;
    const lvl = this.levels[li];
    if (!lvl || this.caches.has(li)) return;
    const path = this.basePath;
    const countries: Path2D[] = [];
    const labels: LabelInfo[] = [];
    let sliceStart = performance.now();
    for (const f of lvl.features) {
      countries.push(new Path2D(path(f) || undefined));
      const poly = mainPolygon(f, path);
      const [cx, cy] = path.centroid(poly);
      const [[x0], [x1]] = path.bounds(poly);
      labels.push({ x: cx, y: cy, area: path.area(poly), width: x1 - x0 });
      if (performance.now() - sliceStart > 8) {
        await nextTask();
        if (epoch !== this.projEpoch || this.destroyed) return;
        sliceStart = performance.now();
      }
    }
    const borders = new Path2D(path(lvl.borders) || undefined);
    await nextTask();
    if (epoch !== this.projEpoch || this.destroyed) return;
    const coast = new Path2D(path(lvl.coast) || undefined);
    const land = new Path2D(path(lvl.land) || undefined);
    const labelOrder = labels.map((_, i) => i).sort((a, b) => labels[b].area - labels[a].area);
    this.caches.set(li, { countries, borders, coast, land, labels, labelOrder });
    this.requestRender();
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.w = rect.width;
    this.h = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.base, this.top, this.scene]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
      if (c !== this.scene) {
        c.style.width = `${this.w}px`;
        c.style.height = `${this.h}px`;
      }
    }
    this.setupProjection();
    this.requestRender();
  }

  private setupProjection(): void {
    this.projEpoch++;

    const scale = Math.max(this.w / (2 * Math.PI), this.h / Math.PI);
    this.projection = geoEquirectangular()
      .scale(scale)
      .translate([this.w / 2, this.h / 2]);
    this.basePath = geoPath(this.projection);
    this.zoomB.translateExtent(this.basePath.bounds(SPHERE));

    this.minK = Math.min(this.w / (2 * Math.PI), this.h / Math.PI) / scale;
    this.zoomB.scaleExtent([this.minK, MAX_ZOOM]);
    this.caches.clear();
    this.sceneT = null;
    this.sceneLevel = -1;
    this.graticulePath = new Path2D(this.basePath(GRATICULE) || undefined);
    this.waterPts = WATER_LABELS.map(([, lon, lat]) => {
      const p = this.projection([lon, lat]);
      return p ? [p[0], p[1]] : null;
    });
    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i]) void this.buildCache(i);
    }
    this.rebuildHoverPath();
  }

  private bestLevel(): number {
    const target = this.t.k >= HIGH_DETAIL_ZOOM ? 2 : 1;
    for (let i = target; i >= 0; i--) {
      if (this.caches.has(i)) return i;
    }
    return -1;
  }

  private onMove(e: MouseEvent): void {
    if (this.interacting) return;
    const f = this.pickAt(e.offsetX, e.offsetY);
    this.setHovered(f);
    this.top.style.cursor = f ? 'pointer' : 'grab';
    this.cb.onHover(f ? { ...f.properties, x: e.clientX, y: e.clientY } : null);
  }

  private onLeave(): void {
    this.setHovered(null);
    this.cb.onHover(null);
  }

  private onClick(e: MouseEvent): void {
    const f = this.pickAt(e.offsetX, e.offsetY);
    if (f) this.flyTo(f);
    else this.resetView();
  }

  private flyTo(f: CountryFeature): void {
    const [[x0, y0], [x1, y1]] = this.basePath.bounds(f);
    const k = clamp(0.75 / Math.max((x1 - x0) / this.w, (y1 - y0) / this.h), 1, MAX_ZOOM);
    const tx = this.w / 2 - (k * (x0 + x1)) / 2;
    const ty = this.h / 2 - (k * (y0 + y1)) / 2;
    this.sel.transition().duration(900).call(this.zoomB.transform, zoomIdentity.translate(tx, ty).scale(k));
  }

  private requestRender(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render(): void {
    const level = this.bestLevel();
    if (level < 0) return;
    if (!this.interacting || !this.sceneT || level !== this.sceneLevel) {
      this.renderScene(level);
    }
    this.blitScene();
    this.renderHoverLayer();
  }

  private renderScene(level: number): void {
    const ctx = this.sctx;
    const cache = this.caches.get(level)!;
    const lvl = this.levels[level]!;
    const th = this.theme;
    const { k, x, y } = this.t;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const grad = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      this.h * 0.1,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.7,
    );
    grad.addColorStop(0, th.oceanIn);
    grad.addColorStop(1, th.oceanOut);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(x, y);
    ctx.scale(k, k);

    ctx.strokeStyle = th.graticule;
    ctx.lineWidth = 0.6 / k;
    ctx.stroke(this.graticulePath!);

    const rings: [number, number][] = [
      [8, 0.06],
      [3, 0.14],
    ];
    ctx.strokeStyle = th.waterline;
    for (const [width, alpha] of rings) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width / k;
      ctx.stroke(cache.land);
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < cache.countries.length; i++) {
      ctx.fillStyle = lvl.ice[i]
        ? th.ice
        : shade(th.continents[lvl.features[i].properties.continent] ?? CONTINENT_FALLBACK, lvl.shade[i]);
      ctx.fill(cache.countries[i]);
    }

    ctx.strokeStyle = th.coast;
    ctx.lineWidth = 0.6 / k;
    ctx.stroke(cache.coast);
    ctx.strokeStyle = th.border;
    ctx.lineWidth = 0.7 / k;
    ctx.stroke(cache.borders);

    this.drawWaterLabels(ctx);
    this.drawLabels(ctx, cache, lvl);

    this.sceneT = this.t;
    this.sceneLevel = level;
  }

  private drawWaterLabels(ctx: CanvasRenderingContext2D): void {
    const { k, x, y } = this.t;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.theme.waterInk;
    for (let i = 0; i < WATER_LABELS.length; i++) {
      const pt = this.waterPts[i];
      if (!pt) continue;
      const [name, , , tier] = WATER_LABELS[i];
      if (k < WATER_TIER_MIN_K[tier]) continue;
      const sx = x + k * pt[0];
      const sy = y + k * pt[1];
      if (sx < -60 || sy < -20 || sx > this.w + 60 || sy > this.h + 20) continue;
      const isOcean = tier === 0;
      ctx.font = isOcean ? `600 12.5px ${LABEL_FONT}` : `500 ${tier === 1 ? 11.5 : 10.5}px ${LABEL_FONT}`;
      try {
        ctx.letterSpacing = isOcean ? '0.28em' : '0.14em';
      } catch {
        /* older browsers */
      }
      ctx.fillText(name.toUpperCase(), sx, sy);
    }
    try {
      ctx.letterSpacing = '0em';
    } catch {
      /* older browsers */
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, cache: PathCache, lvl: Level): void {
    const { k, x, y } = this.t;
    const features = lvl.features;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed: [number, number, number, number][] = [];
    for (const i of cache.labelOrder) {
      const lab = cache.labels[i];
      const name = features[i]?.properties.name;
      if (!name) continue;
      const sx = x + k * lab.x;
      const sy = y + k * lab.y;
      if (sx < -40 || sy < -20 || sx > this.w + 40 || sy > this.h + 20) continue;
      const screenArea = lab.area * k * k;
      const size = clamp(Math.sqrt(screenArea) / 9, 10.5, 16);
      // large countries get the cartographic treatment: spaced capitals.
      const grand = size >= 13.5;
      const text = grand ? name.toUpperCase() : name;
      ctx.font = grand ? `600 ${size - 2}px ${LABEL_FONT}` : `500 ${size}px ${LABEL_FONT}`;
      try {
        ctx.letterSpacing = grand ? '0.12em' : '0.01em';
      } catch {
        /* older browsers */
      }
      const tw = ctx.measureText(text).width;
      if (tw > lab.width * k * 1.1) continue;
      const box: [number, number, number, number] = [
        sx - tw / 2 - 4,
        sy - size / 2 - 3,
        sx + tw / 2 + 4,
        sy + size / 2 + 3,
      ];
      let overlaps = false;
      for (const p of placed) {
        if (box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      placed.push(box);

      // flip to light text on dark country fills so labels stay readable.
      const th = this.theme;
      const base = lvl.ice[i] ? th.ice : (th.continents[features[i].properties.continent] ?? CONTINENT_FALLBACK);
      const dark = hexLightness(base) + (lvl.ice[i] ? 0 : lvl.shade[i]) < 48;
      ctx.fillStyle = dark ? '#eef1f4' : th.ink;
      ctx.fillText(text, sx, sy);
    }
    try {
      ctx.letterSpacing = '0em';
    } catch {
      /* older browsers */
    }
  }

  private blitScene(): void {
    const ctx = this.bctx;
    const s = this.sceneT!;
    const dk = this.t.k / s.k;
    const dx = this.t.x - dk * s.x;
    const dy = this.t.y - dk * s.y;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.oceanOut;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.dpr * dk, 0, 0, this.dpr * dk, this.dpr * dx, this.dpr * dy);
    ctx.drawImage(this.scene, 0, 0, this.scene.width, this.scene.height, 0, 0, this.w, this.h);
  }

  private rebuildHoverPath(): void {
    this.hoverD = this.hovered ? new Path2D(this.basePath(this.hovered) || undefined) : null;
  }

  private setHovered(f: CountryFeature | null): void {
    if (f === this.hovered) return;
    this.hovered = f;
    this.rebuildHoverPath();
    this.renderHoverLayer();
  }

  private renderHoverLayer(): void {
    const ctx = this.tctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.hovered || !this.hoverD) return;
    const { k, x, y } = this.t;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill(this.hoverD);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = this.theme.ink;
    ctx.lineWidth = 1.2 / k;
    ctx.stroke(this.hoverD);
    ctx.globalAlpha = 1;
  }

  private hitLevel(): number {
    if (this.t.k >= HIGH_DETAIL_ZOOM && this.levels[2]) return 2;
    if (this.levels[1]) return 1;
    return this.levels[0] ? 0 : -1;
  }

  private pickAt(x: number, y: number): CountryFeature | null {
    const li = this.hitLevel();
    if (li < 0) return null;
    const lvl = this.levels[li]!;

    const px = (x - this.t.x) / this.t.k;
    const py = (y - this.t.y) / this.t.k;
    const ll = (this.projection.invert?.([px, py]) as [number, number] | null) ?? null;
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return null;
    const [lon, lat] = ll;
    // invert() extrapolates beyond the map edges; those points are open sea.
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;

    for (let i = 0; i < lvl.features.length; i++) {
      const [l0, p0, l1, p1] = lvl.bboxes[i];
      if (lat < p0 || lat > p1) continue;
      const inLon = l0 <= l1 ? lon >= l0 && lon <= l1 : lon >= l0 || lon <= l1;
      if (!inLon) continue;
      if (geoContains(lvl.features[i], [lon, lat])) return lvl.features[i];
    }
    return null;
  }
}
