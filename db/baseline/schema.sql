--
-- PostgreSQL database dump
--

\restrict zZHOHzEzzfeVVOKlbvFijFHgEhibdDdMr6Q9CKhIG64fCTFPnV7AEGqRRzAV2rZ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public;  -- already present on the target server


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Extensions required by the dumped objects.
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--
-- Replaces Supabase's auth.users. Only the columns this application actually
-- reads are carried over. encrypted_password holds the SAME bcrypt hashes
-- Supabase issued, so existing passwords keep working unchanged; they are
-- verified with pgcrypto's crypt() rather than a JS bcrypt dependency.
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    phone text,
    encrypted_password text,
    email_confirmed_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    banned_until timestamp with time zone,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_users_pkey PRIMARY KEY (id)
);

-- Case-insensitive, matching how Supabase Auth treated email identifiers.
CREATE UNIQUE INDEX app_users_email_key ON public.app_users (lower(email));
CREATE INDEX app_users_phone_idx ON public.app_users (phone) WHERE phone IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;



--
-- Name: bbmp_works; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bbmp_works (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text,
    work_number text,
    project_id text,
    work_name text,
    work_description text,
    work_category text,
    work_type text,
    ward_number text,
    ward_name text,
    zone text,
    division_name text,
    sub_division_name text,
    department_name text,
    scheme_name text,
    grant_type text,
    budget_head text,
    financial_year text,
    estimate_amount numeric,
    sanctioned_amount numeric,
    tender_amount numeric,
    tender_number text,
    tender_date date,
    tender_status text,
    work_order_number text,
    work_order_date date,
    administrative_approval_number text,
    technical_sanction_number text,
    start_date date,
    expected_completion_date date,
    actual_completion_date date,
    progress_percentage numeric,
    physical_progress text,
    paid_amount numeric,
    engineer_name text,
    engineer_phone text,
    engineer_email text,
    assistant_engineer text,
    assistant_executive_engineer text,
    executive_engineer text,
    superintending_engineer text,
    chief_engineer text,
    contractor_name text,
    contractor_address text,
    contractor_phone text,
    contractor_email text,
    contractor_registration_number text,
    location_description text,
    road_name text,
    layout_name text,
    latitude double precision,
    longitude double precision,
    work_status text,
    verification_status text DEFAULT 'Unverified'::text NOT NULL,
    official_source_count integer DEFAULT 0 NOT NULL,
    latest_update text,
    remarks text,
    job_case_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bbmp_works_progress_pct_check CHECK (((progress_percentage IS NULL) OR ((progress_percentage >= (0)::numeric) AND (progress_percentage <= (100)::numeric)))),
    CONSTRAINT bbmp_works_verification_status_check CHECK ((verification_status = ANY (ARRAY['Verified'::text, 'Partially Verified'::text, 'Unverified'::text, 'Conflicting Information'::text])))
);


--
-- Name: bbmp_works_fuzzy_search(text, text, real, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bbmp_works_fuzzy_search(p_column text, p_query text, p_threshold real DEFAULT 0.3, p_limit integer DEFAULT 25) RETURNS SETOF public.bbmp_works
    LANGUAGE plpgsql STABLE
    AS $_$
begin
  if p_column not in ('ward_name','work_name','contractor_name','engineer_name','location_description') then
    raise exception 'bbmp_works_fuzzy_search: column % not allowed', p_column;
  end if;
  return query execute format(
    'select * from public.bbmp_works where %I is not null and similarity(%I, $1) > $2 order by similarity(%I, $1) desc limit $3',
    p_column, p_column, p_column
  ) using p_query, p_threshold, p_limit;
end;
$_$;


--
-- Name: next_complaint_case_number(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_complaint_case_number(p_prefix text, p_year integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n integer;
begin
  insert into public.complaint_counters (prefix, year, seq) values (p_prefix, p_year, 1)
    on conflict (prefix, year) do update set seq = public.complaint_counters.seq + 1
    returning seq into n;
  return p_prefix || '-' || p_year::text || '-' || lpad(n::text, 6, '0');
end; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


--
-- Name: ack_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ack_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_storage_path text,
    original_name text,
    page_count integer DEFAULT 0 NOT NULL,
    processed_pages integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    stage text,
    message text,
    error text,
    page_ocr jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT ack_import_batches_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'review'::text, 'committing'::text, 'committed'::text, 'failed'::text])))
);


--
-- Name: TABLE ack_import_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ack_import_batches IS 'Bulk acknowledgment reconciliation: one uploaded scanned PDF of mixed BBMP acknowledgments, split → matched → attached to existing complaints after human review.';


--
-- Name: ack_import_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ack_import_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    ocr_text text,
    extracted jsonb DEFAULT '{}'::jsonb NOT NULL,
    thumb_paths jsonb DEFAULT '[]'::jsonb NOT NULL,
    proposed_complaint_id uuid,
    match_confidence text DEFAULT 'none'::text NOT NULL,
    match_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    assigned_complaint_id uuid,
    decision text DEFAULT 'pending'::text NOT NULL,
    attached_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ack_import_items_decision_check CHECK ((decision = ANY (ARRAY['pending'::text, 'confirmed'::text, 'skipped'::text, 'committed'::text]))),
    CONSTRAINT ack_import_items_match_confidence_check CHECK ((match_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'none'::text])))
);


--
-- Name: TABLE ack_import_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ack_import_items IS 'One detected acknowledgment section: its page range in the original, extracted identifiers, AI-proposed complaint match + confidence, the human decision, and (once attached) the created complaint_documents row.';


--
-- Name: ai_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text,
    entity_id uuid,
    kind text NOT NULL,
    provider text,
    model text,
    language text,
    prompt text,
    content text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    file_name text,
    file_type text,
    storage_path text,
    description text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    source_page text,
    ocr_text text,
    verification_status text DEFAULT 'PENDING'::text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_intakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_intakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    output_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    job_number text,
    ward_id uuid,
    road_name text,
    contractor text,
    language text DEFAULT 'Kannada'::text NOT NULL,
    scope text DEFAULT 'smart'::text NOT NULL,
    selected_codes text[] DEFAULT '{}'::text[] NOT NULL,
    notes jsonb DEFAULT '{}'::jsonb NOT NULL,
    recipient jsonb,
    cc_chain jsonb,
    sender jsonb,
    flag_counts jsonb,
    loss_lines jsonb,
    loss_total numeric,
    skeleton jsonb,
    content text,
    ai_draft_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    field_name text,
    old_value text,
    new_value text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: background_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    title text,
    entity_type text,
    entity_id uuid,
    progress integer,
    input jsonb,
    result jsonb,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    cancel_requested boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone,
    CONSTRAINT background_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'retrying'::text, 'done'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE background_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.background_jobs IS 'Async/automated work tracked for a live progress indicator + result pickup after navigation.';


--
-- Name: COLUMN background_jobs.cancel_requested; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.background_jobs.cancel_requested IS 'Set by cancelJobAction; a running handler cooperatively checks this via JobHandlerContext.isCancelled() between loop iterations (single-process Node cannot forcibly kill an in-flight async function).';


--
-- Name: COLUMN background_jobs.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.background_jobs.priority IS 'Higher claims first. Default 0 for every job type today; the column exists so a future job type can jump the queue without a schema change.';


--
-- Name: COLUMN background_jobs.retry_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.background_jobs.retry_count IS 'Automatic retries only (transient errors matching a job type''s retryableErrorPatterns) — a manual Retry-button click resets this to 0, it is not a lifetime attempt counter.';


--
-- Name: COLUMN background_jobs.next_retry_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.background_jobs.next_retry_at IS 'When status=retrying, the exponential-backoff-computed time the sweep should re-dispatch this job. Null otherwise.';


--
-- Name: bill_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid,
    document_id uuid,
    source text DEFAULT 'document'::text NOT NULL,
    extracted jsonb,
    findings jsonb,
    grand_total numeric,
    red_flag_count integer DEFAULT 0 NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    confidence text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: case_intelligence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_intelligence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    artifact jsonb,
    context_hash text,
    engine_version text,
    model text,
    ai_configured_at_build boolean DEFAULT false NOT NULL,
    ai_synthesis_used boolean DEFAULT false NOT NULL,
    build_status text DEFAULT 'idle'::text NOT NULL,
    build_error text,
    built_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT case_intelligence_build_status_check CHECK ((build_status = ANY (ARRAY['idle'::text, 'queued'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: TABLE case_intelligence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.case_intelligence IS 'Cached Case Intelligence Engine artifact — one row per complaint, upserted. Recomputed only when context_hash / engine_version / prompt version changes.';


--
-- Name: communication_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    comm_type text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_person text,
    summary text,
    outcome text,
    next_action text,
    attachment text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    officer_id uuid,
    phone_or_email text,
    next_action_date date,
    document_id uuid,
    CONSTRAINT communication_logs_comm_type_check CHECK ((comm_type = ANY (ARRAY['Phone call'::text, 'WhatsApp'::text, 'Email'::text, 'Letter'::text, 'In-person'::text, 'Portal update'::text, 'Hearing'::text, 'Site visit'::text])))
);


--
-- Name: complaint_action_taken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_action_taken (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    action_taken_date date,
    action_reported_date date,
    action_taken_by_name text,
    action_taken_by_designation text,
    department text,
    action_summary text,
    action_details text,
    work_completed boolean,
    site_visited boolean,
    photo_evidence_available boolean,
    document_id uuid,
    user_satisfaction text,
    pending_work text,
    next_action_required text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: complaint_ai_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_ai_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    health_score integer DEFAULT 100 NOT NULL,
    risk_level text DEFAULT 'Low'::text NOT NULL,
    risk_factors jsonb DEFAULT '[]'::jsonb NOT NULL,
    current_situation text,
    reasoning text,
    expected_outcome text,
    confidence text,
    recommendation text,
    recommendation_action text,
    missing_information jsonb DEFAULT '[]'::jsonb NOT NULL,
    detected_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
    timeline_summary text,
    context_hash text,
    last_analyzed_at timestamp with time zone,
    analysis_status text DEFAULT 'idle'::text NOT NULL,
    analysis_error text,
    ai_configured_at_analysis boolean DEFAULT false NOT NULL,
    last_reminder_generated_at timestamp with time zone,
    last_reminder_draft_id uuid,
    last_escalation_generated_at timestamp with time zone,
    last_escalation_draft_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    outstanding_issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    contradictions jsonb DEFAULT '[]'::jsonb NOT NULL,
    commitments jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence_score integer,
    analyzed_correspondence_count integer,
    narrative_language text DEFAULT 'kn'::text NOT NULL,
    narratives jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ai_reco_confidence_score_range CHECK (((confidence_score IS NULL) OR ((confidence_score >= 0) AND (confidence_score <= 100)))),
    CONSTRAINT ai_reco_recommendation_action_check CHECK ((recommendation_action = ANY (ARRAY['generate_reminder'::text, 'escalate'::text, 'counter_reply'::text, 'wait'::text, 'close'::text, 'upload_evidence'::text, 'review'::text, 'none'::text, 'request_clarification'::text, 'convert_to_rti'::text]))),
    CONSTRAINT complaint_ai_recommendations_analysis_status_check CHECK ((analysis_status = ANY (ARRAY['idle'::text, 'queued'::text, 'running'::text, 'done'::text, 'failed'::text]))),
    CONSTRAINT complaint_ai_recommendations_confidence_check CHECK ((confidence = ANY (ARRAY['High'::text, 'Medium'::text, 'Low'::text]))),
    CONSTRAINT complaint_ai_recommendations_health_score_check CHECK (((health_score >= 0) AND (health_score <= 100))),
    CONSTRAINT complaint_ai_recommendations_risk_level_check CHECK ((risk_level = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])))
);


--
-- Name: TABLE complaint_ai_recommendations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.complaint_ai_recommendations IS 'Cached AI Complaint Advisor state — one row per complaint, upserted. Deterministic health/risk fields are recomputed synchronously and cheaply; AI narrative fields are recomputed asynchronously only when context_hash changes.';


--
-- Name: COLUMN complaint_ai_recommendations.outstanding_issues; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_ai_recommendations.outstanding_issues IS 'AI-tracked open issues carried forward across rounds: [{issue, firstRaisedOn, status:open|answered|partial}].';


--
-- Name: COLUMN complaint_ai_recommendations.contradictions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_ai_recommendations.contradictions IS 'Where a department reply conflicts with an earlier reply: [{summary, conflictsWith}].';


--
-- Name: COLUMN complaint_ai_recommendations.commitments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_ai_recommendations.commitments IS 'Department promises + fulfilment: [{commitment, madeOn, dueBy, status:pending|fulfilled|overdue|unmet}].';


--
-- Name: complaint_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_counters (
    prefix text NOT NULL,
    year integer NOT NULL,
    seq integer DEFAULT 0 NOT NULL
);


--
-- Name: complaint_cycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_cycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    round integer DEFAULT 1 NOT NULL,
    stage text NOT NULL,
    event text NOT NULL,
    letter_draft_id uuid,
    ai_draft_id uuid,
    complaint_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT complaint_cycle_events_event_check CHECK ((event = ANY (ARRAY['ack_uploaded'::text, 'reminder_sent'::text, 'legal_notice_sent'::text, 'escalated'::text, 'reply_received'::text, 'counter_reply_filed'::text])))
);


--
-- Name: TABLE complaint_cycle_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.complaint_cycle_events IS 'Append-only audit trail of the escalation ladder: every ack upload, auto-drafted reminder/legal-notice/escalation letter, reply, and counter-reply-filed re-arm. Also the scheduler''s idempotency check.';


--
-- Name: complaint_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    document_type text,
    title text,
    description text,
    original_file_name text,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    processed_storage_path text,
    thumbnail_storage_path text,
    public_url text,
    private_url text,
    mime_type text,
    file_size bigint,
    page_count integer,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    captured_date date,
    document_date date,
    source_person text,
    source_department text,
    source_office text,
    ocr_status text DEFAULT 'Not Started'::text NOT NULL,
    ocr_raw_text text,
    ocr_clean_text text,
    ocr_confidence numeric,
    ocr_language text,
    ai_summary text,
    ai_extracted_json jsonb,
    ai_suggested_status text,
    ai_suggested_next_action text,
    ai_suggested_follow_up_date date,
    ai_confidence text,
    verification_status text DEFAULT 'Pending Review'::text NOT NULL,
    verified_by uuid,
    verified_at timestamp with time zone,
    internal_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    file_sha256 text,
    phash text,
    dhash text,
    exif_gps_lat double precision,
    exif_gps_lon double precision,
    exif_taken_at timestamp with time zone,
    photo_stage text,
    is_duplicate boolean DEFAULT false NOT NULL,
    dup_severity text,
    dup_matches jsonb,
    dup_checked_at timestamp with time zone,
    vision_verdict text,
    vision_json jsonb,
    vision_checked_at timestamp with time zone,
    geo_flag text,
    geo_distance_m double precision,
    ai_photo_descriptor jsonb,
    visual_phrase text,
    relative_path text,
    ai_summary_status text DEFAULT 'none'::text NOT NULL,
    ai_summary_error text,
    ai_summary_generated_at timestamp with time zone,
    source_page_start integer,
    source_page_end integer,
    source_original_path text,
    source_original_name text,
    document_facts jsonb,
    document_facts_hash text,
    document_facts_extracted_at timestamp with time zone,
    recipients jsonb,
    copy_to jsonb,
    doc_variant text DEFAULT 'recipient'::text NOT NULL,
    parent_document_id uuid,
    CONSTRAINT complaint_documents_ai_summary_status_check CHECK ((ai_summary_status = ANY (ARRAY['none'::text, 'generating'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: COLUMN complaint_documents.relative_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_documents.relative_path IS 'Same purpose as job_documents.relative_path. Only populated for the forensic-ZIP-imported letter-attachment rows (storage_bucket = ''r2''); null for all other complaint_documents rows (ordinary uploads, RTI — unaffected, out of scope).';


--
-- Name: COLUMN complaint_documents.ai_summary_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_documents.ai_summary_status IS 'AI-summary lifecycle: none (not generated), generating (in flight), ready (stored in ai_summary/ai_extracted_json — View Summary reads it, never regenerates), failed (retryable).';


--
-- Name: COLUMN complaint_documents.source_page_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_documents.source_page_start IS 'For a document carved from a multi-complaint PDF: 1-indexed first page in the original combined upload (null for normal uploads).';


--
-- Name: COLUMN complaint_documents.source_original_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaint_documents.source_original_path IS 'R2 key of the complete original PDF this document was split from — the full source is preserved and viewable (null for normal uploads).';


--
-- Name: complaint_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    reply_date date,
    reply_received_date date,
    replied_by_name text,
    replied_by_designation text,
    department text,
    reply_mode text,
    reply_summary text,
    reply_full_text text,
    document_id uuid,
    is_satisfactory boolean,
    issues_remaining text,
    next_action_suggested text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: complaint_timeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid NOT NULL,
    event_type text NOT NULL,
    event_date timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    summary text,
    related_document_id uuid,
    related_officer_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    ward_id uuid,
    eng_subdivision_id uuid,
    contact_id uuid,
    complaint_number text,
    rti_number text,
    date_submitted date,
    due_date date,
    status text DEFAULT 'Draft'::text NOT NULL,
    notes text,
    next_action_date date,
    reminder_flag boolean DEFAULT false NOT NULL,
    attachment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    internal_ref text,
    description text,
    location text,
    latitude double precision,
    longitude double precision,
    landmark text,
    complaint_mode text,
    complaint_filed_to text,
    responsible_department text,
    priority text DEFAULT 'Medium'::text,
    public_impact text,
    escalation_level text,
    acknowledgment_date date,
    expected_resolution_date date,
    resolution_summary text,
    citizen_satisfaction text,
    created_by uuid,
    updated_by uuid,
    internal_case_number text,
    complaint_subtype text,
    complaint_filed_by text,
    requested_action text,
    corporation_id uuid,
    division_id uuid,
    assigned_engineer_id uuid,
    assigned_officer_id uuid,
    latest_reply_summary text,
    latest_reply_date date,
    latest_action_taken_summary text,
    latest_action_taken_date date,
    next_follow_up_date date,
    closure_date date,
    closure_summary text,
    deleted_at timestamp with time zone,
    ward_type text DEFAULT 'BBMP'::text,
    gba_ward_id uuid,
    gba_division text,
    gba_subdivision text,
    job_number text,
    contractor text,
    escalation_stage text DEFAULT 'awaiting_ack'::text NOT NULL,
    escalation_stage_deadline timestamp with time zone,
    escalation_stage_entered_at timestamp with time zone,
    escalation_round integer DEFAULT 1 NOT NULL,
    reporter_name text,
    ack_officer_name text,
    CONSTRAINT complaints_escalation_stage_check CHECK ((escalation_stage = ANY (ARRAY['awaiting_ack'::text, 'awaiting_reply'::text, 'reminder_sent'::text, 'legal_notice_sent'::text, 'escalated'::text, 'replied'::text, 'closed'::text]))),
    CONSTRAINT complaints_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Filed'::text, 'Acknowledged'::text, 'Under Review'::text, 'Assigned To Engineer'::text, 'Site Visit Pending'::text, 'Site Visit Done'::text, 'Work In Progress'::text, 'Reply Received'::text, 'Action Taken Report Received'::text, 'Partially Resolved'::text, 'Resolved'::text, 'Reopened'::text, 'Escalated'::text, 'Converted To RTI'::text, 'Closed'::text, 'No Response'::text, 'Overdue'::text]))),
    CONSTRAINT complaints_type_check CHECK ((type = ANY (ARRAY['Road Infrastructure'::text, 'Storm Water Drain'::text, 'Lakes'::text, 'Electrical'::text, 'Horticulture'::text, 'Town Planning'::text, 'Revenue'::text, 'Health'::text, 'Legal'::text, 'IT'::text, 'Other'::text]))),
    CONSTRAINT complaints_ward_type_check CHECK ((ward_type = ANY (ARRAY['GBA'::text, 'BBMP'::text])))
);


--
-- Name: COLUMN complaints.escalation_stage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.escalation_stage IS 'No-reply escalation ladder stage. Independent of status: awaiting_ack (no clock yet) -> awaiting_reply (14 calendar days from acknowledgment_date) -> reminder_sent (7 working days) -> legal_notice_sent (7 working days) -> escalated (terminal, Lokayukta/Chief Secretary/CM letters drafted). replied/closed halt the ladder.';


--
-- Name: COLUMN complaints.escalation_stage_deadline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.escalation_stage_deadline IS 'When the CURRENT stage elapses and the scheduler should draft the next letter. Computed once on stage entry (working-day aware), not recomputed from raw calendar math each run. Null when idle (awaiting_ack/replied/closed).';


--
-- Name: COLUMN complaints.escalation_round; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.escalation_round IS 'Increments each time a reply arrives and our counter-reply re-arms the ladder — round 1 is the original letter, round 2 is the first counter-reply, etc.';


--
-- Name: contact_jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_jurisdictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    ward_id uuid,
    ward_no integer,
    ward_name text,
    zone text,
    aro_office_division text,
    jurisdiction_type text DEFAULT 'ward'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_jurisdictions_jurisdiction_type_check CHECK ((jurisdiction_type = ANY (ARRAY['ward'::text, 'division'::text, 'zone'::text, 'city'::text])))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    designation text NOT NULL,
    department text,
    corporation_id uuid,
    division_id uuid,
    eng_subdivision_id uuid,
    office_address text,
    phone text,
    whatsapp text,
    email text,
    office_timing text,
    jurisdiction_notes text,
    latitude double precision,
    longitude double precision,
    source text,
    source_page text,
    verification_status text DEFAULT 'PENDING'::text NOT NULL,
    last_verified_date date,
    confidence_score text DEFAULT 'MEDIUM'::text NOT NULL,
    public_notes text,
    internal_notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    role_level text,
    reporting_officer_id uuid,
    charge_type text,
    current_posting_start date,
    current_posting_end date,
    transfer_status text,
    public_visible boolean DEFAULT true NOT NULL,
    official_title text,
    office_name text,
    letter_salutation text,
    designation_category text,
    office_type text,
    zone text,
    employee_code text,
    officer_status text DEFAULT 'Active'::text NOT NULL,
    can_receive_complaint boolean DEFAULT true NOT NULL,
    can_receive_rti boolean DEFAULT true NOT NULL,
    can_receive_appeal boolean DEFAULT true NOT NULL,
    can_receive_legal_notice boolean DEFAULT true NOT NULL,
    can_receive_tvcc_notice boolean DEFAULT false NOT NULL,
    imported_from text,
    imported_at timestamp with time zone,
    CONSTRAINT contacts_confidence_score_check CHECK ((confidence_score = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text]))),
    CONSTRAINT contacts_officer_status_check CHECK ((officer_status = ANY (ARRAY['Active'::text, 'Transferred'::text, 'Retired'::text, 'Inactive'::text]))),
    CONSTRAINT contacts_verification_status_check CHECK ((verification_status = ANY (ARRAY['VERIFIED'::text, 'PENDING'::text, 'NEEDS_CORRECTION'::text, 'RETIRED_TRANSFERRED'::text, 'UNKNOWN'::text])))
);


--
-- Name: corporations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    name_kn text,
    ward_count integer DEFAULT 0 NOT NULL,
    division_count integer DEFAULT 0 NOT NULL,
    subdivision_count integer DEFAULT 0 NOT NULL,
    assembly_constituencies text[] DEFAULT '{}'::text[] NOT NULL,
    annexure text,
    address text,
    phone text,
    email text,
    website text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT corporations_code_check CHECK ((code = ANY (ARRAY['KENDRA'::text, 'PURVA'::text, 'PASHCHIMA'::text, 'UTTARA'::text, 'DAKSHINA'::text])))
);


--
-- Name: divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.divisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    corporation_id uuid,
    corporation_derived boolean DEFAULT true NOT NULL,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    old_names text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: eng_subdivisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eng_subdivisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sl_no integer,
    division_id uuid,
    address text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: escalation_flow_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalation_flow_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_key text NOT NULL,
    label text NOT NULL,
    sla_days integer,
    sla_unit text,
    on_elapse_draft_kind text,
    on_elapse_next_stage text NOT NULL,
    position_x double precision DEFAULT 0 NOT NULL,
    position_y double precision DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT escalation_flow_configs_sla_unit_check CHECK ((sla_unit = ANY (ARRAY['calendar'::text, 'working'::text])))
);


--
-- Name: TABLE escalation_flow_configs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.escalation_flow_configs IS 'The escalation ladder''s configuration — single source of truth for both the scheduler (lib/complaints/escalation-scheduler.ts) and the drag-drop process-flow page. Editing sla_days/sla_unit/on_elapse_draft_kind changes ladder behavior with no code change.';


--
-- Name: COLUMN escalation_flow_configs.on_elapse_draft_kind; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.escalation_flow_configs.on_elapse_draft_kind IS 'ComplaintDraftKind to auto-draft when this stage''s SLA elapses. Null at legal_notice_sent — three escalation letters (Lokayukta/Chief Secretary/CM office) are drafted together and the human picks which to send.';


--
-- Name: escalation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    from_officer text,
    to_officer text,
    from_level text,
    to_level text,
    reason text,
    escalated_on date,
    draft_generated boolean DEFAULT false NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    response_received text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finding_review; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finding_review (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    finding_code text NOT NULL,
    status text DEFAULT 'dismissed'::text NOT NULL,
    reason text,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: follow_up_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_up_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text,
    outcome text,
    action_date date,
    next_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: forensic_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forensic_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'Processing'::text NOT NULL,
    extract_dir text NOT NULL,
    original_file_name text,
    zip_size bigint,
    folder_count integer,
    jobs jsonb,
    created_case_ids jsonb,
    created_complaint_ids jsonb,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    commit_summary jsonb
);


--
-- Name: COLUMN forensic_import_batches.extract_dir; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.forensic_import_batches.extract_dir IS 'Local filesystem path (this container instance only — not object storage) that the uploaded ZIP was extracted into at analyze-time. Read by commitForensicImportAction; deleted (best-effort) once all selected jobs have been processed, success or failure. If the container restarts between analyze and commit this path is gone — commit fails with a clear "please re-upload" error rather than crashing.';


--
-- Name: COLUMN forensic_import_batches.commit_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.forensic_import_batches.commit_summary IS 'Import summary written once at the end of commitForensicImportAction: {totalFiles, uploaded, failed, skipped, durationMs}. Null until committed.';


--
-- Name: gba_wards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gba_wards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    corporation_code text NOT NULL,
    annexure text,
    division text NOT NULL,
    assembly_constituency text,
    subdivision text NOT NULL,
    ward_no integer NOT NULL,
    ward_name_en text NOT NULL,
    ward_name_kn text,
    legible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gba_wards_corporation_code_check CHECK ((corporation_code = ANY (ARRAY['KENDRA'::text, 'PURVA'::text, 'PASHCHIMA'::text, 'UTTARA'::text, 'DAKSHINA'::text])))
);


--
-- Name: hearings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hearings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    commission_name text,
    hearing_date date,
    hearing_time time without time zone,
    status text,
    outcome text,
    next_date date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    sheet_name text,
    total_rows integer DEFAULT 0 NOT NULL,
    imported_rows integer DEFAULT 0 NOT NULL,
    skipped_rows integer DEFAULT 0 NOT NULL,
    error_rows integer DEFAULT 0 NOT NULL,
    dry_run boolean DEFAULT false NOT NULL,
    imported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'forensic_zip'::text NOT NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    fingerprint text NOT NULL,
    chunk_size integer DEFAULT 8388608 NOT NULL,
    received_bytes bigint DEFAULT 0 NOT NULL,
    staged_path text,
    status text DEFAULT 'uploading'::text NOT NULL,
    stage text,
    progress integer DEFAULT 0 NOT NULL,
    message text,
    error text,
    events jsonb DEFAULT '[]'::jsonb NOT NULL,
    auto_commit boolean DEFAULT true NOT NULL,
    batch_id uuid,
    job_codes text[],
    complaint_ids uuid[],
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT import_uploads_status_check CHECK ((status = ANY (ARRAY['uploading'::text, 'queued'::text, 'processing'::text, 'review'::text, 'done'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE import_uploads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.import_uploads IS 'Chunked upload sessions + processing queue for forensic ZIP imports. staged_path is a LOCAL app-server file (never object storage); one worker processes queued rows FIFO and streams progress to the client over SSE.';


--
-- Name: COLUMN import_uploads.fingerprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.import_uploads.fingerprint IS 'Client-side file identity "name|size|lastModified"; used to resume an interrupted upload when the same file is re-selected (or restored from an IndexedDB file handle) on the same PC.';


--
-- Name: job_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    report jsonb,
    risk_score integer DEFAULT 0 NOT NULL,
    risk_band text,
    total_exposure numeric,
    finding_count integer DEFAULT 0 NOT NULL,
    red_flag_count integer DEFAULT 0 NOT NULL,
    doc_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    ward text,
    year text,
    serial text,
    description text,
    contractor text,
    gross_amount numeric,
    deduction numeric,
    net_amount numeric,
    br_number text,
    wo_id text,
    bill_ids text,
    wo_ref text,
    source text DEFAULT 'ifms_portal'::text NOT NULL,
    status text DEFAULT 'downloaded'::text NOT NULL,
    file_count integer DEFAULT 0 NOT NULL,
    complaint_id uuid,
    download_run_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    zone text,
    division text,
    sub_division text
);


--
-- Name: job_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_case_id uuid NOT NULL,
    job_number text NOT NULL,
    document_type text,
    original_file_name text,
    title text,
    storage_bucket text,
    storage_path text,
    mime_type text,
    file_size integer,
    page_count integer DEFAULT 1 NOT NULL,
    source text DEFAULT 'ifms_portal'::text NOT NULL,
    is_blank_template boolean DEFAULT false NOT NULL,
    ocr_status text DEFAULT 'Queued'::text NOT NULL,
    ocr_language text,
    ocr_raw_text text,
    ocr_clean_text text,
    ocr_confidence integer,
    ai_summary text,
    ai_extracted_json jsonb,
    file_sha256 text,
    phash text,
    dhash text,
    exif_gps_lat double precision,
    exif_gps_lon double precision,
    exif_taken_at timestamp with time zone,
    photo_stage text,
    geo_flag text,
    geo_distance_m double precision,
    is_duplicate boolean DEFAULT false NOT NULL,
    dup_severity text,
    dup_matches jsonb,
    vision_verdict text,
    vision_json jsonb,
    vision_checked_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_photo_descriptor jsonb,
    visual_phrase text,
    relative_path text,
    document_facts jsonb,
    document_facts_hash text,
    document_facts_extracted_at timestamp with time zone
);


--
-- Name: COLUMN job_documents.relative_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.job_documents.relative_path IS 'Path within the job''s R2 folder (storage_path = forensic/<job-number>/<relative_path>), preserving the forensic-audit-skill''s data/letters/work grouping. Only populated for storage_bucket = ''r2'' rows; null for legacy IFMS-portal rows.';


--
-- Name: job_download_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_download_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    selector_kind text,
    selector_value text,
    status text DEFAULT 'running'::text NOT NULL,
    codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    cursor integer DEFAULT 0 NOT NULL,
    jobs_found integer DEFAULT 0 NOT NULL,
    jobs_done integer DEFAULT 0 NOT NULL,
    files_downloaded integer DEFAULT 0 NOT NULL,
    files_failed integer DEFAULT 0 NOT NULL,
    log jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_eligibility; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_eligibility (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    document_id uuid,
    req_key text NOT NULL,
    label text,
    operator text,
    required text,
    actual text,
    critical boolean DEFAULT true,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_insurance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    document_id uuid,
    policy_type text,
    start_date date,
    end_date date,
    sum_insured numeric,
    premium_receipt boolean,
    authority_named boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_running_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_running_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    document_id uuid,
    bill_no text,
    bill_date date,
    item_code text,
    previous_measurement numeric,
    this_bill numeric,
    total_upto_date numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_timeline_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_timeline_dates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text NOT NULL,
    document_id uuid,
    event text NOT NULL,
    event_date date,
    raw text,
    confidence text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: letter_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.letter_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_number text,
    complaint_id uuid,
    variant text NOT NULL,
    language text DEFAULT 'Kannada'::text NOT NULL,
    signatory_key text DEFAULT 'raghav_gowda'::text NOT NULL,
    content text,
    skeleton jsonb,
    payments jsonb,
    quantities jsonb,
    evidence_index jsonb,
    summary_box jsonb,
    risk_score integer,
    band text,
    ai_used boolean DEFAULT false NOT NULL,
    lint_ok boolean DEFAULT false NOT NULL,
    file_name text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    print_status text DEFAULT 'none'::text NOT NULL,
    printed_at timestamp with time zone,
    printed_by uuid,
    CONSTRAINT letter_drafts_print_status_check CHECK ((print_status = ANY (ARRAY['none'::text, 'pending'::text, 'printed'::text])))
);


--
-- Name: COLUMN letter_drafts.print_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.letter_drafts.print_status IS 'Print pipeline state: none (not queued), pending (in the Print-queue page), printed (stamped printed_at/printed_by; submission is then recorded by fileComplaint on the complaint itself).';


--
-- Name: letter_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.letter_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    complaint_id uuid,
    document_id uuid,
    letter_kind text,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    intended_to text[] DEFAULT '{}'::text[] NOT NULL,
    intended_cc text[] DEFAULT '{}'::text[] NOT NULL,
    redirected boolean DEFAULT false NOT NULL,
    officer_id uuid,
    subject text,
    body text,
    attachment_name text,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    message_id text,
    mail_mode text,
    sent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    job_id uuid,
    recipients jsonb,
    CONSTRAINT letter_emails_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text DEFAULT 'info'::text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    entity_type text,
    entity_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'In-app alerts inbox; every finished/automated job drops a message here.';


--
-- Name: ocr_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ocr_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    status text DEFAULT 'Queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: officer_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.officer_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    officer_id uuid NOT NULL,
    prev_corporation text,
    prev_division text,
    prev_subdivision text,
    prev_ward text,
    new_corporation text,
    new_division text,
    new_subdivision text,
    new_ward text,
    transfer_order_no text,
    transfer_order_date date,
    effective_date date,
    source_document text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: photo_match_verdicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.photo_match_verdicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_a uuid NOT NULL,
    doc_b uuid NOT NULL,
    basis text DEFAULT 'visual'::text NOT NULL,
    verdict text NOT NULL,
    confidence text,
    shared_details text,
    model text,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    email text,
    role text DEFAULT 'VIEWER'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'EDITOR'::text, 'VERIFIER'::text, 'VIEWER'::text, 'RTI_MANAGER'::text, 'COMPLAINT_MANAGER'::text, 'FIELD_OFFICER'::text])))
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    title text NOT NULL,
    description text,
    due_date date,
    due_time time without time zone,
    priority text DEFAULT 'Medium'::text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    repeat text DEFAULT 'None'::text NOT NULL,
    channels text[] DEFAULT '{}'::text[] NOT NULL,
    assigned_to uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_type text,
    CONSTRAINT reminders_entity_type_check CHECK ((entity_type = ANY (ARRAY['rti'::text, 'complaint'::text, 'officer'::text, 'appeal'::text, 'hearing'::text, 'general'::text]))),
    CONSTRAINT reminders_repeat_check CHECK ((repeat = ANY (ARRAY['None'::text, 'Daily'::text, 'Weekly'::text, 'Monthly'::text, 'Custom'::text]))),
    CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Snoozed'::text, 'Completed'::text, 'Cancelled'::text])))
);


--
-- Name: rti_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rti_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    internal_ref text,
    applicant_name text,
    applicant_address text,
    applicant_phone text,
    applicant_email text,
    public_authority text,
    department text,
    office_address text,
    pio_name text,
    pio_designation text,
    pio_phone text,
    pio_email text,
    faa_name text,
    faa_designation text,
    faa_phone text,
    faa_email text,
    corporation_id uuid,
    division_id uuid,
    eng_subdivision_id uuid,
    ward_id uuid,
    contact_id uuid,
    subject text NOT NULL,
    info_requested text,
    category text,
    filing_mode text,
    application_fee_paid boolean DEFAULT false NOT NULL,
    fee_mode text,
    postal_receipt_no text,
    online_reg_no text,
    date_drafted date,
    date_filed date,
    date_received date,
    is_life_liberty boolean DEFAULT false NOT NULL,
    normal_due date,
    life_liberty_due date,
    first_appeal_due date,
    second_appeal_due date,
    status text DEFAULT 'Draft'::text NOT NULL,
    reply_summary text,
    reply_date date,
    reply_attachment text,
    satisfaction_status text,
    next_action text,
    next_action_date date,
    reminder_enabled boolean DEFAULT false NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    internal_notes text,
    public_notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ward_type text DEFAULT 'BBMP'::text NOT NULL,
    gba_ward_id uuid,
    gba_division text,
    gba_subdivision text,
    ack_image_path text,
    ack_status text DEFAULT 'Not Uploaded'::text NOT NULL,
    ack_file_metadata jsonb,
    ack_ocr_text text,
    ack_ocr_confidence integer,
    ack_document_type text,
    ack_visual_elements jsonb DEFAULT '[]'::jsonb NOT NULL,
    ack_extracted_info jsonb,
    ack_verification_summary text,
    ack_confidence_score integer,
    ack_recommended_action text,
    ack_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    ack_archive jsonb DEFAULT '[]'::jsonb NOT NULL,
    job_number text,
    CONSTRAINT rti_applications_ward_type_check CHECK ((ward_type = ANY (ARRAY['BBMP'::text, 'GBA'::text])))
);


--
-- Name: rti_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rti_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rti_id uuid NOT NULL,
    doc_type text DEFAULT 'Other'::text NOT NULL,
    title text,
    pdf_path text NOT NULL,
    page_count integer DEFAULT 1 NOT NULL,
    file_size integer,
    source text,
    doc_date date,
    ocr_text text,
    ocr_confidence integer,
    ocr_status text DEFAULT 'Pending'::text NOT NULL,
    ai_summary text,
    ai_extracted jsonb,
    ai_status text DEFAULT 'Pending'::text NOT NULL,
    uploaded_by uuid,
    uploader_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rti_first_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rti_first_appeals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rti_id uuid NOT NULL,
    faa_name text,
    faa_designation text,
    faa_phone text,
    faa_email text,
    grounds text[] DEFAULT '{}'::text[] NOT NULL,
    grounds_detail text,
    date_drafted date,
    date_filed date,
    faa_order_due date,
    faa_order_date date,
    decision_summary text,
    status text DEFAULT 'Draft'::text NOT NULL,
    attachments text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rti_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rti_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'Processing'::text NOT NULL,
    storage_path text NOT NULL,
    page_count integer,
    letters jsonb,
    created_case_ids jsonb,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rti_second_appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rti_second_appeals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rti_id uuid NOT NULL,
    first_appeal_id uuid,
    commission_name text,
    reason text[] DEFAULT '{}'::text[] NOT NULL,
    reason_detail text,
    filing_date date,
    diary_number text,
    hearing_date date,
    hearing_status text,
    order_date date,
    order_summary text,
    compliance_due_date date,
    compliance_status text,
    status text DEFAULT 'Draft'::text NOT NULL,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: search_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    query_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    searched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: source_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    file_name text,
    document_type text,
    date date,
    url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sr_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sr_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sr_code text,
    description text NOT NULL,
    unit text,
    rate numeric NOT NULL,
    sr_year text,
    region text,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    kind text,
    category text,
    department text,
    legal_tone text,
    language text,
    body text,
    default_questions text[] DEFAULT '{}'::text[] NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT templates_language_check CHECK ((language = ANY (ARRAY['English'::text, 'Kannada'::text, 'Bilingual'::text]))),
    CONSTRAINT templates_legal_tone_check CHECK ((legal_tone = ANY (ARRAY['Simple'::text, 'Strong'::text, 'Formal'::text, 'Investigative'::text])))
);


--
-- Name: translation_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.translation_cache (
    source_hash text NOT NULL,
    target_lang text DEFAULT 'en'::text NOT NULL,
    translated_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    status text,
    note text,
    verified_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    new_no integer NOT NULL,
    new_name text NOT NULL,
    property_count integer,
    zone text,
    assembly_constituency text,
    old_subdiv text,
    old_wards text[] DEFAULT '{}'::text[] NOT NULL,
    division_id uuid,
    eng_subdivision_id uuid,
    derived_corporation_id uuid,
    derived_normalised boolean DEFAULT false NOT NULL,
    source text,
    source_page text,
    verification_status text DEFAULT 'PENDING'::text NOT NULL,
    confidence_score text DEFAULT 'MEDIUM'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wards_confidence_score_check CHECK ((confidence_score = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text]))),
    CONSTRAINT wards_verification_status_check CHECK ((verification_status = ANY (ARRAY['VERIFIED'::text, 'PENDING'::text, 'NEEDS_CORRECTION'::text, 'RETIRED_TRANSFERRED'::text, 'UNKNOWN'::text])))
);


--
-- Name: work_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_id uuid NOT NULL,
    source_id text NOT NULL,
    source_name text NOT NULL,
    source_url text,
    document_name text,
    reference_number text,
    page_number integer,
    field_snapshot jsonb,
    is_official boolean DEFAULT true NOT NULL,
    accessed_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ack_import_batches ack_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_batches
    ADD CONSTRAINT ack_import_batches_pkey PRIMARY KEY (id);


--
-- Name: ack_import_items ack_import_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_items
    ADD CONSTRAINT ack_import_items_pkey PRIMARY KEY (id);


--
-- Name: ai_drafts ai_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_drafts
    ADD CONSTRAINT ai_drafts_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_intakes audit_intakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_intakes
    ADD CONSTRAINT audit_intakes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: background_jobs background_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);


--
-- Name: bbmp_works bbmp_works_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbmp_works
    ADD CONSTRAINT bbmp_works_pkey PRIMARY KEY (id);


--
-- Name: bill_audits bill_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_audits
    ADD CONSTRAINT bill_audits_pkey PRIMARY KEY (id);


--
-- Name: case_intelligence case_intelligence_complaint_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_intelligence
    ADD CONSTRAINT case_intelligence_complaint_id_key UNIQUE (complaint_id);


--
-- Name: case_intelligence case_intelligence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_intelligence
    ADD CONSTRAINT case_intelligence_pkey PRIMARY KEY (id);


--
-- Name: communication_logs communication_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_logs
    ADD CONSTRAINT communication_logs_pkey PRIMARY KEY (id);


--
-- Name: complaint_action_taken complaint_action_taken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_action_taken
    ADD CONSTRAINT complaint_action_taken_pkey PRIMARY KEY (id);


--
-- Name: complaint_ai_recommendations complaint_ai_recommendations_complaint_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_ai_recommendations
    ADD CONSTRAINT complaint_ai_recommendations_complaint_id_key UNIQUE (complaint_id);


--
-- Name: complaint_ai_recommendations complaint_ai_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_ai_recommendations
    ADD CONSTRAINT complaint_ai_recommendations_pkey PRIMARY KEY (id);


--
-- Name: complaint_counters complaint_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_counters
    ADD CONSTRAINT complaint_counters_pkey PRIMARY KEY (prefix, year);


--
-- Name: complaint_cycle_events complaint_cycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_cycle_events
    ADD CONSTRAINT complaint_cycle_events_pkey PRIMARY KEY (id);


--
-- Name: complaint_documents complaint_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_documents
    ADD CONSTRAINT complaint_documents_pkey PRIMARY KEY (id);


--
-- Name: complaint_replies complaint_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_replies
    ADD CONSTRAINT complaint_replies_pkey PRIMARY KEY (id);


--
-- Name: complaint_timeline complaint_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_timeline
    ADD CONSTRAINT complaint_timeline_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: contact_jurisdictions contact_jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_jurisdictions
    ADD CONSTRAINT contact_jurisdictions_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: corporations corporations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporations
    ADD CONSTRAINT corporations_code_key UNIQUE (code);


--
-- Name: corporations corporations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporations
    ADD CONSTRAINT corporations_pkey PRIMARY KEY (id);


--
-- Name: divisions divisions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_name_key UNIQUE (name);


--
-- Name: divisions divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_pkey PRIMARY KEY (id);


--
-- Name: eng_subdivisions eng_subdivisions_name_division_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eng_subdivisions
    ADD CONSTRAINT eng_subdivisions_name_division_id_key UNIQUE (name, division_id);


--
-- Name: eng_subdivisions eng_subdivisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eng_subdivisions
    ADD CONSTRAINT eng_subdivisions_pkey PRIMARY KEY (id);


--
-- Name: escalation_flow_configs escalation_flow_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalation_flow_configs
    ADD CONSTRAINT escalation_flow_configs_pkey PRIMARY KEY (id);


--
-- Name: escalation_flow_configs escalation_flow_configs_stage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalation_flow_configs
    ADD CONSTRAINT escalation_flow_configs_stage_key_key UNIQUE (stage_key);


--
-- Name: escalation_logs escalation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalation_logs
    ADD CONSTRAINT escalation_logs_pkey PRIMARY KEY (id);


--
-- Name: finding_review finding_review_job_number_finding_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finding_review
    ADD CONSTRAINT finding_review_job_number_finding_code_key UNIQUE (job_number, finding_code);


--
-- Name: finding_review finding_review_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finding_review
    ADD CONSTRAINT finding_review_pkey PRIMARY KEY (id);


--
-- Name: follow_up_actions follow_up_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_actions
    ADD CONSTRAINT follow_up_actions_pkey PRIMARY KEY (id);


--
-- Name: forensic_import_batches forensic_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_import_batches
    ADD CONSTRAINT forensic_import_batches_pkey PRIMARY KEY (id);


--
-- Name: gba_wards gba_wards_corporation_code_ward_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gba_wards
    ADD CONSTRAINT gba_wards_corporation_code_ward_no_key UNIQUE (corporation_code, ward_no);


--
-- Name: gba_wards gba_wards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gba_wards
    ADD CONSTRAINT gba_wards_pkey PRIMARY KEY (id);


--
-- Name: hearings hearings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_pkey PRIMARY KEY (id);


--
-- Name: import_logs import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);


--
-- Name: import_uploads import_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_uploads
    ADD CONSTRAINT import_uploads_pkey PRIMARY KEY (id);


--
-- Name: job_audits job_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_audits
    ADD CONSTRAINT job_audits_pkey PRIMARY KEY (id);


--
-- Name: job_cases job_cases_job_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_cases
    ADD CONSTRAINT job_cases_job_number_key UNIQUE (job_number);


--
-- Name: job_cases job_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_cases
    ADD CONSTRAINT job_cases_pkey PRIMARY KEY (id);


--
-- Name: job_documents job_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_documents
    ADD CONSTRAINT job_documents_pkey PRIMARY KEY (id);


--
-- Name: job_download_runs job_download_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_download_runs
    ADD CONSTRAINT job_download_runs_pkey PRIMARY KEY (id);


--
-- Name: job_eligibility job_eligibility_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_eligibility
    ADD CONSTRAINT job_eligibility_pkey PRIMARY KEY (id);


--
-- Name: job_insurance job_insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_insurance
    ADD CONSTRAINT job_insurance_pkey PRIMARY KEY (id);


--
-- Name: job_running_bills job_running_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_running_bills
    ADD CONSTRAINT job_running_bills_pkey PRIMARY KEY (id);


--
-- Name: job_timeline_dates job_timeline_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_timeline_dates
    ADD CONSTRAINT job_timeline_dates_pkey PRIMARY KEY (id);


--
-- Name: letter_drafts letter_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_drafts
    ADD CONSTRAINT letter_drafts_pkey PRIMARY KEY (id);


--
-- Name: letter_emails letter_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: ocr_jobs ocr_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_jobs
    ADD CONSTRAINT ocr_jobs_pkey PRIMARY KEY (id);


--
-- Name: officer_transfers officer_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.officer_transfers
    ADD CONSTRAINT officer_transfers_pkey PRIMARY KEY (id);


--
-- Name: photo_match_verdicts photo_match_verdicts_doc_a_doc_b_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_match_verdicts
    ADD CONSTRAINT photo_match_verdicts_doc_a_doc_b_key UNIQUE (doc_a, doc_b);


--
-- Name: photo_match_verdicts photo_match_verdicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_match_verdicts
    ADD CONSTRAINT photo_match_verdicts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: rti_applications rti_applications_internal_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_internal_ref_key UNIQUE (internal_ref);


--
-- Name: rti_applications rti_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_pkey PRIMARY KEY (id);


--
-- Name: rti_documents rti_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_documents
    ADD CONSTRAINT rti_documents_pkey PRIMARY KEY (id);


--
-- Name: rti_first_appeals rti_first_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_first_appeals
    ADD CONSTRAINT rti_first_appeals_pkey PRIMARY KEY (id);


--
-- Name: rti_import_batches rti_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_import_batches
    ADD CONSTRAINT rti_import_batches_pkey PRIMARY KEY (id);


--
-- Name: rti_second_appeals rti_second_appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_second_appeals
    ADD CONSTRAINT rti_second_appeals_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: search_history search_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_history
    ADD CONSTRAINT search_history_pkey PRIMARY KEY (id);


--
-- Name: source_documents source_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_documents
    ADD CONSTRAINT source_documents_pkey PRIMARY KEY (id);


--
-- Name: sr_rates sr_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sr_rates
    ADD CONSTRAINT sr_rates_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: translation_cache translation_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translation_cache
    ADD CONSTRAINT translation_cache_pkey PRIMARY KEY (source_hash);


--
-- Name: verification_logs verification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_logs
    ADD CONSTRAINT verification_logs_pkey PRIMARY KEY (id);


--
-- Name: wards wards_new_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_new_no_key UNIQUE (new_no);


--
-- Name: wards wards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_pkey PRIMARY KEY (id);


--
-- Name: work_sources work_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_sources
    ADD CONSTRAINT work_sources_pkey PRIMARY KEY (id);


--
-- Name: complaints_internal_case_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX complaints_internal_case_number_key ON public.complaints USING btree (internal_case_number) WHERE (internal_case_number IS NOT NULL);


--
-- Name: gba_wards_corp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gba_wards_corp_idx ON public.gba_wards USING btree (corporation_code);


--
-- Name: gba_wards_division_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gba_wards_division_idx ON public.gba_wards USING btree (corporation_code, division);


--
-- Name: idx_ack_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ack_batches_status ON public.ack_import_batches USING btree (status, created_at);


--
-- Name: idx_ack_batches_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ack_batches_user_created ON public.ack_import_batches USING btree (created_by, created_at DESC);


--
-- Name: idx_ack_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ack_items_batch ON public.ack_import_items USING btree (batch_id, sort_order);


--
-- Name: idx_ack_items_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ack_items_decision ON public.ack_import_items USING btree (batch_id, decision);


--
-- Name: idx_ai_drafts_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_drafts_entity_created ON public.ai_drafts USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: idx_ai_reco_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_reco_action ON public.complaint_ai_recommendations USING btree (recommendation_action);


--
-- Name: idx_ai_reco_risk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_reco_risk ON public.complaint_ai_recommendations USING btree (risk_level, health_score);


--
-- Name: idx_ai_reco_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_reco_status ON public.complaint_ai_recommendations USING btree (analysis_status);


--
-- Name: idx_aidrafts_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aidrafts_entity ON public.ai_drafts USING btree (entity_type, entity_id);


--
-- Name: idx_attach_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attach_entity ON public.attachments USING btree (entity_type, entity_id);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_intakes_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_intakes_entity ON public.audit_intakes USING btree (entity_type, entity_id);


--
-- Name: idx_audit_intakes_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_intakes_job ON public.audit_intakes USING btree (job_number);


--
-- Name: idx_bbmp_works_contractor_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_contractor_trgm ON public.bbmp_works USING gin (contractor_name public.gin_trgm_ops);


--
-- Name: idx_bbmp_works_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_created ON public.bbmp_works USING btree (created_at DESC);


--
-- Name: idx_bbmp_works_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_division ON public.bbmp_works USING btree (division_name);


--
-- Name: idx_bbmp_works_engineer_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_engineer_trgm ON public.bbmp_works USING gin (engineer_name public.gin_trgm_ops);


--
-- Name: idx_bbmp_works_job_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_job_case ON public.bbmp_works USING btree (job_case_id);


--
-- Name: idx_bbmp_works_location_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_location_trgm ON public.bbmp_works USING gin (location_description public.gin_trgm_ops);


--
-- Name: idx_bbmp_works_sub_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_sub_division ON public.bbmp_works USING btree (sub_division_name);


--
-- Name: idx_bbmp_works_tender_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_tender_number ON public.bbmp_works USING btree (tender_number);


--
-- Name: idx_bbmp_works_ward_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_ward_name_trgm ON public.bbmp_works USING gin (ward_name public.gin_trgm_ops);


--
-- Name: idx_bbmp_works_ward_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_ward_number ON public.bbmp_works USING btree (ward_number);


--
-- Name: idx_bbmp_works_work_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_work_name_trgm ON public.bbmp_works USING gin (work_name public.gin_trgm_ops);


--
-- Name: idx_bbmp_works_work_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_work_number ON public.bbmp_works USING btree (work_number);


--
-- Name: idx_bbmp_works_work_order_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_work_order_number ON public.bbmp_works USING btree (work_order_number);


--
-- Name: idx_bbmp_works_zone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bbmp_works_zone ON public.bbmp_works USING btree (zone);


--
-- Name: idx_bg_jobs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_created ON public.background_jobs USING btree (created_at DESC);


--
-- Name: idx_bg_jobs_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bg_jobs_dedupe ON public.background_jobs USING btree (type, entity_type, entity_id) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: idx_bg_jobs_retry_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_retry_due ON public.background_jobs USING btree (next_retry_at) WHERE (status = 'retrying'::text);


--
-- Name: idx_bg_jobs_running_stale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_running_stale ON public.background_jobs USING btree (status, updated_at) WHERE (status = 'running'::text);


--
-- Name: idx_bg_jobs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_user_created ON public.background_jobs USING btree (created_by, created_at DESC);


--
-- Name: idx_bg_jobs_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_user_status ON public.background_jobs USING btree (created_by, status);


--
-- Name: idx_bill_audits_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_audits_complaint ON public.bill_audits USING btree (complaint_id);


--
-- Name: idx_bill_audits_total; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_audits_total ON public.bill_audits USING btree (grand_total) WHERE (grand_total IS NOT NULL);


--
-- Name: idx_cact_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cact_complaint ON public.complaint_action_taken USING btree (complaint_id);


--
-- Name: idx_cact_complaint_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cact_complaint_created ON public.complaint_action_taken USING btree (complaint_id, created_at DESC);


--
-- Name: idx_case_intel_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_case_intel_hash ON public.case_intelligence USING btree (context_hash);


--
-- Name: idx_case_intel_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_case_intel_status ON public.case_intelligence USING btree (build_status);


--
-- Name: idx_cdoc_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_complaint ON public.complaint_documents USING btree (complaint_id);


--
-- Name: idx_cdoc_complaint_uploaded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_complaint_uploaded ON public.complaint_documents USING btree (complaint_id, uploaded_at DESC);


--
-- Name: idx_cdoc_dhash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_dhash ON public.complaint_documents USING btree (dhash) WHERE (dhash IS NOT NULL);


--
-- Name: idx_cdoc_dupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_dupe ON public.complaint_documents USING btree (is_duplicate) WHERE is_duplicate;


--
-- Name: idx_cdoc_geo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_geo ON public.complaint_documents USING btree (geo_flag) WHERE (geo_flag IS NOT NULL);


--
-- Name: idx_cdoc_gps; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_gps ON public.complaint_documents USING btree (exif_gps_lat, exif_gps_lon) WHERE (exif_gps_lat IS NOT NULL);


--
-- Name: idx_cdoc_ocr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_ocr_status ON public.complaint_documents USING btree (ocr_status);


--
-- Name: idx_cdoc_phash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_phash ON public.complaint_documents USING btree (phash) WHERE (phash IS NOT NULL);


--
-- Name: idx_cdoc_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_sha256 ON public.complaint_documents USING btree (file_sha256) WHERE (file_sha256 IS NOT NULL);


--
-- Name: idx_cdoc_verif; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_verif ON public.complaint_documents USING btree (verification_status);


--
-- Name: idx_cdoc_vision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cdoc_vision ON public.complaint_documents USING btree (vision_verdict) WHERE (vision_verdict IS NOT NULL);


--
-- Name: idx_comm_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comm_entity ON public.communication_logs USING btree (entity_type, entity_id);


--
-- Name: idx_complaint_documents_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaint_documents_parent ON public.complaint_documents USING btree (parent_document_id) WHERE (parent_document_id IS NOT NULL);


--
-- Name: idx_complaint_documents_summary_generating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaint_documents_summary_generating ON public.complaint_documents USING btree (complaint_id) WHERE (ai_summary_status = 'generating'::text);


--
-- Name: idx_complaints_contractor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_contractor ON public.complaints USING btree (contractor) WHERE (contractor IS NOT NULL);


--
-- Name: idx_complaints_corp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_corp ON public.complaints USING btree (corporation_id);


--
-- Name: idx_complaints_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_deleted ON public.complaints USING btree (deleted_at);


--
-- Name: idx_complaints_deleted_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_deleted_updated ON public.complaints USING btree (deleted_at, updated_at DESC);


--
-- Name: idx_complaints_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_division ON public.complaints USING btree (division_id);


--
-- Name: idx_complaints_engineer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_engineer ON public.complaints USING btree (assigned_engineer_id);


--
-- Name: idx_complaints_escalation_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_escalation_deadline ON public.complaints USING btree (escalation_stage_deadline) WHERE (escalation_stage = ANY (ARRAY['awaiting_reply'::text, 'reminder_sent'::text, 'legal_notice_sent'::text]));


--
-- Name: idx_complaints_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_followup ON public.complaints USING btree (next_follow_up_date);


--
-- Name: idx_complaints_job_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_job_number ON public.complaints USING btree (job_number) WHERE (job_number IS NOT NULL);


--
-- Name: idx_complaints_officer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_officer ON public.complaints USING btree (assigned_officer_id);


--
-- Name: idx_complaints_status2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_status2 ON public.complaints USING btree (status);


--
-- Name: idx_complaints_ward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_ward ON public.complaints USING btree (ward_id);


--
-- Name: idx_contact_jur_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_jur_contact ON public.contact_jurisdictions USING btree (contact_id);


--
-- Name: idx_contact_jur_ward_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_jur_ward_id ON public.contact_jurisdictions USING btree (ward_id) WHERE (ward_id IS NOT NULL);


--
-- Name: idx_contact_jur_ward_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_jur_ward_no ON public.contact_jurisdictions USING btree (ward_no);


--
-- Name: idx_contacts_corp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_corp ON public.contacts USING btree (corporation_id);


--
-- Name: idx_contacts_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_division ON public.contacts USING btree (division_id);


--
-- Name: idx_contacts_reporting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_reporting ON public.contacts USING btree (reporting_officer_id);


--
-- Name: idx_contacts_subdiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_subdiv ON public.contacts USING btree (eng_subdivision_id);


--
-- Name: idx_contacts_verification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_verification ON public.contacts USING btree (verification_status);


--
-- Name: idx_creply_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creply_complaint ON public.complaint_replies USING btree (complaint_id);


--
-- Name: idx_creply_complaint_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creply_complaint_created ON public.complaint_replies USING btree (complaint_id, created_at DESC);


--
-- Name: idx_ctl_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ctl_complaint ON public.complaint_timeline USING btree (complaint_id, event_date DESC);


--
-- Name: idx_cycle_events_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cycle_events_complaint ON public.complaint_cycle_events USING btree (complaint_id, round, created_at);


--
-- Name: idx_cycle_events_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cycle_events_dedupe ON public.complaint_cycle_events USING btree (complaint_id, round, event);


--
-- Name: idx_divisions_corp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_divisions_corp ON public.divisions USING btree (corporation_id);


--
-- Name: idx_escal_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escal_entity ON public.escalation_logs USING btree (entity_type, entity_id);


--
-- Name: idx_escalation_logs_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalation_logs_entity_created ON public.escalation_logs USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: idx_finding_review_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finding_review_job ON public.finding_review USING btree (job_number);


--
-- Name: idx_first_appeal_rti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_first_appeal_rti ON public.rti_first_appeals USING btree (rti_id);


--
-- Name: idx_followups_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_entity ON public.follow_up_actions USING btree (entity_type, entity_id);


--
-- Name: idx_forensic_import_batches_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_import_batches_created ON public.forensic_import_batches USING btree (created_at DESC);


--
-- Name: idx_forensic_import_batches_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_import_batches_creator ON public.forensic_import_batches USING btree (created_by);


--
-- Name: idx_forensic_import_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forensic_import_batches_status ON public.forensic_import_batches USING btree (status);


--
-- Name: idx_import_uploads_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_uploads_queue ON public.import_uploads USING btree (status, created_at);


--
-- Name: idx_import_uploads_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_uploads_user_created ON public.import_uploads USING btree (created_by, created_at DESC);


--
-- Name: idx_import_uploads_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_uploads_user_status ON public.import_uploads USING btree (created_by, status);


--
-- Name: idx_jdoc_dhash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jdoc_dhash ON public.job_documents USING btree (dhash) WHERE (dhash IS NOT NULL);


--
-- Name: idx_jdoc_dupe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jdoc_dupe ON public.job_documents USING btree (is_duplicate) WHERE is_duplicate;


--
-- Name: idx_jdoc_gps; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jdoc_gps ON public.job_documents USING btree (exif_gps_lat, exif_gps_lon) WHERE (exif_gps_lat IS NOT NULL);


--
-- Name: idx_jdoc_phash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jdoc_phash ON public.job_documents USING btree (phash) WHERE (phash IS NOT NULL);


--
-- Name: idx_jdoc_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jdoc_sha256 ON public.job_documents USING btree (file_sha256) WHERE (file_sha256 IS NOT NULL);


--
-- Name: idx_jelig_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jelig_job ON public.job_eligibility USING btree (job_number);


--
-- Name: idx_jins_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jins_job ON public.job_insurance USING btree (job_number);


--
-- Name: idx_job_audits_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_audits_created ON public.job_audits USING btree (created_at DESC);


--
-- Name: idx_job_audits_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_audits_job ON public.job_audits USING btree (job_number);


--
-- Name: idx_job_audits_job_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_audits_job_created ON public.job_audits USING btree (job_number, created_at DESC);


--
-- Name: idx_job_audits_risk_band; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_audits_risk_band ON public.job_audits USING btree (risk_band) WHERE (risk_band IS NOT NULL);


--
-- Name: idx_job_cases_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_cases_created ON public.job_cases USING btree (created_at DESC);


--
-- Name: idx_job_cases_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_cases_division ON public.job_cases USING btree (division) WHERE (division IS NOT NULL);


--
-- Name: idx_job_cases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_cases_status ON public.job_cases USING btree (status);


--
-- Name: idx_job_documents_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_documents_case ON public.job_documents USING btree (job_case_id);


--
-- Name: idx_job_documents_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_documents_job ON public.job_documents USING btree (job_number);


--
-- Name: idx_job_documents_ocr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_documents_ocr ON public.job_documents USING btree (ocr_status);


--
-- Name: idx_job_download_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_download_runs_created ON public.job_download_runs USING btree (created_at DESC);


--
-- Name: idx_jrb_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jrb_job ON public.job_running_bills USING btree (job_number);


--
-- Name: idx_jtd_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jtd_job ON public.job_timeline_dates USING btree (job_number);


--
-- Name: idx_letter_drafts_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_drafts_complaint ON public.letter_drafts USING btree (complaint_id, created_at DESC) WHERE (complaint_id IS NOT NULL);


--
-- Name: idx_letter_drafts_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_drafts_job ON public.letter_drafts USING btree (job_number);


--
-- Name: idx_letter_drafts_job_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_drafts_job_created ON public.letter_drafts USING btree (job_number, created_at DESC);


--
-- Name: idx_letter_drafts_print_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_drafts_print_pending ON public.letter_drafts USING btree (print_status, created_at) WHERE (print_status = ANY (ARRAY['pending'::text, 'printed'::text]));


--
-- Name: idx_letter_emails_complaint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_emails_complaint ON public.letter_emails USING btree (complaint_id, created_at DESC);


--
-- Name: idx_letter_emails_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letter_emails_status ON public.letter_emails USING btree (status) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text, 'failed'::text]));


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, read_at, created_at DESC);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_ocrjobs_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocrjobs_document ON public.ocr_jobs USING btree (document_id);


--
-- Name: idx_ocrjobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocrjobs_status ON public.ocr_jobs USING btree (status);


--
-- Name: idx_photo_verdicts_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_verdicts_a ON public.photo_match_verdicts USING btree (doc_a);


--
-- Name: idx_photo_verdicts_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_photo_verdicts_b ON public.photo_match_verdicts USING btree (doc_b);


--
-- Name: idx_reminders_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_due ON public.reminders USING btree (due_date);


--
-- Name: idx_reminders_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_entity ON public.reminders USING btree (entity_type, entity_id);


--
-- Name: idx_rti_corp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_corp ON public.rti_applications USING btree (corporation_id);


--
-- Name: idx_rti_documents_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_documents_created ON public.rti_documents USING btree (created_at DESC);


--
-- Name: idx_rti_documents_rti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_documents_rti ON public.rti_documents USING btree (rti_id);


--
-- Name: idx_rti_documents_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_documents_type ON public.rti_documents USING btree (doc_type);


--
-- Name: idx_rti_import_batches_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_import_batches_created ON public.rti_import_batches USING btree (created_at DESC);


--
-- Name: idx_rti_import_batches_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_import_batches_creator ON public.rti_import_batches USING btree (created_by);


--
-- Name: idx_rti_import_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_import_batches_status ON public.rti_import_batches USING btree (status);


--
-- Name: idx_rti_job_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_job_number ON public.rti_applications USING btree (job_number) WHERE (job_number IS NOT NULL);


--
-- Name: idx_rti_normal_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_normal_due ON public.rti_applications USING btree (normal_due);


--
-- Name: idx_rti_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_priority ON public.rti_applications USING btree (priority);


--
-- Name: idx_rti_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_status ON public.rti_applications USING btree (status);


--
-- Name: idx_rti_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_updated ON public.rti_applications USING btree (updated_at DESC);


--
-- Name: idx_rti_ward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rti_ward ON public.rti_applications USING btree (ward_id);


--
-- Name: idx_search_history_searched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_history_searched ON public.search_history USING btree (searched_at DESC);


--
-- Name: idx_second_appeal_rti; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_second_appeal_rti ON public.rti_second_appeals USING btree (rti_id);


--
-- Name: idx_sr_rates_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sr_rates_code ON public.sr_rates USING btree (sr_code) WHERE (sr_code IS NOT NULL);


--
-- Name: idx_subdiv_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subdiv_division ON public.eng_subdivisions USING btree (division_id);


--
-- Name: idx_templates_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_kind ON public.templates USING btree (kind);


--
-- Name: idx_transfers_officer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_officer ON public.officer_transfers USING btree (officer_id);


--
-- Name: idx_wards_ac; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_ac ON public.wards USING btree (assembly_constituency);


--
-- Name: idx_wards_corp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_corp ON public.wards USING btree (derived_corporation_id);


--
-- Name: idx_wards_division; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_division ON public.wards USING btree (division_id);


--
-- Name: idx_wards_subdiv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wards_subdiv ON public.wards USING btree (eng_subdivision_id);


--
-- Name: idx_work_sources_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_sources_source_id ON public.work_sources USING btree (source_id);


--
-- Name: idx_work_sources_work; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_sources_work ON public.work_sources USING btree (work_id);


--
-- Name: uq_bbmp_works_job_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_bbmp_works_job_number ON public.bbmp_works USING btree (job_number) WHERE (job_number IS NOT NULL);


--
-- Name: uq_contact_jur_contact_ward; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_contact_jur_contact_ward ON public.contact_jurisdictions USING btree (contact_id, ward_no);


--
-- Name: uq_job_documents_job_file; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_job_documents_job_file ON public.job_documents USING btree (job_number, original_file_name);


--
-- Name: uq_letter_emails_job_complaint_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_letter_emails_job_complaint_sent ON public.letter_emails USING btree (job_id, complaint_id) WHERE ((job_id IS NOT NULL) AND (status = 'sent'::text));


--
-- Name: ack_import_batches set_ack_batches_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ack_batches_updated BEFORE UPDATE ON public.ack_import_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ack_import_items set_ack_items_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ack_items_updated BEFORE UPDATE ON public.ack_import_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: complaint_ai_recommendations set_ai_reco_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ai_reco_updated BEFORE UPDATE ON public.complaint_ai_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: background_jobs set_bg_jobs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_bg_jobs_updated BEFORE UPDATE ON public.background_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: case_intelligence set_case_intel_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_case_intel_updated BEFORE UPDATE ON public.case_intelligence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: escalation_flow_configs set_escalation_flow_configs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_escalation_flow_configs_updated BEFORE UPDATE ON public.escalation_flow_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: import_uploads set_import_uploads_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_import_uploads_updated BEFORE UPDATE ON public.import_uploads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_intakes trg_audit_intakes_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_intakes_updated BEFORE UPDATE ON public.audit_intakes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bbmp_works trg_bbmp_works_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bbmp_works_updated BEFORE UPDATE ON public.bbmp_works FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: bill_audits trg_bill_audits_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bill_audits_updated BEFORE UPDATE ON public.bill_audits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: finding_review trg_finding_review_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_finding_review_updated BEFORE UPDATE ON public.finding_review FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: job_audits trg_job_audits_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_audits_updated BEFORE UPDATE ON public.job_audits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: job_cases trg_job_cases_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_cases_updated BEFORE UPDATE ON public.job_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: job_documents trg_job_documents_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_documents_updated BEFORE UPDATE ON public.job_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: job_download_runs trg_job_download_runs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_download_runs_updated BEFORE UPDATE ON public.job_download_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: letter_drafts trg_letter_drafts_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_letter_drafts_updated BEFORE UPDATE ON public.letter_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: complaint_action_taken trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.complaint_action_taken FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: complaint_documents trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.complaint_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: complaint_replies trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.complaint_replies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: complaints trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: contacts trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: forensic_import_batches trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.forensic_import_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ocr_jobs trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.ocr_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reminders trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rti_applications trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.rti_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rti_documents trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.rti_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rti_first_appeals trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.rti_first_appeals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rti_import_batches trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.rti_import_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: rti_second_appeals trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.rti_second_appeals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: templates trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wards trg_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.wards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ack_import_batches ack_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_batches
    ADD CONSTRAINT ack_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: ack_import_items ack_import_items_assigned_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_items
    ADD CONSTRAINT ack_import_items_assigned_complaint_id_fkey FOREIGN KEY (assigned_complaint_id) REFERENCES public.complaints(id) ON DELETE SET NULL;


--
-- Name: ack_import_items ack_import_items_attached_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_items
    ADD CONSTRAINT ack_import_items_attached_document_id_fkey FOREIGN KEY (attached_document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: ack_import_items ack_import_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_items
    ADD CONSTRAINT ack_import_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.ack_import_batches(id) ON DELETE CASCADE;


--
-- Name: ack_import_items ack_import_items_proposed_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ack_import_items
    ADD CONSTRAINT ack_import_items_proposed_complaint_id_fkey FOREIGN KEY (proposed_complaint_id) REFERENCES public.complaints(id) ON DELETE SET NULL;


--
-- Name: ai_drafts ai_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_drafts
    ADD CONSTRAINT ai_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: app_settings app_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: attachments attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_intakes audit_intakes_ai_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_intakes
    ADD CONSTRAINT audit_intakes_ai_draft_id_fkey FOREIGN KEY (ai_draft_id) REFERENCES public.ai_drafts(id) ON DELETE SET NULL;


--
-- Name: audit_intakes audit_intakes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_intakes
    ADD CONSTRAINT audit_intakes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: audit_intakes audit_intakes_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_intakes
    ADD CONSTRAINT audit_intakes_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: background_jobs background_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: bbmp_works bbmp_works_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbmp_works
    ADD CONSTRAINT bbmp_works_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: bbmp_works bbmp_works_job_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bbmp_works
    ADD CONSTRAINT bbmp_works_job_case_id_fkey FOREIGN KEY (job_case_id) REFERENCES public.job_cases(id) ON DELETE SET NULL;


--
-- Name: bill_audits bill_audits_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_audits
    ADD CONSTRAINT bill_audits_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: bill_audits bill_audits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_audits
    ADD CONSTRAINT bill_audits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: bill_audits bill_audits_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_audits
    ADD CONSTRAINT bill_audits_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: case_intelligence case_intelligence_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_intelligence
    ADD CONSTRAINT case_intelligence_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: communication_logs communication_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_logs
    ADD CONSTRAINT communication_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: communication_logs communication_logs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_logs
    ADD CONSTRAINT communication_logs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: communication_logs communication_logs_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_logs
    ADD CONSTRAINT communication_logs_officer_id_fkey FOREIGN KEY (officer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: complaint_action_taken complaint_action_taken_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_action_taken
    ADD CONSTRAINT complaint_action_taken_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_action_taken complaint_action_taken_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_action_taken
    ADD CONSTRAINT complaint_action_taken_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaint_action_taken complaint_action_taken_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_action_taken
    ADD CONSTRAINT complaint_action_taken_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: complaint_ai_recommendations complaint_ai_recommendations_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_ai_recommendations
    ADD CONSTRAINT complaint_ai_recommendations_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_ai_recommendations complaint_ai_recommendations_last_escalation_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_ai_recommendations
    ADD CONSTRAINT complaint_ai_recommendations_last_escalation_draft_id_fkey FOREIGN KEY (last_escalation_draft_id) REFERENCES public.ai_drafts(id) ON DELETE SET NULL;


--
-- Name: complaint_ai_recommendations complaint_ai_recommendations_last_reminder_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_ai_recommendations
    ADD CONSTRAINT complaint_ai_recommendations_last_reminder_draft_id_fkey FOREIGN KEY (last_reminder_draft_id) REFERENCES public.ai_drafts(id) ON DELETE SET NULL;


--
-- Name: complaint_cycle_events complaint_cycle_events_ai_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_cycle_events
    ADD CONSTRAINT complaint_cycle_events_ai_draft_id_fkey FOREIGN KEY (ai_draft_id) REFERENCES public.ai_drafts(id) ON DELETE SET NULL;


--
-- Name: complaint_cycle_events complaint_cycle_events_complaint_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_cycle_events
    ADD CONSTRAINT complaint_cycle_events_complaint_document_id_fkey FOREIGN KEY (complaint_document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: complaint_cycle_events complaint_cycle_events_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_cycle_events
    ADD CONSTRAINT complaint_cycle_events_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_cycle_events complaint_cycle_events_letter_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_cycle_events
    ADD CONSTRAINT complaint_cycle_events_letter_draft_id_fkey FOREIGN KEY (letter_draft_id) REFERENCES public.letter_drafts(id) ON DELETE SET NULL;


--
-- Name: complaint_documents complaint_documents_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_documents
    ADD CONSTRAINT complaint_documents_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_documents complaint_documents_parent_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_documents
    ADD CONSTRAINT complaint_documents_parent_document_id_fkey FOREIGN KEY (parent_document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: complaint_documents complaint_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_documents
    ADD CONSTRAINT complaint_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaint_documents complaint_documents_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_documents
    ADD CONSTRAINT complaint_documents_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaint_replies complaint_replies_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_replies
    ADD CONSTRAINT complaint_replies_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_replies complaint_replies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_replies
    ADD CONSTRAINT complaint_replies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaint_replies complaint_replies_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_replies
    ADD CONSTRAINT complaint_replies_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: complaint_timeline complaint_timeline_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_timeline
    ADD CONSTRAINT complaint_timeline_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_timeline complaint_timeline_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_timeline
    ADD CONSTRAINT complaint_timeline_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaint_timeline complaint_timeline_related_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_timeline
    ADD CONSTRAINT complaint_timeline_related_document_id_fkey FOREIGN KEY (related_document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: complaint_timeline complaint_timeline_related_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_timeline
    ADD CONSTRAINT complaint_timeline_related_officer_id_fkey FOREIGN KEY (related_officer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_assigned_engineer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_engineer_id_fkey FOREIGN KEY (assigned_engineer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_assigned_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_officer_id_fkey FOREIGN KEY (assigned_officer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_corporation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_corporation_id_fkey FOREIGN KEY (corporation_id) REFERENCES public.corporations(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_eng_subdivision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_eng_subdivision_id_fkey FOREIGN KEY (eng_subdivision_id) REFERENCES public.eng_subdivisions(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_gba_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_gba_ward_id_fkey FOREIGN KEY (gba_ward_id) REFERENCES public.gba_wards(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE SET NULL;


--
-- Name: contact_jurisdictions contact_jurisdictions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_jurisdictions
    ADD CONSTRAINT contact_jurisdictions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_jurisdictions contact_jurisdictions_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_jurisdictions
    ADD CONSTRAINT contact_jurisdictions_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_corporation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_corporation_id_fkey FOREIGN KEY (corporation_id) REFERENCES public.corporations(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_eng_subdivision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_eng_subdivision_id_fkey FOREIGN KEY (eng_subdivision_id) REFERENCES public.eng_subdivisions(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_reporting_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_reporting_officer_id_fkey FOREIGN KEY (reporting_officer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: divisions divisions_corporation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.divisions
    ADD CONSTRAINT divisions_corporation_id_fkey FOREIGN KEY (corporation_id) REFERENCES public.corporations(id) ON DELETE SET NULL;


--
-- Name: eng_subdivisions eng_subdivisions_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eng_subdivisions
    ADD CONSTRAINT eng_subdivisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: escalation_logs escalation_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalation_logs
    ADD CONSTRAINT escalation_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: finding_review finding_review_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finding_review
    ADD CONSTRAINT finding_review_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: follow_up_actions follow_up_actions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_actions
    ADD CONSTRAINT follow_up_actions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: forensic_import_batches forensic_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forensic_import_batches
    ADD CONSTRAINT forensic_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: hearings hearings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hearings
    ADD CONSTRAINT hearings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: import_logs import_logs_imported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: import_uploads import_uploads_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_uploads
    ADD CONSTRAINT import_uploads_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.forensic_import_batches(id) ON DELETE SET NULL;


--
-- Name: import_uploads import_uploads_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_uploads
    ADD CONSTRAINT import_uploads_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: job_audits job_audits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_audits
    ADD CONSTRAINT job_audits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: job_cases job_cases_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_cases
    ADD CONSTRAINT job_cases_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE SET NULL;


--
-- Name: job_cases job_cases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_cases
    ADD CONSTRAINT job_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: job_cases job_cases_download_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_cases
    ADD CONSTRAINT job_cases_download_run_id_fkey FOREIGN KEY (download_run_id) REFERENCES public.job_download_runs(id) ON DELETE SET NULL;


--
-- Name: job_documents job_documents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_documents
    ADD CONSTRAINT job_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: job_documents job_documents_job_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_documents
    ADD CONSTRAINT job_documents_job_case_id_fkey FOREIGN KEY (job_case_id) REFERENCES public.job_cases(id) ON DELETE CASCADE;


--
-- Name: job_download_runs job_download_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_download_runs
    ADD CONSTRAINT job_download_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: job_eligibility job_eligibility_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_eligibility
    ADD CONSTRAINT job_eligibility_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: job_insurance job_insurance_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_insurance
    ADD CONSTRAINT job_insurance_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: job_running_bills job_running_bills_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_running_bills
    ADD CONSTRAINT job_running_bills_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: job_timeline_dates job_timeline_dates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_timeline_dates
    ADD CONSTRAINT job_timeline_dates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: job_timeline_dates job_timeline_dates_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_timeline_dates
    ADD CONSTRAINT job_timeline_dates_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: letter_drafts letter_drafts_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_drafts
    ADD CONSTRAINT letter_drafts_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE SET NULL;


--
-- Name: letter_drafts letter_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_drafts
    ADD CONSTRAINT letter_drafts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: letter_drafts letter_drafts_printed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_drafts
    ADD CONSTRAINT letter_drafts_printed_by_fkey FOREIGN KEY (printed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: letter_emails letter_emails_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: letter_emails letter_emails_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: letter_emails letter_emails_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE SET NULL;


--
-- Name: letter_emails letter_emails_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.background_jobs(id) ON DELETE SET NULL;


--
-- Name: letter_emails letter_emails_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letter_emails
    ADD CONSTRAINT letter_emails_officer_id_fkey FOREIGN KEY (officer_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: ocr_jobs ocr_jobs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_jobs
    ADD CONSTRAINT ocr_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.complaint_documents(id) ON DELETE CASCADE;


--
-- Name: officer_transfers officer_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.officer_transfers
    ADD CONSTRAINT officer_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: officer_transfers officer_transfers_officer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.officer_transfers
    ADD CONSTRAINT officer_transfers_officer_id_fkey FOREIGN KEY (officer_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: photo_match_verdicts photo_match_verdicts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.photo_match_verdicts
    ADD CONSTRAINT photo_match_verdicts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reminders reminders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_corporation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_corporation_id_fkey FOREIGN KEY (corporation_id) REFERENCES public.corporations(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_eng_subdivision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_eng_subdivision_id_fkey FOREIGN KEY (eng_subdivision_id) REFERENCES public.eng_subdivisions(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_gba_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_gba_ward_id_fkey FOREIGN KEY (gba_ward_id) REFERENCES public.gba_wards(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_applications rti_applications_ward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_applications
    ADD CONSTRAINT rti_applications_ward_id_fkey FOREIGN KEY (ward_id) REFERENCES public.wards(id) ON DELETE SET NULL;


--
-- Name: rti_documents rti_documents_rti_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_documents
    ADD CONSTRAINT rti_documents_rti_id_fkey FOREIGN KEY (rti_id) REFERENCES public.rti_applications(id) ON DELETE CASCADE;


--
-- Name: rti_documents rti_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_documents
    ADD CONSTRAINT rti_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_first_appeals rti_first_appeals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_first_appeals
    ADD CONSTRAINT rti_first_appeals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_first_appeals rti_first_appeals_rti_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_first_appeals
    ADD CONSTRAINT rti_first_appeals_rti_id_fkey FOREIGN KEY (rti_id) REFERENCES public.rti_applications(id) ON DELETE CASCADE;


--
-- Name: rti_first_appeals rti_first_appeals_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_first_appeals
    ADD CONSTRAINT rti_first_appeals_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_import_batches rti_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_import_batches
    ADD CONSTRAINT rti_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_second_appeals rti_second_appeals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_second_appeals
    ADD CONSTRAINT rti_second_appeals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: rti_second_appeals rti_second_appeals_first_appeal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_second_appeals
    ADD CONSTRAINT rti_second_appeals_first_appeal_id_fkey FOREIGN KEY (first_appeal_id) REFERENCES public.rti_first_appeals(id) ON DELETE SET NULL;


--
-- Name: rti_second_appeals rti_second_appeals_rti_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_second_appeals
    ADD CONSTRAINT rti_second_appeals_rti_id_fkey FOREIGN KEY (rti_id) REFERENCES public.rti_applications(id) ON DELETE CASCADE;


--
-- Name: rti_second_appeals rti_second_appeals_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rti_second_appeals
    ADD CONSTRAINT rti_second_appeals_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: search_history search_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_history
    ADD CONSTRAINT search_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: templates templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: verification_logs verification_logs_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_logs
    ADD CONSTRAINT verification_logs_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: wards wards_derived_corporation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_derived_corporation_id_fkey FOREIGN KEY (derived_corporation_id) REFERENCES public.corporations(id) ON DELETE SET NULL;


--
-- Name: wards wards_division_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.divisions(id) ON DELETE SET NULL;


--
-- Name: wards wards_eng_subdivision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wards
    ADD CONSTRAINT wards_eng_subdivision_id_fkey FOREIGN KEY (eng_subdivision_id) REFERENCES public.eng_subdivisions(id) ON DELETE SET NULL;


--
-- Name: work_sources work_sources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_sources
    ADD CONSTRAINT work_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: work_sources work_sources_work_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_sources
    ADD CONSTRAINT work_sources_work_id_fkey FOREIGN KEY (work_id) REFERENCES public.bbmp_works(id) ON DELETE CASCADE;


