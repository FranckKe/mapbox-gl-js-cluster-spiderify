// Expand cluster leaves on click (spiderify) using mapbox marker or a circle layer
// Expanded cluster reset on click and on zoom
// See options below to customize behaviour

// Known bugs
// Double clicking on cluster zoom and spiderify zoom - 1

// Based on Mapbox cluster example https://docs.mapbox.com/mapbox-gl-js/example/cluster/1
// Spiral credits
// http://jsfiddle.net/gjowrfcd/1/
// http://jsfiddle.net/uh1rLvj2/
// Circle credits
// https://stackoverflow.com/questions/24273990/calculating-evenly-spaced-points-on-the-perimeter-of-a-circle

mapboxgl.accessToken = ""; // Your Mapbox token here
const SOURCE_EARTHQUAKE = "earthquakes";

const SPIDERIFY_AFTER_ZOOM = 4; // Spiderify after zoom N, zoom otherwise
const SPIDER_TYPE = "layer"; // marker: use Mapbox's Marker. layer: Use a Mabpbox point layer
const MAX_LEAVES_TO_SPIDERIFY = 255; // Max leave to display when spiderify to prevent filling the map with leaves
const CIRCLE_TO_SPIRAL_SWITCHOVER =
  SPIDER_TYPE.toLowerCase() === "marker" ? 10 : 15; // When below number, will display leave as a circle. Over, as a spiral

const CIRCLE_OPTIONS = {
  distanceBetweenPoints: 50
};

const SPIRAL_OPTIONS = {
  rotationsModifier: 1250, // Higher modifier = closer spiral lines
  distanceBetweenPoints: SPIDER_TYPE.toLowerCase() === "marker" ? 42 : 32, // Distance between points in spiral
  radiusModifier: 50000, // Spiral radius
  lengthModifier: 1000 // Spiral length modifier
};

const SPIDER_LEGS = true;
const SPIDER_LEGS_LAYER_NAME = `spider-legs-${Math.random()
  .toString(36)
  .substr(2, 9)}`;
const SPIDER_LEGS_PAINT_OPTION = {
  "line-width": 3,
  "line-color": "rgba(128, 128, 128, 0.5)"
};

const SPIDER_LEAVES_LAYER_NAME = `spider-leaves-${Math.random()
  .toString(36)
  .substr(2, 9)}`;
const SPIDER_LEAVES_PAINT_OPTION = {
  "circle-color": "orange",
  "circle-radius": 6,
  "circle-stroke-width": 1,
  "circle-stroke-color": "#fff"
};

let clusterMarkers = [];
let spiderifiedCluster = {};

let map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v10",
  center: [-103.59179687498357, 40.66995747013945],
  zoom: 3
});

function clearSpiderifiedMarkers() {
  if (clusterMarkers.length > 0) {
    for (let i = 0; i < clusterMarkers.length; i++) {
      clusterMarkers[i].remove();
    }
  }
  clusterMarkers = [];
}

function removeSourceAndLayer(map, id) {
  if (map.getLayer(id) != null) map.removeLayer(id);
  if (map.getSource(id) != null) map.removeSource(id);
}

function clearSpiderifiedCluster() {
  spiderifiedCluster = {};
  spiderLeavesCollection = [];
  removeSourceAndLayer(map, SPIDER_LEGS_LAYER_NAME);
  removeSourceAndLayer(map, SPIDER_LEAVES_LAYER_NAME);
  clearSpiderifiedMarkers();
}

function generateEquidistantPointsInCircle({
  totalPoints = 1,
  options = CIRCLE_OPTIONS
}) {
  let points = [];
  let theta = (Math.PI * 2) / totalPoints;
  let angle = theta;
  for (let i = 0; i < totalPoints; i++) {
    angle = theta * i;
    points.push({
      x: options.distanceBetweenPoints * Math.cos(angle),
      y: options.distanceBetweenPoints * Math.sin(angle)
    });
  }
  return points;
}

function generateEquidistantPointsInSpiral({
  totalPoints = 10,
  options = SPIRAL_OPTIONS
}) {
  let points = [{ x: 0, y: 0 }];
  // Higher modifier = closer spiral lines
  const rotations = totalPoints * options.rotationsModifier;
  const distanceBetweenPoints = options.distanceBetweenPoints;
  const radius = totalPoints * options.radiusModifier;
  // Value of theta corresponding to end of last coil
  const thetaMax = rotations * 2 * Math.PI;
  // How far to step away from center for each side.
  const awayStep = radius / thetaMax;
  for (
    let theta = distanceBetweenPoints / awayStep;
    points.length <= totalPoints + options.lengthModifier;

  ) {
    points.push({
      x: Math.cos(theta) * (awayStep * theta),
      y: Math.sin(theta) * (awayStep * theta)
    });
    theta += distanceBetweenPoints / (awayStep * theta);
  }
  return points.slice(0, totalPoints);
}

function generateLeavesCoordinates({ nbOfLeaves }) {
  // Position cluster's leaves in circle if below threshold, spiral otherwise
  if (nbOfLeaves < CIRCLE_TO_SPIRAL_SWITCHOVER) {
    points = generateEquidistantPointsInCircle({
      totalPoints: nbOfLeaves
    });
  } else {
    points = generateEquidistantPointsInSpiral({
      totalPoints: nbOfLeaves
    });
  }
  return points;
}

function spiderifyCluster({ map, source, clusterToSpiderify }) {
  let spiderlegsCollection = [];
  let spiderLeavesCollection = [];

  map
    .getSource(source)
    .getClusterLeaves(
      clusterToSpiderify.id,
      MAX_LEAVES_TO_SPIDERIFY,
      0,
      (error, features) => {
        if (error) {
          console.warning("Cluster does not exists on this zoom");
          return;
        }

        let leavesCoordinates = generateLeavesCoordinates({
          nbOfLeaves: features.length
        });

        let clusterXY = map.project(clusterToSpiderify.coordinates);

        // Generate spiderlegs and leaves coordinates
        features.forEach((element, index) => {
          let spiderLeafLatLng = map.unproject([
            clusterXY.x + leavesCoordinates[index].x,
            clusterXY.y + leavesCoordinates[index].y
          ]);

          if (SPIDER_TYPE.toLowerCase() === "marker") {
            clusterMarkers.push(
              new mapboxgl.Marker().setLngLat(spiderLeafLatLng)
            );
          }
          if (SPIDER_TYPE.toLowerCase() === "layer") {
            spiderLeavesCollection.push({
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [spiderLeafLatLng.lng, spiderLeafLatLng.lat]
              }
            });
          }

          if (SPIDER_LEGS) {
            spiderlegsCollection.push({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  clusterToSpiderify.coordinates,
                  [spiderLeafLatLng.lng, spiderLeafLatLng.lat]
                ]
              }
            });
          }
        });

        // Draw spiderlegs and leaves coordinates
        if (SPIDER_LEGS) {
          map.addLayer({
            id: SPIDER_LEGS_LAYER_NAME,
            type: "line",
            source: {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: spiderlegsCollection
              }
            },
            paint: SPIDER_LEGS_PAINT_OPTION
          });
        }

        if (SPIDER_TYPE.toLowerCase() === "marker") {
          clusterMarkers.forEach(marker => marker.addTo(map));
        }
        if (SPIDER_TYPE.toLowerCase() === "layer") {
          map.addLayer({
            id: SPIDER_LEAVES_LAYER_NAME,
            type: "circle",
            source: {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: spiderLeavesCollection
              }
            },
            paint: SPIDER_LEAVES_PAINT_OPTION
          });
        }
      }
    );
}

map.on("load", () => {
  map
    .on("click", "clusters", e => {
      let features = map.queryRenderedFeatures(e.point, {
        layers: ["clusters"]
      });
      let clusterId = features[0].properties.cluster_id;

      // Zoom on cluster or spiderify it
      if (map.getZoom() < SPIDERIFY_AFTER_ZOOM) {
        map
          .getSource(SOURCE_EARTHQUAKE)
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom
            });
          });
      } else {
        spiderifiedCluster = {
          id: clusterId,
          coordinates: features[0].geometry.coordinates
        };
        spiderifyCluster({
          map: map,
          source: SOURCE_EARTHQUAKE,
          clusterToSpiderify: spiderifiedCluster
        });
      }
    })
    .on("click", e => {
      clearSpiderifiedCluster();
    })
    .on("zoomstart", () => {
      clearSpiderifiedCluster();
    });

  // From https://docs.mapbox.com/mapbox-gl-js/example/cluster/
  // Start of Mapbox cluster example
  map.addSource(SOURCE_EARTHQUAKE, {
    type: "geojson",
    data: "https://docs.mapbox.com/mapbox-gl-js/assets/earthquakes.geojson",
    cluster: true,
    clusterMaxZoom: 14, // Max zoom to cluster points on
    clusterRadius: 50 // Radius of each cluster when clustering points (defaults to 50)
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: SOURCE_EARTHQUAKE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#51bbd6",
        100,
        "#f1f075",
        750,
        "#f28cb1"
      ],
      "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40]
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: SOURCE_EARTHQUAKE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-size": 12
    }
  });

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: SOURCE_EARTHQUAKE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#11b4da",
      "circle-radius": 4,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff"
    }
  });

  map.addControl(
    new mapboxgl.ScaleControl({
      maxWidth: 80,
      unit: "metric"
    })
  );

  map.on(
    "mouseenter",
    "clusters",
    () => (map.getCanvas().style.cursor = "pointer")
  );

  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
  // End of Mapbox cluster example
});
