/**
 * Builds data/gba_369_wards.json from the GBA "5 City Corporation Division &
 * Sub-Division Details" memo (06-03-2026), Annexures 1-5.
 *
 * Source PDF is a scanned Kannada document. Ward / division / sub-division
 * names below are an English romanisation of the Kannada source, normalised
 * against the BBMP-225 English ward list where the same locality appears.
 * `name_kn` preserves the Kannada as read for later correction.
 *
 * NOTE: a handful of ward names (flagged with a trailing "(?)" in name_kn)
 * were only partly legible in the scan and are best-effort.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Ward = [no: number, en: string, kn: string];
interface Corp {
  code: string;
  name: string;
  annexure: string;
  divisions: { name: string; ac?: string; subdivisions: { name: string; wards: Ward[] }[] }[];
}

const CORPS: Corp[] = [
  // ───────────────────────── ANNEXURE-1 · KENDRA (Bengaluru Central) ─────────────────────────
  {
    code: "KENDRA",
    name: "Bengaluru Central",
    annexure: "01",
    divisions: [
      {
        name: "Shivajinagar",
        ac: "162-Shivajinagar",
        subdivisions: [
          { name: "Shivajinagar", wards: [[1, "Ramaswamy Palya", "ರಾಮಸ್ವಾಮಿ ಪಾಳ್ಯ"], [2, "Jayamahal", "ಜಯಮಹಲ್"], [5, "Shivajinagar", "ಶಿವಾಜಿನಗರ"]] },
          { name: "Vasanthanagar", wards: [[3, "Vasanthanagar", "ವಸಂತ ನಗರ"], [4, "Sampangiram Nagar", "ಸಂಪಂಗಿರಾಮ ನಗರ"]] },
          { name: "Halasuru", wards: [[6, "Bharathi Nagar", "ಭಾರತಿ ನಗರ"], [7, "K Kamaraj Ward", "ಕೆ ಕಾಮರಾಜ ವಾರ್ಡ್"], [8, "Halasuru", "ಹಲಸೂರು"]] },
        ],
      },
      {
        name: "Chickpet",
        ac: "169-Chickpet",
        subdivisions: [
          { name: "Dharmaraya Swamy Devasthana", wards: [[32, "Silver Jubilee Park Ward", "ಸಿಲ್ವರ್ ಜುಬಿಲಿ ಪಾರ್ಕ್ ವಾರ್ಡ್"], [33, "Dharmaraya Swamy Devasthana Ward", "ಧರ್ಮರಾಯ ಸ್ವಾಮಿ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"], [34, "D.S. Gundappa Ward", "ಡಿ.ಎಸ್. ಗುಂಡಪ್ಪ ವಾರ್ಡ್"]] },
          { name: "Hombegowda Nagar", wards: [[35, "Hombegowda Nagar", "ಹೊಂಬೇಗೌಡ ನಗರ"], [36, "Sudhama Nagar", "ಸುಧಾಮ ನಗರ (?)"], [37, "Vishveshwarapuram", "ವಿಶ್ವೇಶ್ವರಪುರ (?)"]] },
          { name: "Ashok Pillar", wards: [[38, "Shanthala Nagar", "ಶಾಂತಲಾ ನಗರ (?)"], [39, "Venkata Reddy Nagar", "ವೆಂಕಟ ರೆಡ್ಡಿ ನಗರ"], [40, "Ashok Pillar", "ಅಶೋಕ ಪಿಲ್ಲರ್"]] },
          { name: "V.V. Puram", wards: [[41, "V.V. Puram", "ವಿ.ವಿ. ಪುರಂ"], [42, "Sunkenahalli", "ಸುಂಕೇನಹಳ್ಳಿ"], [43, "Devaraja Arasu Ward", "ದೇವರಾಜ ಅರಸು ವಾರ್ಡ್"]] },
        ],
      },
      {
        name: "Chamarajpet",
        ac: "168-Chamarajpet",
        subdivisions: [
          { name: "Chamarajpet", wards: [[44, "Chamarajpet", "ಚಾಮರಾಜಪೇಟೆ"], [45, "K.R. Market", "ಕೆ.ಆರ್. ಮಾರ್ಕೆಟ್"], [46, "Cheluvadi Palya", "ಚೆಲುವಾದಿ ಪಾಳ್ಯ"]] },
          { name: "Azad Nagar", wards: [[47, "Alandur Salappa Ward", "ಆಲಂದೂರು ಸಲಪ್ಪ ವಾರ್ಡ್ (?)"], [48, "Azad Nagar", "ಆಜಾದ್ ನಗರ"], [49, "Kasturba Ward", "ಕಸ್ತೂರ ಬಾ ವಾರ್ಡ್"]] },
          { name: "Jagajeevanram Nagar", wards: [[50, "Jagajeevanram Nagar", "ಜಗಜೀವನ್‌ರಾಂ ನಗರ (?)"], [51, "Hale Guddahalli", "ಹಳೆ ಗುಡ್ಡಹಳ್ಳಿ"]] },
          { name: "Padarayanapura", wards: [[52, "Padarayanapura", "ಪಾದರಾಯನಪುರ"], [53, "Rayapuram", "ರಾಯಪುರ"]] },
        ],
      },
      {
        name: "Gandhinagar",
        ac: "164-Gandhinagar",
        subdivisions: [
          { name: "Binnipete", wards: [[54, "Binnipete", "ಬಿನ್ನಿಪೇಟೆ"], [55, "Bhuvaneshwari Nagar", "ಭುವನೇಶ್ವರಿ ನಗರ"], [56, "Gopalapura", "ಗೋಪಾಲಪುರ"]] },
          { name: "Chickpete", wards: [[57, "Cottonpete", "ಕಾಟನ್‌ಪೇಟೆ (?)"], [58, "Chickpete", "ಚಿಕ್ಕಪೇಟೆ"], [59, "Nagartha Pete", "ನಗರ್ತಪೇಟೆ (?)"]] },
          { name: "Sheshadripuram", wards: [[60, "Sheshadripuram", "ಶೇಷಾದ್ರಿಪುರಂ"], [61, "Dattatreya Ward", "ದತ್ತಾತ್ರೇಯ ವಾರ್ಡ್"]] },
          { name: "Okalipuram", wards: [[62, "Swatantra Palya Ward", "ಸ್ವತಂತ್ರ ಪಾಳ್ಯ ವಾರ್ಡ್"], [63, "Okalipuram", "ಓಕಳಿಪುರಂ"]] },
        ],
      },
      {
        name: "Indiranagar",
        ac: "161-C.V. Raman Nagar",
        subdivisions: [
          { name: "Indiranagar", wards: [[9, "Hoysala Nagar", "ಹೊಯ್ಸಳ ನಗರ (?)"], [10, "Cox Town", "ಕಾಕ್ಸ್ ಟೌನ್"], [15, "Indiranagar", "ಇಂದಿರಾನಗರ"]] },
          { name: "Kasturi Nagar", wards: [[11, "HAL Briyasanahalli", "ಹಲ್ ಬ್ರೈಯಸನಹಳ್ಳಿ (?)"], [12, "Kasturi Nagar", "ಕಸ್ತೂರಿ ನಗರ"], [13, "Krishnasana Palya", "ಕೃಷ್ಣಸನ ಪಾಳ್ಯ (?)"]] },
        ],
      },
      {
        name: "Jeevan Bhimanagar",
        ac: "161-C.V. Raman Nagar",
        subdivisions: [
          { name: "Kaggadasapura", wards: [[14, "Nagavarapalya", "ನಾಗವಾರಪಾಳ್ಯ"], [17, "Kaggadasapura", "ಕಗ್ಗದಾಸಪುರ"], [18, "J.M. Nagar", "ಜೆ.ಎಂ. ನಗರ"]] },
          { name: "Jeevan Bhimanagar", wards: [[16, "New Tippasandra", "ನ್ಯೂ ತಿಪ್ಪಸಂದ್ರ"], [19, "Jeevan Bhimanagar", "ಜೀವನ್ ಭೀಮಾನಗರ"]] },
          { name: "Konena Agrahara", wards: [[20, "Kodihalli", "ಕೋಡಿಹಳ್ಳಿ"], [21, "Konena Agrahara", "ಕೋನೇನ ಅಗ್ರಹಾರ"]] },
        ],
      },
      {
        name: "Shanthinagar",
        ac: "163-Shanthinagar",
        subdivisions: [
          { name: "Domlur", wards: [[22, "Domlur", "ಡೊಮ್ಮಲೂರು"], [23, "Jogupalya", "ಜೋಗುಪಾಳ್ಯ"], [24, "Bharathi Block", "ಭಾರತಿ ಬ್ಲಾಕ್ (?)"]] },
          { name: "Shanthinagar", wards: [[25, "Ashok Nagar", "ಅಶೋಕನಗರ"], [31, "Shanthinagar", "ಶಾಂತಿನಗರ"]] },
          { name: "Neelasandra", wards: [[26, "Pannarpet", "ಪನ್ನಾರಪೇಟೆ (?)"], [27, "Ambedkar Nagar", "ಅಂಬೇಡ್ಕರ್ ನಗರ"], [28, "Neelasandra", "ನೀಲಸಂದ್ರ"]] },
          { name: "Vinayakanagar", wards: [[29, "Austin Town", "ಆಸ್ಟಿನ್ ಟೌನ್"], [30, "Vinayakanagar", "ವಿನಾಯಕನಗರ"]] },
        ],
      },
    ],
  },

  // ───────────────────────── ANNEXURE-2 · PURVA (Bengaluru East) ─────────────────────────
  {
    code: "PURVA",
    name: "Bengaluru East",
    annexure: "02",
    divisions: [
      {
        name: "Horamavu",
        ac: "151-Krishnarajapuram",
        subdivisions: [
          { name: "Horamavu", wards: [[1, "K Narayanapura", "ಕೆ ನಾರಾಯಣಪುರ"], [2, "Horamavu", "ಹೊರಮಾವು"]] },
          { name: "Chellekere", wards: [[3, "Chellekere", "ಚೆಲ್ಲೆಕೆರೆ"], [4, "Babusab Palya", "ಬಾಬುಸಾಬ್ ಪಾಳ್ಯ"]] },
          { name: "Kalkere", wards: [[5, "Hoysala Nagar East", "ಹೊಯ್ಸಳ ನಗರ ಪೂರ್ವ"], [6, "Kalkere", "ಕಲ್ಕೆರೆ"]] },
        ],
      },
      {
        name: "K.R. Pura",
        ac: "151-Krishnarajapuram",
        subdivisions: [
          { name: "Bhattarahalli", wards: [[7, "K Channasandra", "ಕೆ ಚನ್ನಸಂದ್ರ"], [8, "Anandapura", "ಆನಂದಪುರ"], [9, "Bhattarahalli", "ಭಟ್ಟರಹಳ್ಳಿ"]] },
          { name: "Basavanapura", wards: [[10, "Basavanapura", "ಬಸವನಪುರ"], [11, "Krishnanagar", "ಕೃಷ್ಣನಗರ"], [12, "Devasandra", "ದೇವಸಂದ್ರ"]] },
          { name: "K R Pura", wards: [[13, "Rajarajeshwari Devasthana Ward", "ರಾಜರಾಜೇಶ್ವರಿ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"], [14, "K R Pura", "ಕೆ ಆರ್ ಪುರ"]] },
        ],
      },
      {
        name: "Ramamurthy Nagar",
        ac: "174-Mahadevapura",
        subdivisions: [
          { name: "Ramamurthy Nagar", wards: [[15, "Ramamurthy Nagar", "ರಾಮಮೂರ್ತಿ ನಗರ"], [16, "Kothanur", "ಕೊತ್ತನೂರು"], [18, "Doddanekkundi", "ದೊಡ್ಡನೆಕ್ಕುಂದಿ"]] },
          { name: "Vijinapura", wards: [[17, "Vijinapura", "ವಿಜಿನಾಪುರ"], [19, "K.S. Nisar Ahmed Ward", "ಕೆ. ಎಸ್. ನಿಸಾರ್ ಅಹಮ್ಮದ್ ವಾರ್ಡ್"]] },
          { name: "A Narayanapura", wards: [[20, "A Narayanapura", "ಎ ನಾರಾಯಣಪುರ"], [21, "Uday Nagar", "ಉದಯ್ ನಗರ"]] },
        ],
      },
      {
        name: "Vijnananagar",
        ac: "174-Mahadevapura",
        subdivisions: [
          { name: "Mahadevapura", wards: [[22, "Mahadevapura", "ಮಹದೇವಪುರ"], [23, "Sangama Ward", "ಸಂಗಮ ವಾರ್ಡ್"]] },
          { name: "Vijnananagar", wards: [[24, "Vijnananagar", "ವಿಜ್ಞಾನನಗರ"], [25, "L.R. Shastri Nagar", "ಎಲ್.ಆರ್. ಶಾಸ್ತ್ರಿ ನಗರ"], [26, "Jagadish Nagar", "ಜಗದೀಶ್ ನಗರ"]] },
          { name: "Vibhutipura", wards: [[27, "Vibhutipura", "ವಿಭೂತಿಪುರ"]] },
        ],
      },
      {
        name: "Hudi",
        ac: "174-Mahadevapura",
        subdivisions: [
          { name: "Hudi", wards: [[28, "Byrathi", "ಬೈರತಿ"], [29, "Hudi", "ಹೂಡಿ"], [30, "Belathuru", "ಬೆಳತ್ತೂರು"]] },
          { name: "Kadugodi", wards: [[31, "Kadugodi", "ಕಾಡುಗೋಡಿ"], [32, "Channasandra", "ಚನ್ನಸಂದ್ರ"], [33, "S.M. Krishna Ward", "ಎಸ್.ಎಂ ಕೃಷ್ಣ ವಾರ್ಡ್"]] },
          { name: "White Field", wards: [[38, "White Field", "ವೈಟ್ ಫೀಲ್ಡ್"], [39, "Hagaduru", "ಹಗದೂರು"]] },
        ],
      },
      {
        name: "Marathahalli",
        ac: "174-Mahadevapura",
        subdivisions: [
          { name: "Garudachar Palya", wards: [[34, "Kaveri Nagar", "ಕಾವೇರಿ ನಗರ (?)"], [35, "Garudachar Palya", "ಗರುಡಾಚಾರ್ ಪಾಳ್ಯ"]] },
          { name: "Munnekolala", wards: [[41, "Munnekolala", "ಮುನ್ನೆಕೊಳಲು"], [42, "Priyadarshini Nagar", "ಪ್ರಿಯದರ್ಶಿನಿ ನಗರ"]] },
          { name: "Doddanekkundi", wards: [[36, "Bharathi Block Ward", "ಭಾರತಿ ಬ್ಲಾಕ್ ವಾರ್ಡ್"], [43, "Doddanekkundi", "ದೊಡ್ಡನೆಕ್ಕುಂದಿ"]] },
          { name: "Marathahalli", wards: [[44, "Akshaya Nagar", "ಅಕ್ಷಯ ನಗರ"], [45, "Marathahalli", "ಮಾರತಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Bellanduru",
        ac: "174-Mahadevapura",
        subdivisions: [
          { name: "Varthur", wards: [[37, "Kundalahalli", "ಕುಂದಲಹಳ್ಳಿ"], [40, "Varthur", "ವರ್ತೂರು"]] },
          { name: "Bellanduru", wards: [[46, "Yamaluru", "ಯಮಲೂರು"], [47, "Bellanduru", "ಬೆಳ್ಳಂದೂರು"]] },
          { name: "Gunjur", wards: [[48, "Panathuru", "ಪಣತ್ತೂರು"], [49, "Doddakannelli Ward", "ದೊಡ್ಡಕನ್ನೆಲ್ಲಿ ವಾರ್ಡ್ (?)"], [50, "Gunjur", "ಗುಂಜೂರು"]] },
        ],
      },
    ],
  },

  // ───────────────────────── ANNEXURE-3 · PASHCHIMA (Bengaluru West) ─────────────────────────
  {
    code: "PASHCHIMA",
    name: "Bengaluru West",
    annexure: "03",
    divisions: [
      {
        name: "Hegganahalli",
        ac: "155-Dasarahalli",
        subdivisions: [
          { name: "Nagasandra", wards: [[1, "Nagasandra", "ನಾಗಸಂದ್ರ"], [2, "Chokkasandra", "ಚೊಕ್ಕಸಂದ್ರ"], [3, "Nelagadaranahalli", "ನೆಲಗದರನಹಳ್ಳಿ"]] },
          { name: "Shivapura", wards: [[4, "Parvathi Nagar", "ಪಾರ್ವತಿ ನಗರ"], [6, "Shivapura", "ಶಿವಪುರ"]] },
          { name: "Hegganahalli", wards: [[5, "Rajeshwarinagar", "ರಾಜೇಶ್ವರಿನಗರ"], [7, "Rajagopal Nagar", "ರಾಜಗೋಪಾಲ ನಗರ"], [8, "Hegganahalli", "ಹೆಗ್ಗನಹಳ್ಳಿ"]] },
          { name: "Sunkadakatte", wards: [[9, "Srigandhanagar", "ಶ್ರೀಗಂಧನಗರ"], [10, "Sunkadakatte", "ಸುಂಕದಕಟ್ಟೆ"]] },
        ],
      },
      {
        name: "Herohalli",
        ac: "155-Dasarahalli",
        subdivisions: [
          { name: "Dodda Bidarakallu", wards: [[11, "Dodda Bidarakallu", "ದೊಡ್ಡ ಬಿದರಕಲ್ಲು"], [12, "Andrahalli", "ಅಂದ್ರಹಳ್ಳಿ"], [13, "Nadaprabhu Kempegowda Nagar", "ನಾಡ ಪ್ರಭು ಕೆಂಪೇಗೌಡ ನಗರ"]] },
          { name: "Herohalli", wards: [[14, "Herohalli", "ಹೆರೋಹಳ್ಳಿ"], [15, "Byadarahalli", "ಬ್ಯಾಡರಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Kengeri",
        ac: "154-Rajarajeshwari Nagar",
        subdivisions: [
          { name: "Ullala", wards: [[16, "Ullala", "ಉಳ್ಳಾಲ"], [17, "Nagadevanahalli", "ನಾಗದೇವನಹಳ್ಳಿ"]] },
          { name: "Hemmigepura", wards: [[18, "Kengeri Hanumanthaiah West", "ಕೆಂಗೇರಿ ಹನುಮಂತಯ್ಯ ಪಶ್ಚಿಮ (?)"], [20, "Kengeri Kote Ward", "ಕೆಂಗೇರಿ ಕೋಟೆ ವಾರ್ಡ್"]] },
          { name: "Kengeri", wards: [[19, "Shivanapalya", "ಶಿವನಪಾಳ್ಯ"], [21, "Kengeri", "ಕೆಂಗೇರಿ"]] },
        ],
      },
      {
        name: "Rajarajeshwari Nagar",
        ac: "154-Rajarajeshwari Nagar",
        subdivisions: [
          { name: "Rajarajeshwari Nagar", wards: [[22, "Bangarappa Nagar", "ಬಂಗಾರಪ್ಪ ನಗರ (?)"], [23, "Rajarajeshwari Nagar", "ರಾಜರಾಜೇಶ್ವರಿ ನಗರ"]] },
          { name: "Jnana Bharathi", wards: [[24, "Jnana Bharathi Ward", "ಜ್ಞಾನ ಭಾರತಿ ವಾರ್ಡ್"], [25, "Vinayaka Layout", "ವಿನಾಯಕ ಲೇಔಟ್"], [26, "Mallathahalli", "ಮಲ್ಲತಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Peenya",
        ac: "155-Dasarahalli",
        subdivisions: [
          { name: "Kottigepalya", wards: [[27, "Srigandhada Kaval", "ಶ್ರೀಗಂಧದ ಕಾವಲ್"], [28, "Kottigehalli", "ಕೊಟ್ಟಿಗೆಹಳ್ಳಿ"], [29, "Joulgrama Nagar", "ಜೌಳಿಗ್ರಾಮ ನಗರ (?)"]] },
          { name: "Laggere", wards: [[30, "Kempegowda Badavane", "ಕೆಂಪೇಗೌಡ ಬಡಾವಣೆ"], [31, "Freedom Fighter Ward", "ಫ್ರೀಡಂ ಫೈಟರ್ ವಾರ್ಡ್"], [32, "Laggere", "ಲಗ್ಗೆರೆ"]] },
          { name: "Peenya", wards: [[33, "Lakshmi Devi Nagar", "ಲಕ್ಷ್ಮಿ ದೇವಿ ನಗರ"], [34, "Peenya", "ಪೀಣ್ಯ"], [35, "Goraguntepalya", "ಗೊರಗುಂಟೆಪಾಳ್ಯ"]] },
        ],
      },
      {
        name: "Mahalakshmi Layout",
        ac: "156-Mahalakshmi Layout",
        subdivisions: [
          { name: "Nandini Layout", wards: [[36, "Nalvadi Krishnaraja Wadeyar Ward", "ನಲ್ವಡಿ ಕೃಷ್ಣರಾಜ ಒಡೆಯರ್ ವಾರ್ಡ್"], [37, "Dr. Puneeth Rajkumar Ward", "ಡಾ|| ಪುನೀತ್ ರಾಜಕುಮಾರ್ ವಾರ್ಡ್"], [38, "Nandini Layout", "ನಂದಿನಿ ಲೇಔಟ್"]] },
          { name: "Mahalakshmipuram", wards: [[39, "Jai Maruthi Nagar", "ಜೈ ಮಾರುತಿ ನಗರ (?)"], [40, "Mahalakshmipuram", "ಮಹಾಲಕ್ಷ್ಮಿ ಪುರಂ"], [41, "Nagapura", "ನಾಗಪುರ"]] },
          { name: "Shankar Matt", wards: [[42, "Raja Mayamma Maha Ward", "ರಾಜ ಮಯ್ಯಮ್ಮ ಮಹಾ ವಾರ್ಡ್ (?)"], [43, "Ketamaranahalli", "ಕೆತಮಾರನಹಳ್ಳಿ"], [44, "Shankar Matt", "ಶಂಕರ ಮಠ"]] },
          { name: "Kamalanagar", wards: [[45, "Shakthi Ganapathi Nagar", "ಶಕ್ತಿ ಗಣಪತಿ ನಗರ"], [46, "Kamalanagar", "ಕಮಲಾನಗರ"], [47, "Vrishabhavathi Nagar", "ವೃಷಭಾವತಿ ನಗರ"]] },
        ],
      },
      {
        name: "Malleshwaram",
        ac: "157-Malleswaram",
        subdivisions: [
          { name: "Mattikere", wards: [[48, "Mattikere", "ಮತ್ತಿಕೆರೆ"], [49, "Aramane Nagara", "ಅರಮನೆ ನಗರ"], [50, "Sadashiva Nagar", "ಸದಾಶಿವ ನಗರ"]] },
          { name: "Rajamahal", wards: [[51, "Rajamahal", "ರಾಜಮಹಲ್"], [52, "Kodandaramapura", "ಕೋದಂದರಾಮಪುರ"]] },
          { name: "Malleshwaram", wards: [[53, "Malleshwaram", "ಮಲ್ಲೇಶ್ವರಂ"], [54, "Subedarapalya", "ಸುಬೇದಾರಪಾಳ್ಯ"]] },
          { name: "Subrahmanyanagar", wards: [[55, "Subrahmanyanagar", "ಸುಬ್ರಹ್ಮಣ್ಯನಗರ"], [56, "Gayithri Nagar", "ಗಾಯಿತ್ರಿ ನಗರ"], [57, "Kuvempu Ward", "ಕುವೆಂಪು ವಾರ್ಡ್"]] },
        ],
      },
      {
        name: "Rajajinagar",
        ac: "165-Rajajinagar",
        subdivisions: [
          { name: "Prakash Nagar", wards: [[58, "Dayananda Nagar", "ದಯಾನಂದ ನಗರ"], [59, "Bandi Reddy Vritta Ward", "ಬಂಡಿ ರೆಡ್ಡಿ ವೃತ ವಾರ್ಡ್ (?)"], [60, "Prakash Nagar", "ಪ್ರಕಾಶ್ ನಗರ"]] },
          { name: "Rama Mandir", wards: [[61, "D.R. Bendre Ward", "ದಿ.ರಾ.ಬೇಂದ್ರೆ ವಾರ್ಡ್"], [62, "Rama Mandir", "ರಾಮ ಮಂದಿರ"]] },
          { name: "Rajajinagar", wards: [[63, "Rajajinagar", "ರಾಜಾಜಿನಗರ"], [64, "Shivanagar", "ಶಿವನಗರ"]] },
        ],
      },
      {
        name: "Basaveshwara Nagar",
        ac: "165-Rajajinagar",
        subdivisions: [
          { name: "Manjunatha Nagar", wards: [[65, "Manjunatha Nagar", "ಮಂಜುನಾಥ ನಗರ"], [66, "Nandagurupura Halli", "ನಂದಗುರುಪುರ ಹಳ್ಳಿ (?)"], [67, "Basaveshwara Nagar", "ಬಸವೇಶ್ವರ ನಗರ"]] },
          { name: "Basaveshwara Nagar", wards: [[68, "Kamakshipalya", "ಕಾಮಾಕ್ಷಿಪಾಳ್ಯ"]] },
        ],
      },
      {
        name: "Govindaraja Nagar",
        ac: "166-Govindarajanagar",
        subdivisions: [
          { name: "Agrahara Dasarahalli", wards: [[69, "Agrahara Dasarahalli", "ಅಗ್ರಹಾರ ದಾಸರಹಳ್ಳಿ"], [70, "Dr. Rajkumar Ward", "ಡಾ|| ರಾಜಕುಮಾರ್ ವಾರ್ಡ್"]] },
          { name: "Timmenahalli", wards: [[71, "Timmenahalli", "ತಿಮ್ಮೆನಹಳ್ಳಿ"], [73, "Dr. Chittuvadana Ward", "ಡಾ|| ಚಿತ್ತುವದನ ವಾರ್ಡ್ (?)"]] },
          { name: "Kaveripura", wards: [[72, "Kaveripura", "ಕಾವೇರಿಪುರ"], [74, "Pattegar Palya", "ಪಟ್ಟೆಗಾರ್ ಪಾಳ್ಯ"]] },
        ],
      },
      {
        name: "Chandra Layout",
        ac: "167-Vijayanagar",
        subdivisions: [
          { name: "Marenahalli", wards: [[75, "Marenahalli West", "ಮಾರೇನಹಳ್ಳಿ ಪಶ್ಚಿಮ"], [76, "Moodalahalli", "ಮೂಡಲಹಳ್ಳಿ"]] },
          { name: "Maruthi Mandir", wards: [[77, "Maruthi Mandir Ward", "ಮಾರುತಿ ಮಂದಿರ ವಾರ್ಡ್"], [78, "Anubhava Nagar", "ಅನುಭವ ನಗರ"]] },
          { name: "Chandra Layout", wards: [[79, "Nagarabhavi", "ನಾಗರಭಾವಿ"], [80, "Chandra Layout", "ಚಂದ್ರ ಲೇಔಟ್"], [81, "Nayandahalli", "ನಾಯಂದ ಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Vijayanagar",
        ac: "167-Vijayanagar",
        subdivisions: [
          { name: "Hosahalli", wards: [[84, "Hosahalli", "ಹೊಸಹಳ್ಳಿ"], [85, "Adi Chunchanagiri Ward", "ಆದಿ ಚುಂಚನಗಿರಿ ವಾರ್ಡ್"]] },
          { name: "K.P. Agrahara", wards: [[86, "Vijayanagar", "ವಿಜಯನಗರ (?)"], [87, "K.P. Agrahara", "ಕೆ.ಪಿ. ಅಗ್ರಹಾರ"], [88, "Sangolli Rayanna Ward", "ಸಂಗೊಳ್ಳಿ ರಾಯಣ್ಣ ವಾರ್ಡ್"]] },
          { name: "Gali Anjaneya Devasthana", wards: [[89, "Bapuji Nagar", "ಬಾಪೂಜಿ ನಗರ (?)"], [90, "Krishnadevaraya Ward", "ಕೃಷ್ಣದೇವರಾಯ ವಾರ್ಡ್"], [91, "Gali Anjaneya Devasthana Ward", "ಗಾಲಿ ಅಂಜನೇಯ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"]] },
        ],
      },
      {
        name: "Hampi Nagar",
        ac: "167-Vijayanagar",
        subdivisions: [
          { name: "Hampi Nagar", wards: [[82, "Attiguppe", "ಅತ್ತಿಗುಪ್ಪೆ"], [83, "Hampi Nagar", "ಹಂಪಿ ನಗರ"], [94, "Deepanjali Nagar", "ದೀಪಾಂಜಲಿ ನಗರ"]] },
          { name: "Avalahalli", wards: [[92, "Muneshwara Block", "ಮುನೇಶ್ವರ ಬ್ಲಾಕ್"], [93, "Avalahalli", "ಆವಲಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Basavanagudi",
        ac: "170-Basavanagudi",
        subdivisions: [
          { name: "Kattiguppe", wards: [[95, "Swamy Vivekananda Ward", "ಸ್ವಾಮಿ ವಿವೇಕಾನಂದ ವಾರ್ಡ್"], [96, "Kattiguppe", "ಕತ್ತಿಗುಪ್ಪೆ"]] },
          { name: "Srinagar", wards: [[99, "T.R. Shamanna Nagar", "ಟಿ.ಆರ್. ಶಾಮಣ್ಣ ನಗರ"], [100, "Srinagar", "ಶ್ರೀನಗರ"], [101, "Kempambudhi Ward", "ಕೆಂಪಾಂಬುಧಿ ವಾರ್ಡ್ (?)"]] },
          { name: "Hanumanthanagar", wards: [[98, "Ashok Nagar", "ಅಶೋಕ ನಗರ"], [102, "Hanumanthanagar", "ಹನುಮಂತನಗರ"]] },
          { name: "Srinivasa Nagar", wards: [[97, "Srinivasa Nagar", "ಶ್ರೀನಿವಾಸ ನಗರ"], [103, "N.R. Colony", "ಎನ್.ಆರ್. ಕಾಲೋನಿ"], [104, "Tyagarajanagar", "ತ್ಯಾಗರಾಜನಗರ"]] },
        ],
      },
      {
        name: "Yadiyuru",
        ac: "171-Padmanabhanagar",
        subdivisions: [
          { name: "Yadiyuru", wards: [[105, "Yadiyuru", "ಯಡಿಯೂರು"], [106, "Devagiri Devasthana Ward", "ದೇವಗಿರಿ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"], [107, "Banashankari Devasthana", "ಬನಶಂಕರಿ ದೇವಸ್ಥಾನ"]] },
          { name: "Ganesh Mandir", wards: [[108, "Ganesh Mandir Ward", "ಗಣೇಶ ಮಂದಿರ ವಾರ್ಡ್"], [109, "Hosakerehalli", "ಹೊಸಕೆರೆಹಳ್ಳಿ (?)"]] },
          { name: "Hosakerehalli", wards: [[110, "Chikkalsandra", "ಚಿಕ್ಕಲಸಂದ್ರ"], [111, "Ittamadu", "ಇಟ್ಟಮಡು"], [112, "Hosakerehalli", "ಹೊಸಕೆರೆಹಳ್ಳಿ"]] },
        ],
      },
    ],
  },

  // ───────────────────────── ANNEXURE-4 · UTTARA (Bengaluru North) ─────────────────────────
  {
    code: "UTTARA",
    name: "Bengaluru North",
    annexure: "04",
    divisions: [
      {
        name: "Yelahanka",
        ac: "150-Yelahanka",
        subdivisions: [
          { name: "Yelahanka Old Town", wards: [[1, "Raja Kanteerava Ward", "ರಾಜಾ ಕಂಠೀರವ ವಾರ್ಡ್ (?)"], [2, "Adarsha Nagar", "ಆದರ್ಶ ನಗರ (?)"], [3, "Chowdeshwari Ward", "ಚೌಡೇಶ್ವರಿ ವಾರ್ಡ್"]] },
          { name: "Yelahanka Upanagar", wards: [[4, "Nyayangala Layout", "ನ್ಯಾಯಂಗಲ ಬಡಾವಣೆ"], [5, "Yelahanka Satellite Town", "ಯಲಹಂಕ ಸ್ಯಾಟ್ಲೈಟ್ ಟೌನ್"]] },
          { name: "Atturu", wards: [[6, "Doddabettahalli", "ದೊಡ್ಡಬೆಟ್ಟಹಳ್ಳಿ"], [7, "Atturu", "ಅಟ್ಟೂರು"]] },
        ],
      },
      {
        name: "Byatarayanapura",
        ac: "152-Byatarayanapura",
        subdivisions: [
          { name: "Vidyaranyapura", wards: [[8, "Singapura", "ಸಿಂಗಾಪುರ"], [9, "Kuvempunagar", "ಕುವೆಂಪುನಗರ"], [10, "Vidyaranyapura", "ವಿದ್ಯಾರಣ್ಯಪುರ"]] },
          { name: "Kodigehalli", wards: [[11, "Doddabommasandra", "ದೊಡ್ಡಬೊಮ್ಮಸಂದ್ರ"], [12, "Tindlu", "ತಿಂಡ್ಲು"], [13, "Kodigehalli", "ಕೊಡಿಗೆಹಳ್ಳಿ"]] },
          { name: "Byatarayanapura", wards: [[14, "Rajiv Gandhi Nagar", "ರಾಜೀವ್ ಗಾಂಧಿ ನಗರ"], [15, "Byatarayanapura", "ಬ್ಯಾಟರಾಯನಪುರ"]] },
        ],
      },
      {
        name: "Thanisandra",
        ac: "152-Byatarayanapura",
        subdivisions: [
          { name: "Jakkuru", wards: [[16, "Amrutahalli", "ಅಮೃತಹಳ್ಳಿ"], [17, "Jakkuru", "ಜಕ್ಕೂರು"]] },
          { name: "Thanisandra", wards: [[18, "Kanaka Nagar", "ಕನಕ ನಗರ (?)"], [19, "Thanisandra", "ಥಣಿಸಂದ್ರ"]] },
          { name: "Kogilu", wards: [[20, "Sampigehalli", "ಸಂಪಿಗೆಹಳ್ಳಿ"], [21, "Kogilu", "ಕೋಗಿಲು"]] },
        ],
      },
      {
        name: "H.B.R Layout",
        ac: "159-Pulikeshinagar",
        subdivisions: [
          { name: "H.B.R Layout", wards: [[22, "Nagavara", "ನಾಗವಾರ"], [23, "Hennur", "ಹೆಣ್ಣೂರು"], [24, "H.B.R Layout", "ಎಚ್.ಬಿ.ಆರ್. ಲೇಔಟ್"]] },
          { name: "K.G. Halli", wards: [[25, "Govindapura", "ಗೋವಿಂದಪುರ"], [26, "Samadhana Nagar", "ಸಮಾಧಾನ ನಗರ (?)"], [27, "K.G. Halli", "ಕೆ.ಜಿ. ಹಳ್ಳಿ"]] },
          { name: "Kacharanahalli", wards: [[28, "Venkateshapuram", "ವೆಂಕಟೇಶಪುರಂ"], [29, "Lingarajapuram", "ಲಿಂಗರಾಜಪುರಂ"], [30, "Kacharanahalli", "ಕಾಚರನಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Maruthi Sevanagar",
        ac: "160-Sarvagnanagar",
        subdivisions: [
          { name: "Banasavadi", wards: [[31, "Kalyana Nagar", "ಕಲ್ಯಾಣ ನಗರ"], [32, "Banasavadi", "ಬಾಣಸವಾಡಿ"], [33, "HCR Layout", "ಎಚ್.ಸಿ.ಆರ್. ಲೇಔಟ್ (?)"]] },
          { name: "Kammanahalli", wards: [[34, "Subbayyanapalya", "ಸುಬ್ಬಯ್ಯನಪಾಳ್ಯ"], [35, "Kammanahalli", "ಕಮ್ಮನಹಳ್ಳಿ"]] },
          { name: "Maruthi Sevanagar", wards: [[36, "Maruthi Seva Nagar", "ಮಾರುತಿ ಸೇವಾ ನಗರ"], [37, "Jeevanahalli", "ಜೀವನಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Kaval Byrasandra",
        ac: "160-Sarvagnanagar",
        subdivisions: [
          { name: "Kaval Byrasandra", wards: [[38, "Shampura", "ಶಾಂಪುರ"], [39, "Kaval Byrasandra", "ಕಾವಲ್ ಬೈರಸಂದ್ರ"]] },
          { name: "Varalakshmi Nagar", wards: [[42, "Aruna Asif Ali Ward", "ಅರುಣಾ ಆಸಿಫ್ ಅಲಿ ವಾರ್ಡ್"], [43, "Varalakshmi Nagar", "ವರಲಕ್ಷ್ಮಿ ನಗರ"]] },
        ],
      },
      {
        name: "Pulikeshinagar",
        ac: "159-Pulikeshinagar",
        subdivisions: [
          { name: "Kushal Nagar", wards: [[40, "Shakthi Nagar", "ಶಕ್ತಿ ನಗರ"], [41, "Periyar Nagar", "ಪೆರಿಯಾರ್ ನಗರ"], [45, "Kushal Nagar", "ಕುಶಾಲ್ ನಗರ"]] },
          { name: "Sagayapuram", wards: [[44, "Doddanna Nagar", "ದೊಡ್ಡನ ನಗರ (?)"], [46, "Sagayapuram", "ಸಗಾಯಪುರಂ"]] },
          { name: "Pulikeshinagar", wards: [[47, "Pulikeshi Nagar", "ಪುಲಕೇಶಿ ನಗರ"], [48, "S.K. Garden", "ಎಸ್.ಕೆ. ಗಾರ್ಡನ್"]] },
        ],
      },
      {
        name: "R.T. Nagar",
        ac: "158-Hebbala",
        subdivisions: [
          { name: "R.T Nagar", wards: [[49, "Jaya Chamarajendra Nagar", "ಜಯ ಚಾಮರಾಜೇಂದ್ರ ನಗರ"], [50, "Dinnur", "ದಿಣ್ಣೂರು"], [53, "R.T Nagar", "ಆರ್.ಟಿ ನಗರ"]] },
          { name: "Vishwanath Nagenahalli", wards: [[51, "Manorayanapalya", "ಮನೋರಾಯನಪಾಳ್ಯ"], [52, "Vishwanath Nagenahalli", "ವಿಶ್ವನಾಥ ನಾಗೇನಹಳ್ಳಿ"]] },
          { name: "Ganganagar", wards: [[54, "Gangenahalli", "ಗಂಗೇನಹಳ್ಳಿ"], [55, "Ganganagar", "ಗಂಗಾನಗರ"]] },
        ],
      },
      {
        name: "Hebbala",
        ac: "158-Hebbala",
        subdivisions: [
          { name: "Hebbala", wards: [[56, "Hebbala", "ಹೆಬ್ಬಾಳ"], [57, "Bhuvaneshwari", "ಭುವನೇಶ್ವರಿ (?)"]] },
          { name: "Nagashettihalli", wards: [[58, "Nagashettihalli", "ನಾಗಶೆಟ್ಟಿಹಳ್ಳಿ"], [59, "Gaddalahalli", "ಗದ್ದಲಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "Jalahalli",
        ac: "158-Hebbala",
        subdivisions: [
          { name: "Jalahalli", wards: [[60, "Jalahalli", "ಜಾಲಹಳ್ಳಿ"], [61, "J.M.L.T Ward", "ಜೆ.ಎಂ.ಎಲ್.ಟಿ ವಾರ್ಡ್ (?)"]] },
          { name: "Yashwantpura", wards: [[62, "Brindavana Nagar", "ಬೃಂದಾವನ ನಗರ"], [63, "J.P Nagar", "ಜೆ.ಪಿ ನಗರ"], [64, "Yashwantpura", "ಯಶವಂತಪುರ"]] },
        ],
      },
      {
        name: "Dasarahalli",
        ac: "155-Dasarahalli",
        subdivisions: [
          { name: "Shettihalli", wards: [[65, "Shettihalli", "ಶೆಟ್ಟಿಹಳ್ಳಿ"], [66, "Kammagondanahalli", "ಕಮ್ಮಗೊಂಡನಹಳ್ಳಿ"], [67, "T Dasarahalli", "ಟಿ ದಾಸರಹಳ್ಳಿ (?)"]] },
          { name: "Bagalagunte", wards: [[68, "Mallasandra", "ಮಲ್ಲಸಂದ್ರ"], [69, "Bagalagunte", "ಬಾಗಲಗುಂಟೆ"], [70, "Mumbusaba Nagar", "ಮುಂಬುಸಾಬ ನಗರ (?)"]] },
          { name: "Dasarahalli", wards: [[71, "Nele Maheshwaramma Devasthana Ward", "ನೆಲ ಮಹೇಶ್ವರಮ್ಮ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"], [72, "Dasarahalli", "ದಾಸರಹಳ್ಳಿ"]] },
        ],
      },
    ],
  },

  // ───────────────────────── ANNEXURE-5 · DAKSHINA (Bengaluru South) ─────────────────────────
  {
    code: "DAKSHINA",
    name: "Bengaluru South",
    annexure: "05",
    divisions: [
      {
        name: "Padmanabhanagar",
        ac: "171-Padmanabhanagar",
        subdivisions: [
          { name: "Padmanabhanagar", wards: [[1, "Padmanabhanagar", "ಪದ್ಮನಾಭನಗರ"], [2, "Kadirenahalli", "ಕದಿರೇನಹಳ್ಳಿ"], [3, "Yadava Nagar", "ಯಾದವ ನಗರ"]] },
          { name: "Banashankari", wards: [[4, "Banashankari Devasthana Ward", "ಬನಶಂಕರಿ ದೇವಸ್ಥಾನ ವಾರ್ಡ್"], [5, "Karimaheshwara Ward", "ಕರಿಮಹೇಶ್ವರ ವಾರ್ಡ್ (?)"], [6, "Gowdanapalya", "ಗೌಡನಪಾಳ್ಯ"]] },
        ],
      },
      {
        name: "Jayanagar",
        ac: "173-Jayanagar",
        subdivisions: [
          { name: "Byrasandra", wards: [[7, "Byrasandra", "ಬೈರಸಂದ್ರ"], [8, "Tilak Nagar", "ತಿಲಕ್ ನಗರ"]] },
          { name: "S.A.L Layout", wards: [[9, "S.A.L Layout", "ಎಸ್.ಎ.ಎಲ್ ಲೇಔಟ್"], [10, "Abdul Kalam Nagar", "ಅಬ್ದುಲ್ ಕಲಾಂ ನಗರ (?)"]] },
          { name: "Jayanagar", wards: [[11, "Jayanagar East", "ಜಯನಗರ ಪೂರ್ವ"], [12, "Pattabhirama Nagar", "ಪಟ್ಟಾಭಿರಾಮ ನಗರ"]] },
        ],
      },
      {
        name: "J.P. Nagar",
        ac: "173-Jayanagar",
        subdivisions: [
          { name: "J.P Nagar", wards: [[13, "Marenahalli South", "ಮೂರೇನಹಳ್ಳಿ ದಕ್ಷಿಣ"], [14, "J.P Nagar", "ಜೆ.ಪಿ ನಗರ"]] },
          { name: "Sarakki", wards: [[15, "Shakambari Nagar", "ಶಾಕಂಬರಿನಗರ"], [16, "Sarakki", "ಸಾರಕ್ಕಿ"]] },
        ],
      },
      {
        name: "B.T.M Layout",
        ac: "172-B.T.M Layout",
        subdivisions: [
          { name: "Tavarekere", wards: [[17, "S.S. Palya", "ಎಸ್.ಎಸ್. ಪಾಳ್ಯ (?)"], [18, "Vishwamanava Kuvempu Ward", "ವಿಶ್ವಮಾನವ ಕುವೆಂಪು ವಾರ್ಡ್"], [19, "Tavarekere", "ತಾವರೆಕೆರೆ"]] },
          { name: "Madivala", wards: [[20, "Madivala", "ಮಡಿವಾಳ"], [21, "Adugodi", "ಆದುಗೋಡಿ"], [22, "S.G. Palya", "ಎಸ್.ಜಿ. ಪಾಳ್ಯ"]] },
        ],
      },
      {
        name: "Koramangala",
        ac: "172-B.T.M Layout",
        subdivisions: [
          { name: "Lakkasandra", wards: [[23, "Lakkasandra", "ಲಕ್ಕಸಂದ್ರ"], [24, "A. Adugodi", "ಎ. ಆದುಗೋಡಿ"], [29, "Koramangala West", "ಕೋರಮಂಗಲ ಪಶ್ಚಿಮ"]] },
          { name: "Ejipura", wards: [[25, "National Games Village", "ನ್ಯಾಶನಲ್ ಗೇಮ್ಸ್ ವಿಲೇಜ್"], [26, "Ejipura", "ಈಜಿಪುರ"], [27, "Sri Lakshmidevi Ward", "ಶ್ರೀ ಲಕ್ಷ್ಮೀದೇವಿ ವಾರ್ಡ್"]] },
          { name: "Koramangala", wards: [[28, "Koramangala East", "ಕೋರಮಂಗಲ ಪೂರ್ವ"], [30, "Jakkasandra", "ಜಕ್ಕಸಂದ್ರ"]] },
        ],
      },
      {
        name: "Begur",
        ac: "176-Bengaluru South",
        subdivisions: [
          { name: "Gottigere", wards: [[38, "Doddakammanahalli", "ದೊಡ್ಡಕಮ್ಮನಹಳ್ಳಿ"], [39, "Gottigere", "ಗೊಟ್ಟಿಗೆರೆ"]] },
          { name: "Naganathapura", wards: [[33, "Naganathapura", "ನಾಗನಾಥಪುರ"], [34, "Chikka Togur", "ಚಿಕ್ಕ ತೋಗೂರು"], [35, "Vishwapriya Nagar", "ವಿಶ್ವಪ್ರಿಯ ನಗರ"]] },
          { name: "Begur", wards: [[36, "Begur", "ಬೇಗೂರು"], [37, "Hongasandra", "ಹೊಂಗಸಂದ್ರ"]] },
          { name: "Bhireshwara Nagar", wards: [[41, "Kothanur", "ಕೊತ್ತನೂರು"], [42, "Arakere Layout", "ಆರಕೆರೆ ಲೇಔಟ್ (?)"], [43, "Bhireshwara Nagar", "ಭೀರೇಶ್ವರ ನಗರ"]] },
        ],
      },
      {
        name: "Anjanapura",
        ac: "176-Bengaluru South",
        subdivisions: [
          { name: "Anjanapura", wards: [[40, "Anjanapura", "ಅಂಜಾನಪುರ"], [52, "Talaghattapura", "ತಲಘಟ್ಟಪುರ"]] },
          { name: "Konanakunte", wards: [[44, "Harinagar", "ಹರಿನಗರ"], [45, "Konanakunte", "ಕೋಣನಕುಂಟೆ"], [48, "Vasantapura", "ವಸಂತಪುರ"]] },
          { name: "Yelachenahalli", wards: [[46, "Yelachenahalli", "ಯಲಚೇನಹಳ್ಳಿ"], [47, "Chandranagar", "ಚಂದ್ರನಗರ (?)"]] },
          { name: "Uttarahalli", wards: [[49, "Uttarahalli", "ಉತ್ತರಹಳ್ಳಿ"], [50, "Sarvabhouma Nagar", "ಸಾರ್ವಭೌಮ ನಗರ"], [51, "Subramanyapura", "ಸುಬ್ರಹ್ಮಣ್ಯಪುರ"]] },
        ],
      },
      {
        name: "Arakere",
        ac: "175-Bommanahalli",
        subdivisions: [
          { name: "Arakere", wards: [[56, "Doddarasinapalya", "ದೊಡ್ಡರಸಿನಪಾಳ್ಯ (?)"], [57, "Hulimavu", "ಹುಳಿಮಾವು"], [58, "Arakere", "ಆರಕೆರೆ"]] },
          { name: "Jaraganahalli", wards: [[53, "Jaraganahalli", "ಜರಗನಹಳ್ಳಿ"], [54, "Kengeri Hanumanthaiah South", "ಕೆಂಗೇರಿ ಹನುಮಂತಯ್ಯ ದಕ್ಷಿಣ (?)"], [55, "Puttenahalli", "ಪುಟ್ಟೇನಹಳ್ಳಿ"]] },
          { name: "Bilekahalli", wards: [[59, "Vijaya Bank Layout", "ವಿಜಯ ಬ್ಯಾಂಕ್ ಲೇಔಟ್"], [60, "Bilekahalli", "ಬಿಳೆಕಹಳ್ಳಿ"], [61, "Kodichikkanahalli", "ಕೋಡಿ ಚಿಕ್ಕನಹಳ್ಳಿ"]] },
        ],
      },
      {
        name: "H.S.R Layout",
        ac: "175-Bommanahalli",
        subdivisions: [
          { name: "Kudlu", wards: [[31, "Kasavanahalli", "ಕಸವನಹಳ್ಳಿ"], [32, "Kudlu", "ಕೂಡ್ಲು"]] },
          { name: "Ibbaluru", wards: [[69, "Hosapalya", "ಹೊಸಪಾಳ್ಯ"], [70, "Ibbaluru", "ಇಬ್ಬಲೂರು"]] },
          { name: "H.S.R Layout", wards: [[71, "Agara", "ಅಗರ"], [72, "H.S.R Layout", "ಹೆಚ್‌ಎಸ್‌ಆರ್ ಲೇಔಟ್"]] },
        ],
      },
      {
        name: "Bommanahalli",
        ac: "175-Bommanahalli",
        subdivisions: [
          { name: "Bommanahalli", wards: [[62, "Devarachikkanahalli", "ದೇವರಚಿಕ್ಕನಹಳ್ಳಿ"], [63, "Bommanahalli", "ಬೊಮ್ಮನಹಳ್ಳಿ"], [64, "Mangammanapalya East", "ಮಂಗಮ್ಮನಪಾಳ್ಯ ಪೂರ್ವ (?)"]] },
          { name: "Mangammanapalya", wards: [[67, "Bandepalya", "ಬಂಡೆಪಾಳ್ಯ"], [68, "Mangammanapalya", "ಮಂಗಮ್ಮನ ಪಾಳ್ಯ"]] },
          { name: "Singasandra", wards: [[65, "Garvebhavi Palya", "ಗಾರ್ವೆಬಾವಿ ಪಾಳ್ಯ"], [66, "Singasandra", "ಸಿಂಗಸಂದ್ರ"]] },
        ],
      },
    ],
  },
];

// ── Validate & emit ──────────────────────────────────────────────────────
const EXPECT: Record<string, { wards: number; divisions: number; subdivisions: number }> = {
  KENDRA: { wards: 63, divisions: 7, subdivisions: 24 },
  PURVA: { wards: 50, divisions: 7, subdivisions: 22 },
  PASHCHIMA: { wards: 112, divisions: 15, subdivisions: 45 },
  UTTARA: { wards: 72, divisions: 11, subdivisions: 30 },
  DAKSHINA: { wards: 72, divisions: 10, subdivisions: 29 },
};

let ok = true;
let totalWards = 0,
  totalDiv = 0,
  totalSub = 0;
const flat: Record<string, unknown>[] = [];

for (const c of CORPS) {
  const wardNos = new Set<number>();
  let subCount = 0;
  for (const d of c.divisions) {
    for (const s of d.subdivisions) {
      subCount++;
      for (const [no, en, kn] of s.wards) {
        wardNos.add(no);
        flat.push({
          corporation_code: c.code,
          annexure: c.annexure,
          division: d.name,
          assembly_constituency: d.ac ?? null,
          subdivision: s.name,
          ward_no: no,
          ward_name_en: en,
          ward_name_kn: kn.replace(/ \(\?\)$/, ""),
          legible: !kn.endsWith("(?)"),
        });
      }
    }
  }
  const e = EXPECT[c.code]!;
  const wc = wardNos.size;
  const dc = c.divisions.length;
  const okC = wc === e.wards && dc === e.divisions && subCount === e.subdivisions;
  if (!okC) ok = false;
  // contiguity check 1..wards
  const missing = [];
  for (let i = 1; i <= e.wards; i++) if (!wardNos.has(i)) missing.push(i);
  console.log(
    `${c.code.padEnd(10)} wards ${wc}/${e.wards}  div ${dc}/${e.divisions}  sub ${subCount}/${e.subdivisions}  ${okC ? "OK" : "MISMATCH"}${missing.length ? " missing:" + missing.join(",") : ""}`,
  );
  totalWards += wc;
  totalDiv += dc;
  totalSub += subCount;
}

console.log(`TOTAL      wards ${totalWards}/369  div ${totalDiv}/50  sub ${totalSub}/150`);

const out = {
  source: "GBA 5 City Corporation Division & Sub-Division Details (Memo 06-03-2026), Annexures 1-5",
  note: "Ward/division/sub-division names romanised from the scanned Kannada source; normalised against the BBMP-225 English ward list. Names where the scan was only partly legible have legible=false.",
  total_wards: totalWards,
  total_divisions: totalDiv,
  total_subdivisions: totalSub,
  corporations: CORPS,
  wards: flat,
};

writeFileSync(join(process.cwd(), "data", "gba_369_wards.json"), JSON.stringify(out, null, 1));
console.log(ok ? "\n✓ All corporation counts match. Wrote data/gba_369_wards.json" : "\n✗ COUNT MISMATCH — fix before ingest.");
if (!ok) process.exit(1);
