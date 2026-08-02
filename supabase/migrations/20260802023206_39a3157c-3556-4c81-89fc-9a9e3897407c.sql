CREATE POLICY "Admins upload member avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND private.is_admin());

CREATE POLICY "Admins replace member avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND private.is_admin())
WITH CHECK (bucket_id = 'avatars' AND private.is_admin());