-- 0008 — Résolutions (ordre du jour), historique des versions, pièces jointes.
--
-- Chaque création ou modification produit une version immuable (resolution_versions,
-- en ajout seul). L'historique survit à la suppression d'une résolution. Après la
-- convocation, toute modification exige un motif (SPEC §5.3).

-- ===== Helpers =====

-- Conversion tolérante (chemins de fichiers, paramètres) : null si invalide.
create function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Préparation modifiable : droits de préparation et AG en brouillon ou convoquée.
create function private.can_edit_assembly(p_assembly uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_assembly(p_assembly)
     and exists (select 1 from public.assemblies where id = p_assembly and status in ('draft', 'convened'));
$$;
grant execute on function private.try_uuid(text), private.can_edit_assembly(uuid) to authenticated, service_role;

-- Texte brut d'un document Tiptap (recherche, historique, exports).
create function private.doc_plain_text(p_doc jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(t #>> '{}', ' '), '')
  from jsonb_path_query(p_doc, 'strict $.**.text') as t
  where jsonb_typeof(t) = 'string';
$$;

-- ===== Tables =====
create table public.resolutions (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references public.assemblies on delete cascade,
  parent_id uuid,
  position int not null check (position <> 0),   -- négative uniquement pendant la renumérotation
  number text not null default '',
  title text not null check (length(trim(title)) between 1 and 300),
  body jsonb not null default '{"type": "doc", "content": []}'
    check (jsonb_typeof(body) = 'object' and body ->> 'type' = 'doc' and length(body::text) <= 200000),
  body_text text not null default '',
  weight_key_id uuid not null,
  vote_type public.vote_type not null default 'yes_no_abstain',
  majority_rule jsonb check (private.validate_rule(majority_rule, 'majority')),
  abstention_policy text not null default 'excluded' check (abstention_policy in ('excluded', 'included')),
  quorum_rule jsonb check (private.validate_rule(quorum_rule, 'quorum')),
  is_secret boolean not null default false,
  mode public.resolution_mode not null default 'electronic',
  allow_vote_change boolean,
  -- SA : recommandation du conseil, qui fixe le vote des pouvoirs en blanc (DECISIONS B7).
  board_recommendation text check (board_recommendation in ('for', 'against')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, assembly_id),
  foreign key (weight_key_id, assembly_id) references public.weight_keys (id, assembly_id),
  foreign key (parent_id, assembly_id) references public.resolutions (id, assembly_id),
  check (parent_id is distinct from id),
  check ((vote_type = 'information') = (majority_rule is null))
);
-- Position unique parmi les résolutions de même parent.
create unique index resolutions_sibling_position on public.resolutions
  (assembly_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), position);

create table public.resolution_versions (
  id bigint generated always as identity primary key,
  resolution_id uuid not null,                -- sans clé étrangère : l'historique survit à la suppression
  assembly_id uuid not null references public.assemblies on delete cascade,
  version int not null,
  change_kind text not null check (change_kind in ('created', 'updated', 'deleted')),
  snapshot jsonb not null,
  assembly_status public.assembly_status not null,
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default clock_timestamp(),
  unique (resolution_id, version, change_kind)
);
create index resolution_versions_resolution_idx on public.resolution_versions (resolution_id, version);

create trigger resolution_versions_no_update_delete
  before update or delete on public.resolution_versions
  for each row execute function private.forbid_mutation();
create trigger resolution_versions_no_truncate
  before truncate on public.resolution_versions
  for each statement execute function private.forbid_mutation();

create table public.resolution_attachments (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null,
  assembly_id uuid not null,
  path text not null unique,
  filename text not null check (length(filename) between 1 and 255),
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  foreign key (resolution_id, assembly_id) references public.resolutions (id, assembly_id) on delete cascade
);

alter table public.resolutions enable row level security;
alter table public.resolutions force row level security;
alter table public.resolution_versions enable row level security;
alter table public.resolution_versions force row level security;
alter table public.resolution_attachments enable row level security;
alter table public.resolution_attachments force row level security;

create policy resolutions_select on public.resolutions for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy resolution_versions_select on public.resolution_versions for select to authenticated
  using (private.can_read_assembly(assembly_id));
create policy resolution_attachments_select on public.resolution_attachments for select to authenticated
  using (private.can_read_assembly(assembly_id));

grant select on public.resolutions, public.resolution_versions, public.resolution_attachments
  to authenticated, service_role;

-- ===== Numérotation =====
-- Résolutions principales : 1, 2, 3… ; sous-résolutions : 2.1, 2.2… Recalculée après
-- chaque création, suppression ou réorganisation. Les positions sont compactées.
create function private.renumber_resolutions(p_assembly uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Deux passes pour ne pas heurter l'index d'unicité des positions.
  update public.resolutions set position = -position where assembly_id = p_assembly;
  with ranked as (
    select id, row_number() over (partition by parent_id order by -position) as pos
    from public.resolutions where assembly_id = p_assembly
  )
  update public.resolutions r set position = ranked.pos from ranked where r.id = ranked.id;

  update public.resolutions set number = position::text where assembly_id = p_assembly and parent_id is null;
  update public.resolutions c set number = p.number || '.' || c.position
  from public.resolutions p
  where c.assembly_id = p_assembly and c.parent_id = p.id;
end;
$$;

-- Instantané versionné d'une résolution (tout ce qui détermine son vote).
create function private.resolution_snapshot(p_resolution public.resolutions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(p_resolution) - 'created_at' - 'updated_at' - 'body_text'
    || jsonb_build_object('weight_key_code',
         (select code from public.weight_keys where id = p_resolution.weight_key_id));
$$;

-- ===== RPC =====
-- p_data : {parent_id?, title, body, weight_key_id, vote_type, majority_rule, abstention_policy,
--           quorum_rule, is_secret, allow_vote_change, board_recommendation}
create function public.upsert_resolution(
  p_assembly uuid,
  p_resolution uuid,
  p_data jsonb,
  p_expected_version int default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_before public.resolutions;
  v_after public.resolutions;
  v_parent uuid := private.try_uuid(p_data ->> 'parent_id');
  v_key uuid := private.try_uuid(p_data ->> 'weight_key_id');
  v_vote_type public.vote_type;
  v_majority jsonb := nullif(p_data -> 'majority_rule', 'null'::jsonb);
  v_quorum jsonb := nullif(p_data -> 'quorum_rule', 'null'::jsonb);
  v_reason text := nullif(trim(p_reason), '');
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    perform private.fail('invalid_resolution');
  end if;

  -- Types de vote disponibles au Lot 1 (choix multiples et élections : Lot 2).
  v_vote_type := (p_data ->> 'vote_type')::public.vote_type;
  if v_vote_type not in ('yes_no_abstain', 'information') then
    perform private.fail('vote_type_not_available');
  end if;
  if v_vote_type = 'information' then
    v_majority := null;
  elsif v_majority is null or not private.validate_rule(v_majority, 'majority') then
    perform private.fail('invalid_majority_rule');
  end if;
  if not private.validate_rule(v_quorum, 'quorum') then
    perform private.fail('invalid_quorum_rule');
  end if;
  if coalesce(p_data ->> 'abstention_policy', 'excluded') not in ('excluded', 'included') then
    perform private.fail('invalid_resolution');
  end if;
  if p_data ->> 'board_recommendation' is not null and p_data ->> 'board_recommendation' not in ('for', 'against') then
    perform private.fail('invalid_resolution');
  end if;
  if v_key is null or not exists (select 1 from public.weight_keys where id = v_key and assembly_id = p_assembly) then
    perform private.fail('invalid_weight_key');
  end if;
  if length(trim(coalesce(p_data ->> 'title', ''))) not between 1 and 300 then
    perform private.fail('invalid_title');
  end if;
  -- Un seul niveau de sous-résolutions.
  if v_parent is not null and not exists (
       select 1 from public.resolutions
       where id = v_parent and assembly_id = p_assembly and parent_id is null and id is distinct from p_resolution) then
    perform private.fail('invalid_parent');
  end if;
  if v_parent is not null and p_resolution is not null
     and exists (select 1 from public.resolutions where parent_id = p_resolution) then
    perform private.fail('invalid_parent');
  end if;
  -- Après convocation, toute modification est motivée.
  if p_resolution is not null and v_assembly.status <> 'draft' and v_reason is null then
    perform private.fail('reason_required');
  end if;

  if p_resolution is null then
    insert into public.resolutions (
      assembly_id, parent_id, position, title, body, body_text, weight_key_id, vote_type, majority_rule,
      abstention_policy, quorum_rule, is_secret, allow_vote_change, board_recommendation)
    values (
      p_assembly, v_parent,
      (select coalesce(max(position), 0) + 1 from public.resolutions
       where assembly_id = p_assembly and parent_id is not distinct from v_parent),
      trim(p_data ->> 'title'),
      coalesce(p_data -> 'body', '{"type": "doc", "content": []}'),
      private.doc_plain_text(coalesce(p_data -> 'body', '{}')),
      v_key, v_vote_type, v_majority,
      coalesce(p_data ->> 'abstention_policy', 'excluded'), v_quorum,
      coalesce((p_data ->> 'is_secret')::boolean, false),
      (p_data ->> 'allow_vote_change')::boolean,
      p_data ->> 'board_recommendation')
    returning * into v_after;
  else
    select * into v_before from public.resolutions where id = p_resolution and assembly_id = p_assembly for update;
    if not found then
      perform private.fail('not_found');
    end if;
    if p_expected_version is not null and v_before.version <> p_expected_version then
      perform private.fail('version_conflict', jsonb_build_object('current', v_before.version));
    end if;
    update public.resolutions set
      parent_id = v_parent,
      -- Changement de parent : placée en fin de sa nouvelle fratrie.
      position = case when v_parent is distinct from v_before.parent_id then
        (select coalesce(max(position), 0) + 1 from public.resolutions
         where assembly_id = p_assembly and parent_id is not distinct from v_parent) else position end,
      title = trim(p_data ->> 'title'),
      body = coalesce(p_data -> 'body', body),
      body_text = private.doc_plain_text(coalesce(p_data -> 'body', body)),
      weight_key_id = v_key,
      vote_type = v_vote_type,
      majority_rule = v_majority,
      abstention_policy = coalesce(p_data ->> 'abstention_policy', 'excluded'),
      quorum_rule = v_quorum,
      is_secret = coalesce((p_data ->> 'is_secret')::boolean, false),
      allow_vote_change = (p_data ->> 'allow_vote_change')::boolean,
      board_recommendation = p_data ->> 'board_recommendation',
      version = version + 1,
      updated_at = now()
    where id = p_resolution
    returning * into v_after;
  end if;

  perform private.renumber_resolutions(p_assembly);
  select * into v_after from public.resolutions where id = v_after.id;

  insert into public.resolution_versions (resolution_id, assembly_id, version, change_kind, snapshot,
                                          assembly_status, reason, changed_by)
  values (v_after.id, p_assembly, v_after.version,
          case when p_resolution is null then 'created' else 'updated' end,
          private.resolution_snapshot(v_after), v_assembly.status, v_reason, auth.uid());

  perform private.audit(v_assembly.org_id, p_assembly,
    case when p_resolution is null then 'resolution.created' else 'resolution.updated' end,
    jsonb_build_object('resolution_id', v_after.id, 'number', v_after.number, 'version', v_after.version,
                       'title', v_after.title, 'reason', v_reason));
  return v_after.id;
end;
$$;

create function public.delete_resolution(p_resolution uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.resolutions;
  v_assembly public.assemblies;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into v_resolution from public.resolutions where id = p_resolution;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_resolution.assembly_id);
  if exists (select 1 from public.resolutions where parent_id = p_resolution) then
    perform private.fail('has_children');
  end if;
  if v_assembly.status <> 'draft' and v_reason is null then
    perform private.fail('reason_required');
  end if;

  insert into public.resolution_versions (resolution_id, assembly_id, version, change_kind, snapshot,
                                          assembly_status, reason, changed_by)
  values (p_resolution, v_resolution.assembly_id, v_resolution.version, 'deleted',
          private.resolution_snapshot(v_resolution), v_assembly.status, v_reason, auth.uid());

  delete from public.resolutions where id = p_resolution;
  perform private.renumber_resolutions(v_resolution.assembly_id);
  perform private.audit(v_assembly.org_id, v_resolution.assembly_id, 'resolution.deleted',
    jsonb_build_object('resolution_id', p_resolution, 'number', v_resolution.number,
                       'title', v_resolution.title, 'reason', v_reason));
end;
$$;

-- Réordonne les résolutions d'une même fratrie (p_parent null : résolutions principales).
-- p_ordered_ids doit contenir exactement toute la fratrie.
create function public.reorder_resolutions(p_assembly uuid, p_parent uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembly public.assemblies := private.lock_assembly_for_edit(p_assembly);
  v_before jsonb;
begin
  if p_ordered_ids is null
     or cardinality(p_ordered_ids) <> (select count(distinct x) from unnest(p_ordered_ids) x)
     or (select array_agg(id order by id) from public.resolutions
         where assembly_id = p_assembly and parent_id is not distinct from p_parent)
        is distinct from (select array_agg(x order by x) from unnest(p_ordered_ids) x) then
    perform private.fail('invalid_order');
  end if;

  select jsonb_agg(number order by position) into v_before
  from public.resolutions where assembly_id = p_assembly and parent_id is not distinct from p_parent;

  update public.resolutions set position = -position
  where assembly_id = p_assembly and parent_id is not distinct from p_parent;
  update public.resolutions r set position = o.ordinality
  from unnest(p_ordered_ids) with ordinality as o(id, ordinality)
  where r.id = o.id;
  perform private.renumber_resolutions(p_assembly);

  perform private.audit(v_assembly.org_id, p_assembly, 'resolutions.reordered', jsonb_build_object(
    'parent_id', p_parent, 'before', v_before,
    'after', (select jsonb_agg(jsonb_build_object('id', id, 'number', number, 'title', title) order by position)
              from public.resolutions where assembly_id = p_assembly and parent_id is not distinct from p_parent)));
end;
$$;

-- Pièce jointe : le fichier est déposé dans Storage (politiques ci-dessous), puis
-- enregistré ici. Le chemin doit commencer par l'AG et la résolution.
create function public.add_resolution_attachment(p_resolution uuid, p_path text, p_filename text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.resolutions;
  v_assembly public.assemblies;
  v_size bigint;
  v_id uuid;
begin
  select * into v_resolution from public.resolutions where id = p_resolution;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_resolution.assembly_id);
  if p_path is null or split_part(p_path, '/', 1) <> v_resolution.assembly_id::text
     or split_part(p_path, '/', 2) <> p_resolution::text then
    perform private.fail('invalid_attachment');
  end if;
  select (metadata ->> 'size')::bigint into v_size
  from storage.objects where bucket_id = 'attachments' and name = p_path;
  if v_size is null then
    perform private.fail('attachment_not_uploaded');
  end if;

  insert into public.resolution_attachments (resolution_id, assembly_id, path, filename, size_bytes, uploaded_by)
  values (p_resolution, v_resolution.assembly_id, p_path, left(trim(p_filename), 255), v_size, auth.uid())
  returning id into v_id;
  perform private.audit(v_assembly.org_id, v_resolution.assembly_id, 'resolution.attachment_added',
    jsonb_build_object('resolution_id', p_resolution, 'attachment_id', v_id, 'filename', p_filename,
                       'size', v_size));
  return v_id;
end;
$$;

create function public.remove_resolution_attachment(p_attachment uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attachment public.resolution_attachments;
  v_assembly public.assemblies;
begin
  select * into v_attachment from public.resolution_attachments where id = p_attachment;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_attachment.assembly_id);
  delete from public.resolution_attachments where id = p_attachment;
  perform private.audit(v_assembly.org_id, v_attachment.assembly_id, 'resolution.attachment_removed',
    jsonb_build_object('resolution_id', v_attachment.resolution_id, 'attachment_id', p_attachment,
                       'filename', v_attachment.filename));
  -- Le client supprime ensuite l'objet Storage correspondant.
  return v_attachment.path;
end;
$$;

-- Une clé utilisée par une résolution ne se supprime pas.
create or replace function public.delete_weight_key(p_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.weight_keys;
  v_assembly public.assemblies;
begin
  select * into v_key from public.weight_keys where id = p_key;
  if not found then
    perform private.fail('not_found');
  end if;
  v_assembly := private.lock_assembly_for_edit(v_key.assembly_id);
  if v_key.is_primary then
    perform private.fail('primary_key_required');
  end if;
  if exists (select 1 from public.member_weights where weight_key_id = p_key and weight > 0)
     or exists (select 1 from public.resolutions where weight_key_id = p_key) then
    perform private.fail('weight_key_in_use');
  end if;

  delete from public.weight_keys where id = p_key;
  perform private.audit(v_assembly.org_id, v_key.assembly_id, 'weight_key.deleted',
    jsonb_build_object('weight_key_id', p_key, 'code', v_key.code, 'label', v_key.label));
end;
$$;

grant execute on function
  public.upsert_resolution(uuid, uuid, jsonb, int, text),
  public.delete_resolution(uuid, text),
  public.reorder_resolutions(uuid, uuid, uuid[]),
  public.add_resolution_attachment(uuid, text, text),
  public.remove_resolution_attachment(uuid)
to authenticated;

-- ===== Storage : pièces jointes (PDF, 20 Mo) =====
-- Chemin : {assembly_id}/{resolution_id}/{uuid}.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 20 * 1024 * 1024, array['application/pdf'])
on conflict (id) do nothing;

create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and private.can_read_assembly(private.try_uuid((storage.foldername(name))[1])));
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and private.can_edit_assembly(private.try_uuid((storage.foldername(name))[1]))
              and exists (select 1 from public.resolutions r
                          where r.id = private.try_uuid((storage.foldername(name))[2])
                            and r.assembly_id = private.try_uuid((storage.foldername(name))[1])));
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and private.can_edit_assembly(private.try_uuid((storage.foldername(name))[1]))
         and not exists (select 1 from public.resolution_attachments a where a.path = name));
