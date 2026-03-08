// ============================================================
// Paddy Recultivation Monitoring App
// NDVI Time Series Analysis after Flooding
//
// Features
// • Sentinel-2 NDVI time series
// • 10-day median compositing
// • Field-scale buffer aggregation
// • ΔNDVI comparison between flooded and non-flooded paddy
//
// Interaction
// Click a flooded paddy pixel to compare NDVI recovery trends.
//
// Input
// Raster layer containing paddy flood status
// 1 = Flooded
// 0 = Non-flooded
//
// Author: Samitha
// ============================================================



// ============================================================
// 1. INPUT DATA
// ============================================================

var paddyFloodStatus = ee.Image(
  'projects/my-study-project-475015/assets/Maha_season_paddy/paddy_flood_status'
);

// Flood status masks
var floodedMask    = paddyFloodStatus.eq(1);
var nonFloodedMask = paddyFloodStatus.eq(0);


// ============================================================
// 2. TIME SETTINGS
// ============================================================

// NDVI monitoring period start
var preFloodStart = '2025-05-26';
// NOTE: End date is now derived dynamically from s2raw (see Section 5)

// Flood event window (display only)
var floodWindowLabel = 'Flood window: 2025-11-26 to 2025-12-08';


// ============================================================
// 3. ANALYSIS PARAMETERS
// ============================================================

// Buffer distances (meters)
var floodedBufferDistance = 50;   // flooded field scale
var refBufferDistance     = 500;  // landscape reference

// Temporal compositing interval
var stepDays = 10;


// ============================================================
// 4. STUDY AREA BOUNDS
// ============================================================

var bounds = paddyFloodStatus.geometry().bounds();


// ============================================================
// 5. SENTINEL-2 NDVI PREPARATION
// ============================================================

// Use far-future date as open-ended upper bound so s2raw always
// captures the latest available acquisitions without hardcoding a date.
var s2raw = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(bounds)
  .filterDate(preFloodStart, '2099-01-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .map(function (img) {

    // Scene classification mask
    var scl = img.select('SCL');

    var good = scl.neq(3)   // cloud shadow
      .and(scl.neq(8))      // medium cloud
      .and(scl.neq(9))      // high cloud
      .and(scl.neq(10))     // cirrus
      .and(scl.neq(11));    // snow/ice

    // NDVI calculation
    var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');

    return ndvi
      .updateMask(good)
      .copyProperties(img, ['system:time_start']);
  });

// Derive the latest available S-2 date directly from the filtered
// collection. Adding 1 day ensures the final composite window is
// inclusive (GEE filterDate end is exclusive).
var latestS2Date = s2raw
  .sort('system:time_start', false)
  .first()
  .date()
  .advance(1, 'day');


// ============================================================
// 6. TEMPORAL COMPOSITING (10-DAY MEDIAN)
// ============================================================

function compositeByStep(ic, startDateStr, endDate, stepDays) {

  var start = ee.Date(startDateStr);
  var end   = ee.Date(endDate);   // accepts both ee.Date and string

  var nSteps = end.difference(start, 'day')
    .divide(stepDays)
    .ceil();

  var stepList = ee.List.sequence(0, nSteps.subtract(1));

  return ee.ImageCollection(stepList.map(function (i) {

    i = ee.Number(i);

    var winStart = start.advance(i.multiply(stepDays), 'day');
    var winEnd   = winStart.advance(stepDays, 'day');

    var win = ic.filterDate(winStart, winEnd);
    var med = win.median();

    return med
      .set('system:time_start', winStart.millis())
      .set('window_start', winStart.format('YYYY-MM-dd'))
      .set('window_end', winEnd.format('YYYY-MM-dd'));
  }));
}

var s2 = compositeByStep(s2raw, preFloodStart, latestS2Date, stepDays);


// ============================================================
// 7. USER INTERFACE PANEL
// ============================================================

var panel = ui.Panel({
  style: { width: '500px', padding: '8px' }
});

var title = ui.Label(
  'Paddy Recultivation Monitor (NDVI)',
  { fontSize: '18px', fontWeight: 'bold' }
);

var instructions = ui.Label(

  'Click a FLOODED paddy pixel (status=1) to plot (10-day median):\n\n' +
  '🔴 Flooded pixels (' + floodedBufferDistance + 'm buffer median)\n' +
  '🟢 Non-flooded reference (' + refBufferDistance + 'm buffer median)\n' +
  '⚫ ΔNDVI = Flooded − Reference\n\n' +
  'Interpretation:\n' +
  '• ΔNDVI approaching 0 ⇒ recovery toward local baseline\n' +
  '• Both curves use field-scale aggregation',

  { whiteSpace: 'pre', fontSize: '12px' }
);

var statusLabel = ui.Label(
  'Ready. Click on the map.',
  { fontSize: '12px' }
);

panel
  .add(title)
  .add(instructions)
  .add(ui.Label('---------------------------------------------'))
  .add(statusLabel);

// Display the dynamically resolved latest S-2 date in the panel
latestS2Date.advance(-1, 'day').format('YYYY-MM-dd').evaluate(function (dateStr) {
  panel.add(ui.Label(
    '🛰️ S-2 data through: ' + dateStr,
    { fontSize: '11px', color: 'gray' }
  ));
});

ui.root.insert(0, panel);


// ============================================================
// 8. MAP DISPLAY
// ============================================================

Map.setOptions('HYBRID');
Map.centerObject(bounds, 10);

Map.addLayer(
  nonFloodedMask.selfMask(),
  { palette: ['00AA00'] },
  'Non-flooded paddy (0)',
  false
);

Map.addLayer(
  floodedMask.selfMask(),
  { palette: ['FFA500'] },
  'Flooded paddy (1)',
  true
);


// ============================================================
// 9. MAP CLICK HANDLER
// ============================================================

Map.onClick(function (coords) {

  panel.widgets().set(
    3,
    ui.Label('⏳ Processing…', { fontSize: '12px' })
  );

  var pt = ee.Geometry.Point([coords.lon, coords.lat]);

  // Check flood status
  var sample = paddyFloodStatus.sample({
    region: pt,
    scale: 10,
    numPixels: 1,
    geometries: false
  }).first();

  sample.evaluate(function (f) {

    if (!f) {

      panel.widgets().set(
        3,
        ui.Label('❌ No paddy status at this location.', { fontSize: '12px' })
      );

      return;
    }

    var props = f.properties;
    var keys  = Object.keys(props);
    var v     = props[keys[0]];

    if (v !== 1) {

      panel.widgets().set(
        3,
        ui.Label(
          '⚠️ This pixel is NOT flooded (status ≠ 1). Click a flooded area.',
          { fontSize: '12px' }
        )
      );

      return;
    }


    // ------------------------------------------------
    // Define analysis regions
    // ------------------------------------------------

    var floodedRegion = ee.Feature(
      pt.buffer(floodedBufferDistance),
      { label: 'Flooded (' + floodedBufferDistance + 'm buffer)' }
    );

    var refRegion = ee.Feature(
      pt.buffer(refBufferDistance),
      { label: 'Non-flooded reference (' + refBufferDistance + 'm)' }
    );


    // ------------------------------------------------
    // Extract NDVI time series
    // ------------------------------------------------

    var perStepFC = ee.FeatureCollection(

      s2.map(function (img) {

        img = ee.Image(img);

        var t = ee.Date(img.get('system:time_start'));

        var ndviFlood = img.updateMask(floodedMask).reduceRegion({
          reducer: ee.Reducer.median(),
          geometry: floodedRegion.geometry(),
          scale: 10,
          maxPixels: 1e6
        }).get('NDVI');

        var ndviRef = img.updateMask(nonFloodedMask).reduceRegion({
          reducer: ee.Reducer.median(),
          geometry: refRegion.geometry(),
          scale: 10,
          maxPixels: 1e6
        }).get('NDVI');


        // Replace null values
        var safeFlood = ee.Number(
          ee.Algorithms.If(ndviFlood, ndviFlood, -9999)
        );

        var safeRef = ee.Number(
          ee.Algorithms.If(ndviRef, ndviRef, -9999)
        );

        var delta = ee.Number(
          ee.Algorithms.If(
            ee.Number(safeFlood).gt(-9999)
            .and(ee.Number(safeRef).gt(-9999)),
            safeFlood.subtract(safeRef),
            -9999
          )
        );

        return ee.Feature(null, {
          'system:time_start': t.millis(),
          'Flooded NDVI':      safeFlood,
          'Reference NDVI':    safeRef,
          'ΔNDVI (Flood-Ref)': delta
        });

      })
    );


    // ------------------------------------------------
    // Remove invalid values
    // ------------------------------------------------

    var validFC = perStepFC.filter(
      ee.Filter.and(
        ee.Filter.gt('Flooded NDVI',      -9999),
        ee.Filter.gt('Reference NDVI',    -9999),
        ee.Filter.gt('ΔNDVI (Flood-Ref)', -9999)
      )
    );


    // ------------------------------------------------
    // Create chart
    // ------------------------------------------------

    var chart = ui.Chart.feature.byFeature({
      features: validFC,
      xProperty: 'system:time_start',
      yProperties: [
        'Flooded NDVI',
        'Reference NDVI',
        'ΔNDVI (Flood-Ref)'
      ]
    })
      .setChartType('LineChart')
      .setOptions({

        title: '10-day Median NDVI & ΔNDVI (Field-Scale Comparison)',

        hAxis: {
          title: 'Date',
          format: 'MMM yyyy',
          gridlines: { color: '#e0e0e0' }
        },

        vAxes: {

          0: {
            title: 'NDVI',
            viewWindow: { min: -0.2, max: 1.0 },
            gridlines: { color: '#f0f0f0' }
          },

          1: {
            title: 'ΔNDVI',
            viewWindow: { min: -0.6, max: 0.6 },
            gridlines: { color: '#f0f0f0' }
          }
        },

        series: {
          0: { targetAxisIndex: 0, color: 'red',   lineWidth: 2.5, pointSize: 4 },
          1: { targetAxisIndex: 0, color: 'green', lineWidth: 2.5, pointSize: 4 },
          2: { targetAxisIndex: 1, color: 'black', lineWidth: 2,   pointSize: 3 }
        },

        legend: { position: 'top', maxLines: 2 },
        interpolateNulls: true,
        pointSize: 4,
        chartArea: { width: '80%', height: '70%' }

      });


    // Remove old charts (keep first 4 fixed widgets)
    while (panel.widgets().length() > 4) {
      panel.remove(panel.widgets().get(4));
    }


    // Add new chart
    panel.add(chart);

    panel.add(
      ui.Label(floodWindowLabel,
      { fontSize: '11px', color: 'blue' })
    );

    panel.add(
      ui.Label(
        '📊 Both lines use median aggregation over buffer areas\n' +
        '💡 ΔNDVI near 0 = flooded area behaving like local non-flooded baseline',
        { fontSize: '11px', whiteSpace: 'pre' }
      )
    );


    // Update status
    panel.widgets().set(
      3,
      ui.Label(
        '✅ Chart generated | Lat: ' + coords.lat.toFixed(4) +
        ', Lon: ' + coords.lon.toFixed(4) + '\n' +
        '   Flooded buffer: ' + floodedBufferDistance +
        'm | Reference buffer: ' + refBufferDistance + 'm',
        { fontSize: '12px', whiteSpace: 'pre' }
      )
    );

  });

});


print('✅ App loaded. Click a flooded paddy pixel (status=1) to analyze recovery.');
print('📌 Buffer sizes: Flooded=' + floodedBufferDistance + 'm, Reference=' + refBufferDistance + 'm');