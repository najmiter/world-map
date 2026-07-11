import { geoBounds } from 'd3-geo'
import type { GeoPath } from 'd3-geo'
import { feature as topoFeature, merge as topoMerge, mesh as topoMesh } from 'topojson-client'
import type { FeatureCollection, Geometry, Polygon } from 'geojson'
import type {
  GeometryCollection,
  MultiPolygon as TopoMultiPolygon,
  Polygon as TopoPolygon,
  Topology,
} from 'topojson-specification'
import type { CountryFeature, CountryProps, Level } from './types'
import { hashString, nextTask } from './utils'

export function isIce(p: CountryProps): boolean {
  return p.continent === 'Antarctica' || p.name === 'Greenland'
}

export async function buildLevel(topo: Topology): Promise<Level> {
  const obj = topo.objects.countries as GeometryCollection<CountryProps>
  const fc = topoFeature(topo, obj) as unknown as FeatureCollection<Geometry, CountryProps>
  await nextTask()
  const borders = topoMesh(topo, obj, (a, b) => a !== b)
  await nextTask()
  const coast = topoMesh(topo, obj, (a, b) => a === b)
  await nextTask()
  const land = topoMerge(topo, obj.geometries as Array<TopoPolygon | TopoMultiPolygon>)
  await nextTask()
  const shadeOf = fc.features.map((f) => ((hashString(f.properties.name) % 7) - 3) * 1.5)
  const ice = fc.features.map((f) => isIce(f.properties))
  const bboxes = fc.features.map((f) => {
    const [[l0, p0], [l1, p1]] = geoBounds(f)
    return [l0, p0, l1, p1] as [number, number, number, number]
  })
  return { features: fc.features, borders, coast, land, shade: shadeOf, ice, bboxes }
}

export function mainPolygon(f: CountryFeature, path: GeoPath): Polygon {
  const g = f.geometry
  if (g.type === 'Polygon') return g
  if (g.type === 'MultiPolygon') {
    let best: Polygon = { type: 'Polygon', coordinates: g.coordinates[0] }
    let bestArea = -1
    for (const coords of g.coordinates) {
      const poly: Polygon = { type: 'Polygon', coordinates: coords }
      const a = path.area(poly)
      if (a > bestArea) {
        bestArea = a
        best = poly
      }
    }
    return best
  }
  return { type: 'Polygon', coordinates: [] }
}
