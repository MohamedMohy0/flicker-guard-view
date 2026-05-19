
insert into storage.buckets (id, name, public) values ('pdf-pages', 'pdf-pages', true)
on conflict (id) do nothing;

create policy "Public read pdf-pages"
on storage.objects for select
using (bucket_id = 'pdf-pages');

create policy "Users upload own pdf-pages"
on storage.objects for insert
with check (bucket_id = 'pdf-pages' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users update own pdf-pages"
on storage.objects for update
using (bucket_id = 'pdf-pages' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users delete own pdf-pages"
on storage.objects for delete
using (bucket_id = 'pdf-pages' and auth.uid()::text = (storage.foldername(name))[1]);
