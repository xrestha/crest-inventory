-- HR Employees: staff photo upload (Add/Edit Employee form).
-- New nullable column + a dedicated public Storage bucket, following the same
-- upload/getPublicUrl pattern as the existing "Logos" bucket (Settings.js/ClientDrawer.js),
-- but scoped with a real INSERT/UPDATE policy instead of Logos' loose (dashboard-only,
-- undocumented) setup — path convention is `${client_id}/${employee_id_or_temp_id}.${ext}`,
-- so the policy can check the first path segment against the caller's own client_id.

ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS photo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-photos', 'staff-photos', true)
ON CONFLICT (id) DO NOTHING;

-- No public SELECT/listing policy — same reasoning as the Logos bucket hardening
-- (20260712210000_security_advisor_anon_execute_hardening.sql): a public bucket serves file
-- GETs directly via its own public-bucket path, independent of storage.objects RLS. The app
-- only ever calls getPublicUrl() (pure string construction), never lists the bucket.

CREATE POLICY "staff_photos_insert_own_client" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-photos'
    AND (public.is_admin() OR (storage.foldername(name))[1] = (public.my_client_id())::text)
  );

CREATE POLICY "staff_photos_update_own_client" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND (public.is_admin() OR (storage.foldername(name))[1] = (public.my_client_id())::text)
  );

NOTIFY pgrst, 'reload schema';
