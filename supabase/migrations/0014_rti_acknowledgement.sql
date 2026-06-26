-- Alter rti_applications to support AI-based RTI Acknowledgement Image Verification with metadata & archiving
alter table public.rti_applications add column if not exists ack_image_path text;
alter table public.rti_applications add column if not exists ack_status text not null default 'Not Uploaded'; -- 'Not Uploaded' | 'Uploaded' | 'OCR Processing' | 'OCR Completed' | 'AI Processing' | 'Verified' | 'Manual Review Required' | 'Verification Failed'
alter table public.rti_applications add column if not exists ack_file_metadata jsonb; -- {"fileName": "...", "mimeType": "...", "fileSize": 1234, "uploadedAt": "...", "uploadedBy": "..."}
alter table public.rti_applications add column if not exists ack_ocr_text text;
alter table public.rti_applications add column if not exists ack_ocr_confidence integer;
alter table public.rti_applications add column if not exists ack_document_type text;
alter table public.rti_applications add column if not exists ack_visual_elements jsonb not null default '[]'::jsonb; -- dynamic array of strings: e.g. ["Letterhead", "Official Stamp"]
alter table public.rti_applications add column if not exists ack_extracted_info jsonb; -- dynamic parsed fields
alter table public.rti_applications add column if not exists ack_verification_summary text;
alter table public.rti_applications add column if not exists ack_confidence_score integer;
alter table public.rti_applications add column if not exists ack_recommended_action text;
alter table public.rti_applications add column if not exists ack_history jsonb not null default '[]'::jsonb; -- array of events
alter table public.rti_applications add column if not exists ack_archive jsonb not null default '[]'::jsonb; -- array of superseded acknowledgements for audit trail

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
