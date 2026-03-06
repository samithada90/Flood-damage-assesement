# Remote Sensing–Based Flood and Agricultural Damage Assessment in Sri Lanka

This repository contains **Google Earth Engine (GEE) scripts** developed for satellite-based flood and agricultural impact assessment in Sri Lanka following **Cyclone Ditwah**.

The workflows integrate **Sentinel-1 SAR**, **Sentinel-2 optical imagery**, and agricultural datasets to support rapid flood mapping, paddy damage assessment, and recovery monitoring.

This work was developed with technical expertise of the **Food and Agriculture Organization of the United Nations (FAO)**, Sri Lanka as part of efforts to strengthen satellite-based agricultural damage assessment and recovery monitoring.

---

# Repository Contents

## 1. Flood Recession Analysis

Script: `flood_recession_analysis.js`

This script maps **flood persistence and recession patterns** using Sentinel-1 SAR imagery.

### Main steps

- Uses **Sentinel-1 SAR VH polarization**
- Applies **ratio-based flood detection**
- Uses a **baseline flood extent mask** (Source: UNOSAT https://experience.arcgis.com/experience/5936f7e5e2a94ef5a25debf8bbb01810/page/UNOSAT?views=Layers)
- Compares flood conditions across multiple monitoring dates
- Classifies flood recession patterns

### Flood recession classes

| Class | Description |
|------|-------------|
| 1 | Flood drained before Dec 2 |
| 2 | Flood persisted until Dec 2 but drained by Dec 8 |
| 3 | Flood persisted beyond Dec 8 |

The workflow produces a **flood recession classification map for Sri Lanka**.

![Workflow Diagram](Figures/flood_recession_workflow.png)
---

## 2. Multi-Year Paddy Classification (Maha Season)

Script: `ML_based_Paddy_classification.js`

This script generates a **baseline paddy cultivation extent map** using a multi-year machine learning approach.

### Key features

- Multi-year training using **three Maha seasons**
  - Maha 2022/23
  - Maha 2023/24
  - Maha 2024/25

- Combines **Sentinel-2 optical imagery** and **Sentinel-1 SAR**

### Spectral indicators used

- NDVI – Normalized Difference Vegetation Index  
- NDWI – Normalized Difference Water Index  
- EVI – Enhanced Vegetation Index  
- LSWI – Land Surface Water Index  

### Machine learning approach

- Multi-temporal feature generation
- Random Forest classifier
- Spatial filtering to remove noise

![Workflow Diagram](Figures/paddy_classification_workflow.png)

### Output

A **baseline paddy distribution map** for seven major agricultural districts in Sri Lanka.

---

## 3. Paddy Recultivation Monitoring (NDVI Time Series)

Script: `Paddy_recultivation_monitoring.js`

This script creates an **interactive NDVI monitoring tool** to track paddy recovery after flooding.

### Main components

- Sentinel-2 NDVI time-series analysis
- 10-day median compositing
- Field-scale buffer aggregation
- NDVI comparison between flooded and non-flooded areas
- Interactive chart visualization

Users can **click on a flooded paddy location** to generate NDVI recovery curves and compare them with nearby non-flooded reference fields.

This approach helps monitor **post-flood recultivation progress and vegetation recovery**.

![Workflow Diagram](Figures/recultivation_monitoring_workflow.png)
---

# Tools and Platforms

The workflows were implemented using:

- **Google Earth Engine**
- **Sentinel-1 SAR imagery**
- **Sentinel-2 Surface Reflectance**
- **Random Forest machine learning**

---

# Applications

The scripts support:

- Flood occurrence and recession analysis
- Paddy extent mapping
- Flood-impacted agriculture assessment
- Post-flood recultivation monitoring
- Agricultural recovery planning

---

# Related Outputs

### Story Map

https://arcg.is/0abz8P0

### NDVI Recovery Monitoring Application

https://samithada.users.earthengine.app/view/paddy-recultivation-monitor-ndvi

---
# References

Department of Agriculture Sri Lanka. (2025) CROPIX digital agriculture platform. Available at: https://digital.doa.gov.lk/ (Last accessed: 06 March 2026).
