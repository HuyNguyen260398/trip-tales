"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { listMediaByTrip } from "@/lib/media";
import { toFeatures, centroid } from "@/lib/cluster";
import MediaPreview from "./MediaPreview";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export default function PhotoMap({ tripId }: { tripId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const media = useLiveQuery(() => listMediaByTrip(tripId), [tripId]);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !media) return;

    const features = toFeatures(media);
    const apply = () => {
      const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
      if (map.getSource("media")) {
        (map.getSource("media") as maplibregl.GeoJSONSource).setData(data);
        return;
      }
      map.addSource("media", { type: "geojson", data, cluster: true, clusterRadius: 60 });
      map.addLayer({
        id: "clusters", type: "circle", source: "media", filter: ["has", "point_count"],
        paint: { "circle-color": "#fff", "circle-radius": 18, "circle-opacity": 0.85 },
      });
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "media", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13 },
      });
      map.addLayer({
        id: "points", type: "circle", source: "media", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": "#3b82f6", "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
      });
      // Tap a cluster → zoom in.
      map.on("click", "clusters", (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const id = f.properties?.cluster_id;
        (map.getSource("media") as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(id)
          .then((z) => map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
      });
      // Tap a pin → preview.
      map.on("click", "points", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.thumbPath) setPreviewPath(f.properties.thumbPath as string);
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    // Frame the trip on first data.
    const c = centroid(media);
    if (c) map.easeTo({ center: [c.lng, c.lat], zoom: 9 });
  }, [media]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {previewPath && <MediaPreview thumbOrPath={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  );
}
