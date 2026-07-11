import type { Feature, Geometry, MultiLineString, MultiPolygon, Polygon } from 'geojson';

export interface MapTheme {
  id: string;
  label: string;
  continents: Record<string, string>;
  ice: string;
  oceanIn: string;
  oceanOut: string;
  paper: string;
  ink: string;
  waterInk: string;
  waterline: string;
  coast: string;
  border: string;
  graticule: string;
}

export interface CountryProps {
  name: string;
  iso: string;
  continent: string;
  pop: number;
}
export type CountryFeature = Feature<Geometry, CountryProps>;
export interface HoverInfo extends CountryProps {
  x: number;
  y: number;
}

export interface Callbacks {
  onHover: (info: HoverInfo | null) => void;
  onReady: () => void;
}

export interface Level {
  features: CountryFeature[];
  borders: MultiLineString;
  coast: MultiLineString;
  land: MultiPolygon | Polygon;
  shade: number[];
  ice: boolean[];
  bboxes: [number, number, number, number][];
}

export interface LabelInfo {
  x: number;
  y: number;
  area: number;
  width: number;
}

export interface PathCache {
  countries: Path2D[];
  borders: Path2D;
  coast: Path2D;
  land: Path2D;
  labels: LabelInfo[];
  labelOrder: number[];
}
