import { registerNamespace } from "../registry";
import type { NamespaceDictionaries } from "../types";

/** Sidebar/TopNav labels — keys mirror components/nav/nav-items.ts's NAV_ITEMS
 *  one-to-one so wiring is a straight lookup, not a redesign of the nav data. */
const en = {
  "nav.dashboard": "Dashboard",
  "nav.wards": "Wards",
  "nav.corporations": "Corporations",
  "nav.treeMap": "Tree Map",
  "nav.contacts": "Contacts",
  "nav.officers": "Officers",
  "nav.workSearch": "Work Search",

  "nav.rtiDashboard": "RTI Dashboard",
  "nav.allRtis": "All RTIs",
  "nav.newRti": "New RTI",
  "nav.rtiCalendar": "RTI Calendar",
  "nav.rtiReports": "RTI Reports",
  "nav.rtiSettings": "RTI Settings",

  "nav.complaintsDashboard": "Dashboard",
  "nav.complaints": "Complaints",
  "nav.uploadZipOrLetter": "Upload (ZIP or letter)",
  "nav.attachAcknowledgments": "Attach Acknowledgments",
  "nav.printQueue": "Print Queue",
  "nav.escalationFlow": "Escalation Flow",
  "nav.duplicatePhotos": "Duplicate Photos",
  "nav.contractorIntelligence": "Contractor Intelligence",
  "nav.forensicOversight": "Forensic Oversight",
  "nav.complaintsSettings": "Settings",

  "nav.import": "Import",
  "nav.settings": "Settings",

  "nav.section.rti": "RTI",
  "nav.section.complaints": "Complaints",
  "nav.section.admin": "Admin",

  "nav.mobileTitle": "Navigation",
  "nav.searchPlaceholder": "Search wards, contacts…",
  "nav.language": "Language",
  "nav.collapseSidebar": "Collapse sidebar",
  "nav.expandSidebar": "Expand sidebar",

  "commandPalette.title": "Command Palette",
  "commandPalette.placeholder": "Search or jump to a page…",
  "commandPalette.searchEverywhereFor": "Search everywhere for",
  "commandPalette.noPagesFoundFor": "No pages found for",
  "commandPalette.navigate": "navigate",
  "commandPalette.open": "open",
  "commandPalette.press": "Press",
  "commandPalette.anytime": "anytime",

  "nav.openNavigation": "Open navigation",
  "nav.openCommandPalette": "Open command palette",
  "nav.search": "Search",
} as const satisfies Record<string, string>;

const kn: Record<keyof typeof en, string> = {
  "nav.dashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
  "nav.wards": "ವಾರ್ಡ್‌ಗಳು",
  "nav.corporations": "ಕಾರ್ಪೊರೇಷನ್‌ಗಳು",
  "nav.treeMap": "ಟ್ರೀ ಮ್ಯಾಪ್",
  "nav.contacts": "ಸಂಪರ್ಕಗಳು",
  "nav.officers": "ಅಧಿಕಾರಿಗಳು",
  "nav.workSearch": "ಕಾಮಗಾರಿ ಹುಡುಕಾಟ",

  "nav.rtiDashboard": "ಮಾಹಿತಿ ಹಕ್ಕು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
  "nav.allRtis": "ಎಲ್ಲಾ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿಗಳು",
  "nav.newRti": "ಹೊಸ ಮಾಹಿತಿ ಹಕ್ಕು ಅರ್ಜಿ",
  "nav.rtiCalendar": "ಮಾಹಿತಿ ಹಕ್ಕು ಕ್ಯಾಲೆಂಡರ್",
  "nav.rtiReports": "ಮಾಹಿತಿ ಹಕ್ಕು ವರದಿಗಳು",
  "nav.rtiSettings": "ಮಾಹಿತಿ ಹಕ್ಕು ಸಂಯೋಜನೆಗಳು",

  "nav.complaintsDashboard": "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
  "nav.complaints": "ದೂರುಗಳು",
  "nav.uploadZipOrLetter": "ಅಪ್‌ಲೋಡ್ (ZIP ಅಥವಾ ಪತ್ರ)",
  "nav.attachAcknowledgments": "ಸ್ವೀಕೃತಿಗಳನ್ನು ಲಗತ್ತಿಸಿ",
  "nav.printQueue": "ಮುದ್ರಣ ಸಾಲು",
  "nav.escalationFlow": "ಆದ್ಯತಾ ಹೆಚ್ಚಳ ಹರಿವು",
  "nav.duplicatePhotos": "ನಕಲಿ ಫೋಟೋಗಳು",
  "nav.contractorIntelligence": "ಗುತ್ತಿಗೆದಾರ ವಿಶ್ಲೇಷಣೆ",
  "nav.forensicOversight": "ಫೊರೆನ್ಸಿಕ್ ಮೇಲ್ವಿಚಾರಣೆ",
  "nav.complaintsSettings": "ಸಂಯೋಜನೆಗಳು",

  "nav.import": "ಆಮದು",
  "nav.settings": "ಸಂಯೋಜನೆಗಳು",

  "nav.section.rti": "ಮಾಹಿತಿ ಹಕ್ಕು",
  "nav.section.complaints": "ದೂರುಗಳು",
  "nav.section.admin": "ನಿರ್ವಹಣೆ",

  "nav.mobileTitle": "ನ್ಯಾವಿಗೇಷನ್",
  "nav.searchPlaceholder": "ವಾರ್ಡ್, ಸಂಪರ್ಕಗಳನ್ನು ಹುಡುಕಿ…",
  "nav.language": "ಭಾಷೆ",
  "nav.collapseSidebar": "ಸೈಡ್‌ಬಾರ್ ಮಡಚಿ",
  "nav.expandSidebar": "ಸೈಡ್‌ಬಾರ್ ವಿಸ್ತರಿಸಿ",

  "commandPalette.title": "ಕಮಾಂಡ್ ಪ್ಯಾಲೆಟ್",
  "commandPalette.placeholder": "ಹುಡುಕಿ ಅಥವಾ ಪುಟಕ್ಕೆ ಹೋಗಿ…",
  "commandPalette.searchEverywhereFor": "ಎಲ್ಲೆಡೆ ಹುಡುಕಿ",
  "commandPalette.noPagesFoundFor": "ಯಾವುದೇ ಪುಟಗಳು ಕಂಡುಬಂದಿಲ್ಲ",
  "commandPalette.navigate": "ನ್ಯಾವಿಗೇಟ್",
  "commandPalette.open": "ತೆರೆಯಿರಿ",
  "commandPalette.press": "ಒತ್ತಿ",
  "commandPalette.anytime": "ಯಾವಾಗ ಬೇಕಾದರೂ",

  "nav.openNavigation": "ನ್ಯಾವಿಗೇಷನ್ ತೆರೆಯಿರಿ",
  "nav.openCommandPalette": "ಕಮಾಂಡ್ ಪ್ಯಾಲೆಟ್ ತೆರೆಯಿರಿ",
  "nav.search": "ಹುಡುಕಿ",
};

registerNamespace("navigation", { en, kn } as NamespaceDictionaries);
