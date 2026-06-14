/**
 * Sample fallback data (spec §11) — used ONLY when data/*.json is absent so the
 * app still runs. Everything is tagged source = "sample" so it can never be
 * mistaken for a real record. Mirrors the shape of the real JSON files.
 */

export const SAMPLE_GBA = {
  total_wards: 369,
  total_divisions: 50,
  total_subdivisions: 150,
  corporations: [
    { code: "KENDRA", name: "Bengaluru Central", name_kn: null, wards: 63, divisions: 7, subdivisions: 24, annexure: "01", assembly_constituencies: ["163-Shanthinagar", "169-Chickpet"], ward_list: [] },
    { code: "PURVA", name: "Bengaluru East", name_kn: null, wards: 50, divisions: 7, subdivisions: 22, annexure: "02", assembly_constituencies: ["174-Mahadevapura"], ward_list: [] },
    { code: "PASHCHIMA", name: "Bengaluru West", name_kn: null, wards: 112, divisions: 15, subdivisions: 45, annexure: "03", assembly_constituencies: ["167-Vijayanagar"], ward_list: [] },
    { code: "UTTARA", name: "Bengaluru North", name_kn: null, wards: 72, divisions: 11, subdivisions: 30, annexure: "04", assembly_constituencies: ["150-Yelahanka"], ward_list: [] },
    { code: "DAKSHINA", name: "Bengaluru South", name_kn: null, wards: 72, divisions: 10, subdivisions: 29, annexure: "05", assembly_constituencies: ["175-Bommanahalli", "173-Jayanagar"], ward_list: [] },
  ],
};

export const SAMPLE_WARDS = {
  source: "sample",
  count: 5,
  groups: 4,
  wards: [
    { new_no: 1, new_name: "Kempegowda Ward", property_count: 17489, zone: "Yelahanka", ac: "150-Yelahanka", division: "Yelahanka", old_subdiv: "Yelahanka", eng_subdiv: "Yelahanka", eng_subdiv_sl: 1, old_wards: ["1-Kempegowda Ward"] },
    { new_no: 50, new_name: "Vijayanagar", property_count: 12110, zone: "West", ac: "167-Vijayanagar", division: "Vijayanagar", old_subdiv: "Vijayanagar", eng_subdiv: "Vijayanagar", eng_subdiv_sl: 2, old_wards: ["100-Vijayanagar"] },
    { new_no: 120, new_name: "Shanthinagar", property_count: 9870, zone: "East", ac: "163-Shanthinagar", division: "Shanthinagar", old_subdiv: "Shanthi Nagar", eng_subdiv: "Shanthi Nagar", eng_subdiv_sl: 3, old_wards: [] },
    { new_no: 175, new_name: "Bommanahalli", property_count: 15320, zone: "Bommanahalli", ac: "175-Bommanahalli", division: "Bommanahalli", old_subdiv: "Bommanahalli", eng_subdiv: "Bommanahalli", eng_subdiv_sl: 4, old_wards: ["175-Bommanahalli"] },
    { new_no: 173, new_name: "Jayanagar", property_count: 11200, zone: "South", ac: "173-Jayanagar", division: "Jayanagar", old_subdiv: "Jayanagar", eng_subdiv: "Jayanagar", eng_subdiv_sl: 5, old_wards: ["170-Jayanagar"] },
  ],
};

export const SAMPLE_ENGINEERS = {
  note: "Sample fallback contacts — not real records.",
  by_eng_subdiv: {
    Yelahanka: { name: "Sample AEE Yelahanka", designation: "Assistant Executive Engineer", phone: "9000000001", address: "Yelahanka Sub-Division Office", verified: false },
    Vijayanagar: { name: "Sample EE Vijayanagar", designation: "Executive Engineer", phone: "9000000002", address: "Vijayanagar Sub-Division Office", verified: true },
    "Shanthi Nagar": { name: "Sample Ward Engineer", designation: "Ward Engineer", phone: "9000000003", address: "Shanthinagar Ward Office", verified: false },
    Bommanahalli: { name: "Sample JE Bommanahalli", designation: "Junior Engineer", phone: "9000000004", address: "Bommanahalli Office", verified: true },
    Jayanagar: { name: "Sample Health Officer", designation: "Health Officer", phone: "9000000005", address: "Jayanagar Office", verified: true },
  },
};

export const SAMPLE_COMPLAINTS = [
  { title: "Pothole on 4th Main", type: "road", ward_new_no: 1, status: "SUBMITTED", complaint_number: "SAMPLE-001", reminder_flag: true },
  { title: "Overflowing drain near park", type: "drain", ward_new_no: 175, status: "UNDER_REVIEW", complaint_number: "SAMPLE-002", reminder_flag: false },
  { title: "RTI on road-works tender", type: "RTI", ward_new_no: 50, status: "REPLY_RECEIVED", rti_number: "RTI-SAMPLE-003", reminder_flag: false },
];
