// ============================================================
// Flood Recession Mapping using Sentinel-1 SAR
// Baseline Constrained Approach
// Study Area: Sri Lanka
// ============================================================


// ============================================================
// 1. USER PARAMETERS
// ============================================================

var polarization = "VH";
var floodThreshold = 1.15;      // Adjust between 1.15 – 1.40
var smoothing_radius = 30;

// Study area
var sriLanka = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Sri Lanka'));
var aoi = sriLanka;


// ============================================================
// 2. BASELINE MAXIMUM FLOOD EXTENT
// ============================================================

var baselineFloodExtent = ee.Image(
  'projects/my-study-project-475015/assets/flood_extent'
);

// Ensure binary mask (1 = flooded)
baselineFloodExtent = baselineFloodExtent.gt(0);


// ============================================================
// 3. SENTINEL-1 IMAGE COLLECTION
// ============================================================

var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', polarization))
  .filter(ee.Filter.eq('resolution_meters', 10))
  .filterBounds(aoi)
  .select(polarization);

// Separate ascending and descending passes
var ascCol = collection.filter(ee.Filter.eq('orbitProperties_pass', "ASCENDING"));
var desCol = collection.filter(ee.Filter.eq('orbitProperties_pass', "DESCENDING"));


// ============================================================
// 4. PRE-FLOOD REFERENCE IMAGE
// ============================================================

var preStart = '2025-11-02';
var preEnd   = '2025-11-03';

var ascPre = ascCol.filterDate(preStart, preEnd).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

var desPre = desCol.filterDate(preStart, preEnd).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

print('Pre-flood Asc images:', ascCol.filterDate(preStart, preEnd).size());
print('Pre-flood Des images:', desCol.filterDate(preStart, preEnd).size());


// ============================================================
// 5. FLOOD MONITORING DATES
// ============================================================

// End of baseline flood period
var dec2Start = '2025-12-02';
var dec2End   = '2025-12-03';

// Six days after baseline
var dec8Start = '2025-12-08';
var dec8End   = '2025-12-09';


// ============================================================
// 6. FLOOD DETECTION — DEC 2
// ============================================================

var ascDec2 = ascCol.filterDate(dec2Start, dec2End).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

var desDec2 = desCol.filterDate(dec2Start, dec2End).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

print('Dec 2 Asc images:', ascCol.filterDate(dec2Start, dec2End).size());
print('Dec 2 Des images:', desCol.filterDate(dec2Start, dec2End).size());

// Ratio change detection
var ascFloodDec2 = ascDec2.divide(ascPre).gt(floodThreshold);
var desFloodDec2 = desDec2.divide(desPre).gt(floodThreshold);

// Combine orbit passes
var floodDec2 = ee.ImageCollection([ascFloodDec2, desFloodDec2])
  .max()
  .updateMask(baselineFloodExtent)
  .rename('flood_dec2');


// ============================================================
// 7. FLOOD DETECTION — DEC 8
// ============================================================

var ascDec8 = ascCol.filterDate(dec8Start, dec8End).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

var desDec8 = desCol.filterDate(dec8Start, dec8End).mosaic()
  .focal_mean(smoothing_radius, 'circle', 'meters');

print('Dec 8 Asc images:', ascCol.filterDate(dec8Start, dec8End).size());
print('Dec 8 Des images:', desCol.filterDate(dec8Start, dec8End).size());

var ascFloodDec8 = ascDec8.divide(ascPre).gt(floodThreshold);
var desFloodDec8 = desDec8.divide(desPre).gt(floodThreshold);

var floodDec8 = ee.ImageCollection([ascFloodDec8, desFloodDec8])
  .max()
  .updateMask(baselineFloodExtent)
  .rename('flood_dec8');


// ============================================================
// 8. FLOOD RECESSION CLASSIFICATION
// ============================================================

var recessionClass = ee.Image(0).rename('recession_class');

// Class 1 — Water drained before Dec 2
recessionClass = recessionClass.where(
  baselineFloodExtent.eq(1).and(floodDec2.unmask(0).eq(0)),
  1
);

// Class 2 — Flooded on Dec 2 but drained by Dec 8
recessionClass = recessionClass.where(
  floodDec2.eq(1).and(floodDec8.unmask(0).eq(0)),
  2
);

// Class 3 — Flood persisted beyond Dec 8
recessionClass = recessionClass.where(
  floodDec2.eq(1).and(floodDec8.eq(1)),
  3
);

recessionClass = recessionClass.updateMask(recessionClass.gt(0));


// ============================================================
// 9. VISUALIZATION
// ============================================================

// Set map style and location
Map.setOptions('SATELLITE');
Map.centerObject(aoi, 7);

// Baseline flood extent
Map.addLayer(
  baselineFloodExtent,
  {palette: 'lightblue', opacity: 1},
  'Baseline Flood Extent'
);

// Flood detections
Map.addLayer(floodDec2, {palette: 'blue'}, 'Flood Detection - Dec 2', false);
Map.addLayer(floodDec8, {palette: 'darkblue'}, 'Flood Detection - Dec 8', false);

// Flood recession classification
Map.addLayer(
  recessionClass,
  {min: 1, max: 3, palette: ['#fee5d9', '#fc8d59', '#b30000']},
  'Flood Recession Classes'
);


// ============================================================
// 10. LEGEND
// ============================================================

var legend = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 15px'}
});

legend.add(ui.Label({
  value: 'Flood Recession Classes',
  style: {fontWeight: 'bold', fontSize: '14px'}
}));

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {backgroundColor: color, padding: '8px'}
  });

  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });

  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

legend.add(makeRow('#fee5d9', 'Class 1: Flood drained before Dec 2'));
legend.add(makeRow('#fc8d59', 'Class 2: Flood drained Dec 2–Dec 8'));
legend.add(makeRow('#b30000', 'Class 3: Flood persisted after Dec 8'));

Map.add(legend);


// ============================================================
// 11. EXPORT
// ============================================================

Export.image.toDrive({
  image: recessionClass.clip(aoi),
  description: 'flood_recession_classes',
  folder: 'GEE_Flood_Analysis',
  region: aoi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});