create or replace function private.run_escrow_settlement()
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  job_secret text;
begin
  select nullif(trim(value), '') into job_secret
  from public.integration_keys
  where key = 'job_trigger_secret';

  if job_secret is null then
    raise notice 'escrow settlement skipped: job_trigger_secret not set';
    return;
  end if;

  perform net.http_post(
    url := 'https://project--096f4ff4-b70d-4e08-b046-a55bbecfece0.lovable.app/api/public/hooks/escrow-release',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ashnight-job-secret', job_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function private.run_escrow_settlement() from public, anon, authenticated;

select cron.unschedule('ashnight-escrow-settlement')
where exists (select 1 from cron.job where jobname = 'ashnight-escrow-settlement');

select cron.schedule(
  'ashnight-escrow-settlement',
  '*/15 * * * *',
  $$select private.run_escrow_settlement();$$
);