// ==========================================================
// MULTI-YEAR PADDY CLASSIFICATION – MAHA SEASON
// Sri Lanka (Seven Districts)
//
// Districts:
// Anuradhapura, Polonnaruwa, Kurunegala,
// Puttalam, Batticaloa, Trincomalee, Mannar
//
// Sensors:
// Sentinel-2 Surface Reflectance
// Sentinel-1 SAR (VV, VH)
//
// Training Seasons:
// Maha 2022/23
// Maha 2023/24
// Maha 2024/25
//
// Output:
// Multi-year baseline paddy map
//
// Author: Samitha Daranagama
// ==========================================================



//###################################################
// 1. STUDY AREA AND DATA
//###################################################

var studyArea = ee.FeatureCollection(
"projects/my-study-project-475015/assets/Maha_season_paddy/Study_region_paddy2"
);

var GT_paddy = ee.FeatureCollection(
"projects/my-study-project-475015/assets/Maha_season_paddy/GT_paddy_Maha2"
);

// Map setup
Map.setOptions('SATELLITE');
Map.centerObject(studyArea, 9);

Map.addLayer(studyArea, {color: 'blue'}, 'Study Area - Seven Districts', false);


//###################################################
// 2. MAHA SEASON DEFINITIONS
//###################################################

var seasons = [
  {name: 'Maha_2022_23', start: '2022-10-01', end: '2023-03-31'},
  {name: 'Maha_2023_24', start: '2023-10-01', end: '2024-03-31'},
  {name: 'Maha_2024_25', start: '2024-10-01', end: '2025-03-31'}
];


//###################################################
// 3. CLOUD MASKING (SENTINEL-2)
//###################################################

function maskS2clouds(image) {

  var qa = image.select('QA60');

  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask)
      .divide(10000)
      .copyProperties(image, ['system:time_start']);
}



//###################################################
// 4. SPECTRAL INDICES
//###################################################

function addS2Indices(image){

  var ndvi = image.normalizedDifference(['B8','B4']).rename('NDVI');

  var ndwi = image.normalizedDifference(['B3','B8']).rename('NDWI');

  var evi = image.expression(
    '2.5*((NIR-RED)/(NIR+6*RED-7.5*BLUE+1))',{
      'NIR':image.select('B8'),
      'RED':image.select('B4'),
      'BLUE':image.select('B2')
  }).rename('EVI');

  var lswi = image.normalizedDifference(['B8','B11']).rename('LSWI');

  return image.addBands([ndvi,ndwi,evi,lswi]);
}



//###################################################
// 5. SENTINEL-1 PROCESSING
//###################################################

function addS1Indices(image){

  var vvVhRatio = image.select('VV')
      .divide(image.select('VH'))
      .rename('VV_VH_ratio');

  var vvVhDiff = image.select('VV')
      .subtract(image.select('VH'))
      .rename('VV_VH_diff');

  return image.addBands([vvVhRatio, vvVhDiff]);
}



//###################################################
// 6. LOAD MULTI-YEAR SENTINEL-2 DATA
//###################################################

function loadS2Season(season){

  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(studyArea)
      .filterDate(season.start,season.end)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',40))
      .map(maskS2clouds)
      .map(addS2Indices);
}

var s2Collections = seasons.map(loadS2Season);

var s2AllSeasons = ee.ImageCollection(s2Collections[0])
  .merge(s2Collections[1])
  .merge(s2Collections[2]);



//###################################################
// 7. LOAD MULTI-YEAR SENTINEL-1 DATA
//###################################################

function loadS1Season(season){

  return ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(studyArea)
    .filterDate(season.start,season.end)
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VV'))
    .filter(ee.Filter.listContains('transmitterReceiverPolarisation','VH'))
    .filter(ee.Filter.eq('instrumentMode','IW'))
    .filter(ee.Filter.eq('orbitProperties_pass','DESCENDING'))
    .select(['VV','VH'])
    .map(addS1Indices);
}

var s1Collections = seasons.map(loadS1Season);

var s1AllSeasons = ee.ImageCollection(s1Collections[0])
  .merge(s1Collections[1])
  .merge(s1Collections[2]);



//###################################################
// 8. MULTI-TEMPORAL FEATURE GENERATION
//###################################################

var s2Bands = ['B2','B3','B4','B8','B11','B12','NDVI','NDWI','EVI','LSWI'];

var s2Composite = s2AllSeasons.select(s2Bands);

var s2Mean = s2Composite.mean()
.rename(s2Bands.map(function(b){return b+'_mean';}));

var s2Median = s2Composite.median()
.rename(s2Bands.map(function(b){return b+'_median';}));

var s2StdDev = s2Composite.reduce(ee.Reducer.stdDev())
.rename(s2Bands.map(function(b){return b+'_sd';}));

var s2Min = s2Composite.reduce(ee.Reducer.min())
.rename(s2Bands.map(function(b){return b+'_min';}));

var s2Max = s2Composite.reduce(ee.Reducer.max())
.rename(s2Bands.map(function(b){return b+'_max';}));

var s2P25 = s2Composite.reduce(ee.Reducer.percentile([25]))
.rename(s2Bands.map(function(b){return b+'_p25';}));

var s2P75 = s2Composite.reduce(ee.Reducer.percentile([75]))
.rename(s2Bands.map(function(b){return b+'_p75';}));

var ndviRange = s2Max.select('NDVI_max')
.subtract(s2Min.select('NDVI_min'))
.rename('NDVI_range');

var lswiEarly = s2P25.select('LSWI_p25')
.rename('LSWI_early');


// Sentinel-1 features
var s1Bands = ['VV','VH','VV_VH_ratio','VV_VH_diff'];

var s1Composite = s1AllSeasons.select(s1Bands);

var s1Mean = s1Composite.mean()
.rename(s1Bands.map(function(b){return 'S1_'+b+'_mean';}));

var s1Median = s1Composite.median()
.rename(s1Bands.map(function(b){return 'S1_'+b+'_median';}));

var s1StdDev = s1Composite.reduce(ee.Reducer.stdDev())
.rename(s1Bands.map(function(b){return 'S1_'+b+'_sd';}));

var s1Min = s1Composite.reduce(ee.Reducer.min())
.rename(s1Bands.map(function(b){return 'S1_'+b+'_min';}));

var s1Max = s1Composite.reduce(ee.Reducer.max())
.rename(s1Bands.map(function(b){return 'S1_'+b+'_max';}));


var compositeFeatures = s2Mean
.addBands(s2Median)
.addBands(s2StdDev)
.addBands(s2Min)
.addBands(s2Max)
.addBands(s2P25)
.addBands(s2P75)
.addBands(ndviRange)
.addBands(lswiEarly)
.addBands(s1Mean)
.addBands(s1Median)
.addBands(s1StdDev)
.addBands(s1Min)
.addBands(s1Max)
.clip(studyArea);



//###################################################
// 9. TRAINING DATA
//###################################################

var training = compositeFeatures.sampleRegions({
  collection: GT_paddy,
  properties:['type'],
  scale:10,
  geometries:true
});

var validTraining = training.filter(
  ee.Filter.notNull(compositeFeatures.bandNames())
);

var trainingData = validTraining.randomColumn('random',42);

var split = 0.8;

var trainingSet = trainingData.filter(ee.Filter.lt('random',split));
var validationSet = trainingData.filter(ee.Filter.gte('random',split));



//###################################################
// 10. RANDOM FOREST TRAINING
//###################################################

var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees:150,
  bagFraction:0.5,
  seed:42
}).train({
  features:trainingSet,
  classProperty:'type',
  inputProperties:compositeFeatures.bandNames()
});



//###################################################
// 11. CLASSIFICATION
//###################################################

var classified = compositeFeatures.classify(classifier);

// 1 = paddy
// 2 = non-paddy

var paddyLayer = classified
.remap([1,2],[1,0])
.rename('paddy');



//###################################################
// 12. POST-PROCESSING
//###################################################

var paddyFiltered = paddyLayer.focal_median({
  radius:1.5,
  kernelType:'square',
  units:'pixels'
});

var paddyFilteredInt = paddyFiltered.toInt();

var paddyPatches = paddyFilteredInt.selfMask()
.connectedPixelCount({
  maxSize:256,
  eightConnected:true
});

var minPatchSize = 5;

var paddyClean = paddyFilteredInt.updateMask(
  paddyPatches.gte(minPatchSize)
);



//###################################################
// 13. EXPORT FINAL BASELINE MAP
//###################################################

Export.image.toDrive({
  image:paddyClean.toFloat(),
  description:'Paddy_Baseline_Maha_MultiYear_2022_2025',
  folder:'GEE_Exports',
  scale:10,
  region:studyArea.geometry(),
  maxPixels:1e13,
  crs:'EPSG:32644'
});


//###################################################
// Visualization
//###################################################

Map.addLayer(
  paddyClean.selfMask(),
  {palette:['darkgreen']},
  'Paddy Map (Multi-year Baseline)',
  false
);

print('===================================');
print('MULTI-YEAR PADDY CLASSIFICATION COMPLETE');
print('Training seasons: Maha 2022/23 – 2024/25');
print('Sensors: Sentinel-2 + Sentinel-1');
print('Study area: Seven districts of Sri Lanka');
print('===================================');