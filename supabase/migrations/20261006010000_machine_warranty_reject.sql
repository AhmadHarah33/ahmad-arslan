-- Rejecting a pending machine edit restores the columns from the saved snapshot.
-- The restore list predates customer_machines.warranty_end, so a rejected
-- warranty change would have stayed in place. Same function, one more column.
create or replace function public.reject_customer_machine(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  act  text;
  snap jsonb;
begin
  if not public.is_approver() then
    raise exception 'Only the organizer or head engineer can review changes.';
  end if;
  select pending_action, pending_snapshot into act, snap
    from public.customer_machines where id = p_id;

  if act = 'insert' then
    delete from public.customer_machines where id = p_id;
    return;
  elsif act = 'delete' then
    update public.customer_machines
      set pending_action = null, is_approved = true, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
    return;
  end if;

  update public.customer_machines cm set
    city_id       = nullif(snap->>'city_id', '')::uuid,
    company_id    = nullif(snap->>'company_id', '')::uuid,
    model_id      = nullif(snap->>'model_id', '')::uuid,
    serial_number = coalesce(snap->>'serial_number', cm.serial_number),
    warranty_end  = nullif(snap->>'warranty_end', '')::date,
    is_approved = true, pending_action = null, pending_snapshot = null,
    approved_by = auth.uid(), approved_at = now()
  where cm.id = p_id;
end;
$$;
