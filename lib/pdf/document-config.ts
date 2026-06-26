export interface GovDocConfig {
  pageSize: "A4";
  orientation: "portrait";
  margins: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  typography: {
    fontFamily: string;
    bodySize: string;
    headingSize: string;
    titleSize: string;
    lineHeight: string;
    paragraphSpacing: string;
  };
  // Future extensibility options (all optional)
  branding?: {
    showLogo?: boolean;
    logoUrl?: string;
    showEmblem?: boolean;
    emblemUrl?: string;
    officeHeaderName?: string;
  };
  security?: {
    watermarkText?: string;
    showDigitalSignature?: boolean;
    showOfficialSeal?: boolean;
  };
  metadata?: {
    showQrCode?: boolean;
    qrCodeContent?: string;
    footerNotes?: string;
  };
}

export const GOV_DOC_CONFIG: GovDocConfig = {
  pageSize: "A4",
  orientation: "portrait",
  margins: {
    top: "25mm",
    bottom: "25mm",
    left: "25mm",
    right: "25mm",
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    bodySize: "12pt",
    headingSize: "14pt",
    titleSize: "16pt",
    lineHeight: "1.5",
    paragraphSpacing: "1.5rem",
  },
  // Plain-paper output by default (branding/watermarks disabled)
  branding: {},
  security: {},
  metadata: {}
};
