# Registration Type Mapping Guide v2 — optional reference

Private user-supplied business reference; not authorized for public repository publication.
Source: `Cvent_Reg_Type_Mapping_Guide_v2.docx`.
Source SHA-256: `1af14e3e75ca968c1a1514936ff4a086fcf988f9deb459ff10f6d932b4c5b97f`.

## Use only when helpful

Follow [RR interpretation](rr-interpretation.md). Consult this guide only when a registration-type name/code is unfamiliar or its legacy meaning is unclear. Explicit event-specific RR values and confirmed intake take priority. This is supporting context, not a mandatory template, approved event baseline, instruction to migrate all types or permission to edit shared definitions.

Match the relevant legacy name/code row in context; record its source when used. Different names may share a code: do not invert this table into a unique code-to-name mapping or silently correct unusual rows. A missing value is not invalid. Registration-type codes do not establish admission/pass aliases, prices, path assignments or discount eligibility. Derive those relationships from the event RR and verified Cvent observations. Preserve all existing scope, concurrency and safety restrictions.

## Source meaning and transcription

The source describes legacy-to-standardized registration type/code mappings for show builds, registration forms, audience lists and marketing communications. A dash in Old Code means no legacy code existed; the blank new code for No Reg Type Selected remains blank. Literal pipes inside names are preserved as character entities, not column separators. The 122 Master Lookup rows and 35 Unique New Codes rows below are transcribed without corrections. The source's family-grouped section repeats the Master Lookup and is omitted here to avoid duplication. The primary-name index does not override a specific mapping row or the RR.

## Master Lookup — 122 legacy registration types

| Old Reg Type | Old Code | New Reg Type | New Code |
| --- | --- | --- | --- |
| Architect/Designer | AD | Attendee &#124; Architect/Designer | ATTARCH |
| Architect/Designer- New Member | AD-NEW | Attendee &#124; Architect/Designer &#124; New Member | ATTARCHNEW |
| Architect/Designer- NM | AD-NM | Attendee &#124; Architect/Designer &#124; Non Member | ATTARCHNON |
| Association | ASSN | Attendee | ATT |
| Attendee | ATT | Attendee | ATT |
| Broker | BR | Attendee | ATTBUY |
| Buyer | BUY | Attendee &#124; Buyer | ATTBUY |
| Collegiate/School Buyer | CL | Attendee &#124; Buyer | ATTBUY |
| Collegiate/School Buyer - Pre Approved | CL-PA | Attendee &#124; Buyer &#124; Pre-Approved | ATTBUYPRE |
| Conference Attendee | CONF | Attendee | ATT |
| Conference Attendee New Member | CONF-NEW | Attendee &#124; New Member | ATTNEW |
| Conference Attendee Non Member | CONF-NM | Attendee &#124; Non Member | ATTNON |
| Cornerstone Retailer | CR | Attendee &#124; Buyer | ATTBUY |
| Dealership | DS | Attendee | ATT |
| Dealership Speaker | DSPK | Speaker/Presenter | SPKR |
| DIS/NP/TSI | DIS-NP-TSI | Attendee &#124; Importer/Distributor | ATT |
| DIS/NP/TSI- New Member | DIS-NP-TSI-NEW | Attendee &#124; New Member | ATTNEW |
| DIS/NP/TSI- NM | DIS-NP-TSI-NM | Attendee &#124; Non Member | ATTNON |
| Distributer - Fasteners | DIST-FAS | Attendee &#124; Importer/Distributor | ATT |
| Distributer - Others | DIS-OTR | Attendee &#124; Importer/Distributor | ATT |
| Distributor | DIS | Attendee &#124; Importer/Distributor | ATT |
| Educator | EDUC | Attendee &#124; Educator | ATTED |
| Educator- New Member | EDUC-NEW | Attendee &#124; New Member | ATTNEW |
| Educator- NM | EDUC-NM | Attendee &#124; Non Member | ATTNON |
| Exhibitor | EX | Exhibitor &#124; Complimentary | EXCOMP |
| Exhibitor - Comp | EX-COMP | Exhibitor &#124; Complimentary | EXCOMP |
| Exhibitor - Paid | EX-PD | Exhibitor &#124; Paid | EXPAID |
| Exhibitor Appointed Contractor (EAC) | EAC | Exhibitor &#124; Complimentary | EXCOMP |
| Exhibitor Comp - FC | EX COMP-FC | Exhibitor &#124; Complimentary | EXCOMP |
| Exhibitor CS@ED | EX-CSED | Exhibitor &#124; Complimentary | EXCOMP |
| Exhibitor Speaker | EX-SPK | Speaker/Presenter | EXCOMP |
| Exhibitor- Paid | EX-PD | Exhibitor &#124; Paid | EXPAID |
| First Time Attendee | FTA | Attendee | ATT |
| General Attendee | GA | Attendee | ATT |
| Guest | GST | Attendee Guest | ATTGUE |
| Importer/Distributor | ID | Attendee &#124; Importer/Distributor | ATTID |
| Importer/Distributor - Pre Approved | ID-PA | Attendee &#124; Importer/Distributor &#124; Pre-Approved | ATTIDPRE |
| Independent Rep/Dealer/Broker | IR | Attendee Flex &#124; Independent Rep/Dealer/Broker | MANREP |
| Independent Sales Rep | ISR | Manufacturer Rep | MANREP |
| Industry Consultant | IC | Attendee | ATT |
| Industry Consultant- NM | IC-NM | Attendee | ATT |
| Industry Service Provider | ISP | Attendee | ATT |
| Interior Designer | IDE | Attendee | ATTFLX |
| Interior Designer - Pre Approved | IDE - Pre Approved | Attendee &#124; Pre-Approved | ATTFLXPRE |
| Manufacturer - Other | MAN-OTR | Non-Exhibiting Manufacturer | MANREP |
| Manufacturer's Rep | MREP | Manufacturer Rep | MANREP |
| Manufacturer/Manufacturer Rep | — | Manufacturer Rep | MANREP |
| Manufacturers Representative | MR | Manufacturer Rep | MANREP |
| Manufacturers Representative - Non-Exhibiting | MR-NONEX | Non-Exhibiting Manufacturer | NONEX |
| Manufacturers Representative- New Member | MR-NEW | Manufacturer Rep &#124; New Member | MANREPNEW |
| Manufacturers Representative- NM | MR-NM | Manufacturer Rep &#124; Non Member | MANREPNON |
| Manufacturers Representative- Pre Approved | MR-PA | Manufacturer Rep &#124; Pre-Approved | MANREPPRE |
| Master Distributor | MDIST | Attendee | ATT |
| Media | MED | Press/Media &#124; Editorial | PRESSED |
| Media Sales | MEDS | Press/Media &#124; Non-Editorial | PRESSNED |
| Media Sales- Pre Approved | MEDS-PA | Press/Media &#124; Non-Editorial | PRESSNED |
| Minor Guest | MG | Attendee Guest | ATTGUE |
| No Reg Type Selected | ZZ | No Reg Type Selected |  |
| Non Exhibiting Attendee | NONEX-ATT | Non-Exhibiting Manufacturer | NONEX |
| Non Exhibiting Co. | NONEX-CO | Non-Exhibiting Manufacturer | NONEX |
| Non- Exhibiting Supplier/Factory- New Member | NESP-NEW | Non-Exhibiting Manufacturer &#124; New Member | NONEXNEW |
| Non- Exhibiting Supplier/Factory- NM | NESP-NM | Non-Exhibiting Manufacturer &#124; Non Member | NONEXNON |
| Non-Buyer | NB | Attendee | ATT |
| Non-Ex | NONEX | Non-Exhibiting Manufacturer | NONEX |
| Non-exhibiting | NOEXH | Non-Exhibiting Manufacturer | NONEX |
| Non-Exhibiting Manufacturer | NONEX-MAN | Non-Exhibiting Manufacturer | NONEX |
| Non-Exhibiting Manufacturer Non Member | NONEX-MAN-NM | Non-Exhibiting Manufacturer &#124; Non Member | NONEXNON |
| Non-Exhibiting MFG Rep | NEMR | Non-Exhibiting Manufacturer | NONEX |
| Non-Exhibiting Solution Provider | NONEX-SOL | Non-Exhibiting Manufacturer | NONEX |
| Non-Exhibiting Supplier/Factory | NONEX-SUP | Non-Exhibiting Manufacturer | NONEX |
| Non-Retail Buyer | NRB | Attendee &#124; Buyer | ATT |
| Non-Retail Buyer- Pre Approved | NRB-PA | Attendee &#124; Pre-Approved | ATTPRE |
| NONEX- CS@ED | NONEX-CSED | Non-Exhibiting Manufacturer | NONEX |
| OEM | OEM | Attendee | ATT |
| One Day Pass Program | ODPP | Attendee | ATT |
| Personal Buyer | PB | Attendee &#124; Buyer | ATTBUY |
| Potential Exhibitor | PEXH | Non-Exhibiting Manufacturer | NONEX |
| Pre approved Press- WM | Press PA- WM | Press/Media &#124; Editorial &#124; Pre-Approved | PRESSPRE |
| Pre-Approved RB | PA-RB | Attendee &#124; Buyer &#124; Pre-Approved | ATTBUYPRE |
| Press | PRESS | Press/Media &#124; Editorial | PRESSED |
| Press - CSC@ED | — | Press/Media &#124; Editorial | PRESSED |
| Press - New Member | — | Press/Media &#124; Editorial | PRESSED |
| Press - NM | — | Press/Media &#124; Editorial | PRESSED |
| Press- NM | PRESS-NM | Press/Media &#124; Editorial | PRESSED |
| Press-Advertising | PR-ADV | Press/Media &#124; Non-Editorial | PRESSNED |
| Press-Working Media | PR-WM | Press/Media &#124; Editorial | PRESSED |
| Press/Media | PR | Press/Media &#124; Non-Editorial | PRESSNED |
| Press/Media - Pre Approved | PR-PA | Press/Media &#124; Editorial &#124; Pre-Approved | PRESSPRE |
| Retail Buyer | RB | Attendee &#124; Buyer | ATTBUY |
| Retail Buyer - Guest | RB-GST | Attendee Guest | ATTGUE |
| Retail Buyer- Pre Approved | RB-PA | Attendee &#124; Buyer &#124; Pre-Approved | ATTBUYPRE |
| Sales/Marketing | SM | Attendee | ATT |
| Service Provider/Agent | SA | Attendee | ATT |
| Service Provider/Agent - Pre Approved | SA-PA | Attendee &#124; Pre-Approved | ATTPRE |
| Services to the Industry | SERV | Non-Exhibiting Manufacturer | ATT |
| Show Management Guest | SMG | Show Management Guest | SHOWGUE |
| Show Management Guest | SMGST | Show Management Guest | SHOWGUE |
| Small Business Day Pass | SBDP | Attendee | ATT |
| Solution Provider | NONEX-SP | Attendee | NONEX |
| Speaker | SPK | Speaker/Presenter | SPKR |
| Speaker- CS@ED | SPK-CSED | Speaker/Presenter | SPKR |
| Speaker/Presenter | SPKR | Speaker/Presenter | SPKR |
| Sponsor | SPNR | Sponsor &#124; Complimentary | SPONCOMP |
| Spouse / Guest | SPS/GST | Attendee Guest | ATTGUE |
| Staff | ST | Staff | STAFF |
| Staff - CS@ED | — | Staff | STAFF |
| Student | STU | Attendee &#124; Student | ATTSTU |
| Student - New Member | — | Attendee &#124; Student | ATTSTU |
| Student- NM | STU-NM | Attendee &#124; Student | ATTSTU |
| Student-Educator-Military | SEM | Attendee &#124; Government | ATTGOV |
| Students/Faculty | STU-FAC | Attendee &#124; Educator | ATTED |
| Students/Faculty- Pre Approved | STU-FAC-PA | Attendee &#124; Student | ATTSTU |
| Ticket Only | TO | Attendee Flex &#124; Tickets Only | ATTFLXIGUE |
| Tour Only | TOUR | Attendee | ATT |
| Trade | TR | Attendee Flex &#124; Industry Guest | ATT |
| Trade - Pre Approved | TR - Pre Approved | Attendee &#124; Pre-Approved | ATTPRE |
| Trade Guest | TR-GST | Attendee Guest | ATTGUE |
| Vendor - CS@ED | — | Vendor/Supplier | VENDR |
| Vendor/Supplier | VDR | Vendor/Supplier | VENDR |
| Working Media | WM | Press/Media &#124; Editorial | PRESSED |
| Working Media- Pre Approved | WM-PA | Press/Media &#124; Editorial &#124; Pre-Approved | PRESSPRE |
| Youth | YG | Attendee Guest | ATTGUE |

## Unique New Codes Reference — 35 codes

| # | New Reg Code | Primary New Reg Type |
| --- | --- | --- |
| 1 | ATT | Attendee |
| 2 | ATTARCH | Attendee &#124; Architect/Designer |
| 3 | ATTARCHNEW | Attendee &#124; Architect/Designer &#124; New Member |
| 4 | ATTARCHNON | Attendee &#124; Architect/Designer &#124; Non Member |
| 5 | ATTBUY | Attendee &#124; Buyer |
| 6 | ATTBUYPRE | Attendee &#124; Buyer &#124; Pre-Approved |
| 7 | ATTED | Attendee &#124; Educator |
| 8 | ATTFLX | Attendee |
| 9 | ATTFLXIGUE | Attendee Flex &#124; Tickets Only |
| 10 | ATTFLXPRE | Attendee &#124; Pre-Approved |
| 11 | ATTGOV | Attendee &#124; Government |
| 12 | ATTGUE | Attendee Guest |
| 13 | ATTID | Attendee &#124; Importer/Distributor |
| 14 | ATTIDPRE | Attendee &#124; Importer/Distributor &#124; Pre-Approved |
| 15 | ATTNEW | Attendee &#124; New Member |
| 16 | ATTNON | Attendee &#124; Non Member |
| 17 | ATTPRE | Attendee &#124; Pre-Approved |
| 18 | ATTSTU | Attendee &#124; Student |
| 19 | EXCOMP | Exhibitor &#124; Complimentary |
| 20 | EXPAID | Exhibitor &#124; Paid |
| 21 | MANREP | Manufacturer Rep |
| 22 | MANREPNEW | Manufacturer Rep &#124; New Member |
| 23 | MANREPNON | Manufacturer Rep &#124; Non Member |
| 24 | MANREPPRE | Manufacturer Rep &#124; Pre-Approved |
| 25 | NONEX | Non-Exhibiting Manufacturer |
| 26 | NONEXNEW | Non-Exhibiting Manufacturer &#124; New Member |
| 27 | NONEXNON | Non-Exhibiting Manufacturer &#124; Non Member |
| 28 | PRESSED | Press/Media &#124; Editorial |
| 29 | PRESSNED | Press/Media &#124; Non-Editorial |
| 30 | PRESSPRE | Press/Media &#124; Editorial &#124; Pre-Approved |
| 31 | SHOWGUE | Show Management Guest |
| 32 | SPKR | Speaker/Presenter |
| 33 | SPONCOMP | Sponsor &#124; Complimentary |
| 34 | STAFF | Staff |
| 35 | VENDR | Vendor/Supplier |
