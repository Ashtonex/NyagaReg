-- ==========================================================
-- PROVINCIAL CAMP 2026 REGISTRATION SYSTEM - SUPABASE SCHEMA
-- Paste this entire script into:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==========================================================

-- 1. Attendees Table
CREATE TABLE IF NOT EXISTS public.attendees (
    id TEXT PRIMARY KEY,
    registration_id TEXT UNIQUE NOT NULL,
    verification_token TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER NOT NULL,
    phone_number TEXT DEFAULT '',
    church_assembly TEXT DEFAULT '',
    district_zone TEXT DEFAULT '',
    emergency_contact_name TEXT DEFAULT '',
    emergency_contact_phone TEXT DEFAULT '',
    parent_guardian_name TEXT DEFAULT '',
    parent_guardian_phone TEXT DEFAULT '',
    consent_confirmed BOOLEAN DEFAULT FALSE,
    dietary_requirements TEXT DEFAULT '',
    allergies TEXT DEFAULT '',
    medical_notes TEXT DEFAULT '',
    transport_required BOOLEAN DEFAULT FALSE,
    optional_activities JSONB DEFAULT '[]'::jsonb,
    amount_due NUMERIC(10, 2) DEFAULT 35.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    balance NUMERIC(10, 2) DEFAULT 35.00,
    payment_status TEXT NOT NULL,
    receipt_issued BOOLEAN DEFAULT FALSE,
    receipt_issued_at TIMESTAMPTZ,
    registration_date TIMESTAMPTZ NOT NULL,
    registered_by TEXT NOT NULL,
    registration_status TEXT NOT NULL DEFAULT 'Active',
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    check_in_status TEXT NOT NULL DEFAULT 'Not Checked In',
    check_in_date TEXT,
    check_in_time TEXT,
    checked_in_by TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'Synced'
);

-- 2. Payments Ledger Table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    attendee_id TEXT NOT NULL,
    registration_id TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_date_time TIMESTAMPTZ NOT NULL,
    payment_method TEXT NOT NULL,
    payment_reference TEXT DEFAULT '',
    recorded_by TEXT NOT NULL,
    station_id TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'Synced'
);

-- 3. Sequences Table (Durable Sequence Counter)
CREATE TABLE IF NOT EXISTS public.sequences (
    id TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    prefix TEXT NOT NULL DEFAULT 'PC',
    padding INTEGER NOT NULL DEFAULT 4
);

-- Initial Sequence Seed
INSERT INTO public.sequences (id, last_sequence, prefix, padding)
VALUES ('reg_id_sequence', 0, 'PC', 4)
ON CONFLICT (id) DO NOTHING;

-- 4. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    attendee_id TEXT,
    registration_id TEXT,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    staff_member TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 5. Indexes for Instant Lookups
CREATE INDEX IF NOT EXISTS idx_attendees_reg_id ON public.attendees(registration_id);
CREATE INDEX IF NOT EXISTS idx_attendees_full_name ON public.attendees(full_name);
CREATE INDEX IF NOT EXISTS idx_attendees_check_in ON public.attendees(check_in_status);
CREATE INDEX IF NOT EXISTS idx_payments_attendee_id ON public.payments(attendee_id);
CREATE INDEX IF NOT EXISTS idx_payments_reg_id ON public.payments(registration_id);

-- 6. Enable Row Level Security (RLS) & Allow Camp Staff (Anon) Full Access
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for attendees"
ON public.attendees FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for payments"
ON public.payments FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for sequences"
ON public.sequences FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public read-write for audit_logs"
ON public.audit_logs FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 7. Enable Realtime Replication for Live Multi-Device Sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sequences;
