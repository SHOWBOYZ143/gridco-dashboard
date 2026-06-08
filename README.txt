GRIDCO DAILY OPERATIONS DASHBOARD
==================================
Author:  Samuel NSP
Project: GRIDCo OF-10 Report Parser & Dashboard

FOLDER CONTENTS
---------------
app.py               - Streamlit web dashboard (10 tabs, full interactive UI)
parse.py             - Command-line parser (outputs JSON)
pdf_parser.py        - PDF text extraction (all 22 sections)
chart_digitizer.py   - Chart image digitization (load curve + voltage trends)
schema.py            - Data structures for all report sections
common.py            - Shared utility functions
config.py            - App constants and settings
file_helpers.py      - File type detection helpers
excel_parser.py      - Excel report parser (future use)
export_service.py    - JSON/Excel export helpers
requirements.txt     - Python dependencies

SETUP (run once)
----------------
pip install -r requirements.txt

RUN THE DASHBOARD
-----------------
streamlit run app.py

Then open http://localhost:8501 in your browser.
Upload any GRIDCo OF-10 PDF using the sidebar uploader.

RUN THE CLI PARSER (no dashboard)
----------------------------------
python parse.py OF10_04-05-2026_energydir.pdf
python parse.py OF10_04-05-2026_energydir.pdf output/04-05-2026.json

WHAT GETS EXTRACTED
--------------------
22/22 sections including:
  - Key stats, peak data, plant generation, unit loadings
  - System frequency, stability, international lines
  - Energy exchanges, forecasts, hydrology
  - Gas supply, liquid fuel stocks, intertie programme
  - Major incidents, constraints, AFLS operations
  - System voltages
  - Load curve (digitized from chart image)
  - Voltage trends (digitized from chart images, 10 nodes)

REQUIREMENTS
------------
Python 3.10 or higher
