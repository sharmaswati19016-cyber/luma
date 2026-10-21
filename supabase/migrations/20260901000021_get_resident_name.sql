create or replace function public.get_resident_name(p_resident_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select split_part(r.name, ' ', 1)
  from public.residents r
  where r.id = p_resident_id;
$$;

grant execute on function public.get_resident_name(uuid) to anon, authenticated;
