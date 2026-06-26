import * as React from "react";
import { GOV_DOC_CONFIG } from "@/lib/pdf/document-config";
import type { GovDocumentData } from "@/lib/pdf/document-registry";

interface GovernmentDocumentViewProps {
  data: GovDocumentData;
}

export function GovernmentDocumentView({ data }: GovernmentDocumentViewProps) {
  const hasSender = !!(data.senderName || data.senderAddress);
  const hasRecipient = !!(data.recipientName || data.recipientAddress);

  return (
    <div className="gov-doc-container">
      {/* 1. Optional Watermark */}
      {GOV_DOC_CONFIG.security?.watermarkText && (
        <div className="gov-doc-watermark">{GOV_DOC_CONFIG.security.watermarkText}</div>
      )}

      {/* 2. Optional Emblem & Office Header */}
      {GOV_DOC_CONFIG.branding?.showEmblem && GOV_DOC_CONFIG.branding?.emblemUrl && (
        <div className="gov-doc-emblem">
          <img src={GOV_DOC_CONFIG.branding.emblemUrl} alt="Government Emblem" />
          {GOV_DOC_CONFIG.branding.officeHeaderName && (
            <div style={{ fontWeight: "bold", fontSize: "14pt", marginTop: "0.5rem", textAlign: "center" }}>
              {GOV_DOC_CONFIG.branding.officeHeaderName}
            </div>
          )}
        </div>
      )}

      {/* 3. Title */}
      <h1 className="gov-doc-title">{data.title}</h1>

      {/* 4. Sender, Date, and Recipient Details */}
      {(hasSender || hasRecipient || data.date) && (
        <table className="gov-doc-header-table">
          <tbody>
            <tr>
              <td>
                {hasSender && (
                  <div>
                    <strong>From:</strong>
                    <br />
                    {data.senderName && <span>{data.senderName}</span>}
                    {data.senderAddress && (
                      <div style={{ whiteSpace: "pre-wrap" }}>{data.senderAddress}</div>
                    )}
                    {data.senderPhone && <div>Ph: {data.senderPhone}</div>}
                    {data.senderEmail && <div>Email: {data.senderEmail}</div>}
                  </div>
                )}
              </td>
              <td style={{ textAlign: "right", verticalAlign: "top", width: "200px" }}>
                {data.referenceNumber && (
                  <div>
                    <strong>Ref No:</strong> {data.referenceNumber}
                  </div>
                )}
                {data.date && (
                  <div>
                    <strong>Date:</strong> {data.date}
                  </div>
                )}
              </td>
            </tr>
            {hasRecipient && (
              <tr>
                <td style={{ paddingTop: "1.5rem" }} colSpan={2}>
                  <strong>To:</strong>
                  <br />
                  {data.recipientName && <div>{data.recipientName}</div>}
                  {data.recipientDesignation && <div>{data.recipientDesignation}</div>}
                  {data.recipientAddress && (
                    <div style={{ whiteSpace: "pre-wrap" }}>{data.recipientAddress}</div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* 5. Subject & Reference Section */}
      {(data.subject || data.reference) && (
        <div className="gov-doc-subject-ref">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {data.subject && (
                <tr>
                  <td style={{ fontWeight: "bold", width: "80px", verticalAlign: "top", padding: "2px 0" }}>
                    Subject:
                  </td>
                  <td style={{ fontWeight: "bold", verticalAlign: "top", padding: "2px 0" }}>
                    {data.subject}
                  </td>
                </tr>
              )}
              {data.reference && (
                <tr>
                  <td style={{ width: "80px", verticalAlign: "top", padding: "2px 0" }}>Ref:</td>
                  <td style={{ verticalAlign: "top", padding: "2px 0" }}>{data.reference}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Salutation */}
      {data.salutation && (
        <div style={{ marginBottom: "1rem", marginTop: "1rem" }}>
          {data.salutation}
        </div>
      )}

      {/* 7. Body Paragraphs */}
      {data.paragraphs && data.paragraphs.length > 0 && (
        <div className="gov-doc-body">
          {data.paragraphs.map((para, idx) => (
            <p key={idx} className="gov-doc-paragraph">
              {para}
            </p>
          ))}
        </div>
      )}

      {/* 8. Numbered Lists (e.g. details of information sought) */}
      {data.numberedList && data.numberedList.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          {data.numberedListLabel && (
            <div style={{ fontWeight: "bold", marginBottom: "0.5rem", marginLeft: "2.5rem" }}>
              {data.numberedListLabel}
            </div>
          )}
          <ol className="gov-doc-list">
            {data.numberedList.map((item, idx) => (
              <li key={idx} className="gov-doc-list-item">
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 9. Closing */}
      {data.closing && (
        <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
          {data.closing}
        </div>
      )}

      {/* 10. Signature block & Seals */}
      {data.senderName && (
        <div className="gov-doc-signature-block">
          <div>Yours faithfully,</div>
          <div style={{ marginTop: "4rem" }}>
            <strong>({data.senderName})</strong>
          </div>
          {data.senderAddress && (
            <div style={{ fontSize: "10pt", color: "#555", marginTop: "0.25rem" }}>
              Applicant / Appellant
            </div>
          )}

          {GOV_DOC_CONFIG.security?.showDigitalSignature && (
            <div className="gov-doc-digital-signature">
              ✓ Digitally Signed by {data.senderName}
              <br />
              Date: {data.date}
            </div>
          )}

          {GOV_DOC_CONFIG.security?.showOfficialSeal && (
            <div
              style={{
                marginTop: "1rem",
                width: "80px",
                height: "80px",
                border: "2px double #ccc",
                borderRadius: "50%",
                display: "inline-block",
                textAlign: "center",
                lineHeight: "80px",
                fontSize: "8pt",
                color: "#999",
              }}
            >
              [OFFICIAL SEAL]
            </div>
          )}
        </div>
      )}
      <div className="gov-doc-footer-clear" />

      {/* 11. Metadata & QR Code */}
      {GOV_DOC_CONFIG.metadata?.showQrCode && GOV_DOC_CONFIG.metadata?.qrCodeContent && (
        <div className="gov-doc-qr-code">
          <div style={{ display: "inline-block", border: "1px solid #ccc", padding: "0.25rem" }}>
            {/* QR Code Placeholder/Text */}
            <span style={{ fontSize: "8pt", color: "#666" }}>[QR Code: {GOV_DOC_CONFIG.metadata.qrCodeContent}]</span>
          </div>
        </div>
      )}

      {GOV_DOC_CONFIG.metadata?.footerNotes && (
        <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "0.5rem", fontSize: "9pt", color: "#666" }}>
          {GOV_DOC_CONFIG.metadata.footerNotes}
        </div>
      )}
    </div>
  );
}
