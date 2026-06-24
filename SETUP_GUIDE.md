# Setup Guide: GBA · BBMP Ward & Engineer Tracker

Follow these steps to configure, migrate, seed, and run the GBA · BBMP Ward & Engineer Tracker locally.

---

## Prerequisites

1. **Node.js:** Install Node.js v20.x or v22.x (Recommended: v20 LTS).
2. **Supabase Account:** Access to a remote Supabase project at [supabase.com](https://supabase.com).

---

## Step 1: Install Dependencies

Run the following command at the root of the project to install all required packages:
```bash
npm install
```

---

## Step 2: Configure Environment Variables

1. Copy the template configuration file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in a text editor and fill in the values from your Supabase Dashboard:

```env
# Client Keys: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-anon-publishable-key>

# Server Keys: Supabase Dashboard → Project Settings → API → service_role
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Postgres Connection: Supabase Dashboard → Project Settings → Database → Connection string → URI
# Note: Supabase's direct DB host is IPv6-only. You MUST copy the "Session Pooler" URI 
# for local running migration scripts to bypass IPv4 connectivity problems.
# Format: postgresql://postgres.<your-project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

# App URLs
SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# (Optional) Anthropic Claude API config
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxx
AI_MODEL=claude-sonnet-4-6
AI_TEMPERATURE=0.4
```

---

## Step 3: Initialize the Database Schema

Run the migration scripts to initialize the database tables, relations, triggers, indexes, and custom postgres functions:
```bash
npm run db:migrate
```

---

## Step 4: Seed Initial Data

Run the seeding scripts to insert core geographical data, templates, and sample records:
```bash
# 1. Seed wards, corporations, and division relationships
npm run db:seed

# 2. Seed GBA 369-ward mapping
npm run db:seed-gba

# 3. Seed RTI sample records and standard deadline rules
npm run db:seed-rti

# 4. Seed civic complaint cases and workflow entries
npm run db:seed-complaints

# 5. Seed Government Schedule of Rates (SR) for forensics
npm run db:seed-sr
```

*Tip: You can reset, migrate, and seed all sample tables in one command using:*
```bash
npm run db:reset
```

---

## Step 5: Configure Supabase Storage

The platform stores complaint raster scans, PDFs, and thumbnails in **private buckets**.
Initialize these buckets and apply their bucket permissions by running:
```bash
npm run db:setup-storage
```
This automatically establishes the 4 private buckets:
- `complaint-documents`
- `complaint-evidence`
- `complaint-processed-images`
- `complaint-exports`

---

## Step 6: Onboard your Admin User

To register your first system administrator user, execute the admin onboarding script from your terminal:
```bash
npm run db:create-admin -- admin@example.com "StrongPass123!" "Platform Admin"
```
This inserts a user into Supabase Auth and updates their role in the `profiles` table to `ADMIN`.
You can now log in at `/login` with these credentials to gain full platform privileges.
