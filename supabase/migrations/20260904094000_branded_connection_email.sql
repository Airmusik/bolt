BEGIN;
CREATE FUNCTION reminder_private.email_html_escape(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
 SELECT replace(replace(replace(replace(replace(coalesce(value,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
$$;
CREATE FUNCTION reminder_private.connection_email_html(sender text, brand text, base_url text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE logo text; logo_html text := ''; link text; safe_brand text;
BEGIN
 SELECT value INTO logo FROM site_settings WHERE key='site_logo_url';
 safe_brand:=reminder_private.email_html_escape(brand);
 IF base_url !~ '^https://' OR base_url IS NULL THEN base_url:='https://www.11drive.com'; END IF;
 link:=reminder_private.email_html_escape(rtrim(base_url,'/')||'/dashboard?tab=connections');
 IF logo ~ '^https://' THEN
  logo_html:='<img src="'||reminder_private.email_html_escape(logo)||'" width="44" height="44" alt="'||safe_brand||' logo" style="display:block;margin:0 auto 10px;border:0;border-radius:8px;object-fit:contain;">';
 END IF;
 RETURN '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f5f5f5;color:#171717;font-family:Arial,Helvetica,sans-serif;">'
 ||'<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px;">'
 ||'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-top:4px solid #f97316;border-radius:12px;">'
 ||'<tr><td style="padding:32px 28px 12px;"><p style="margin:0 0 16px;color:#c2410c;font-size:12px;font-weight:bold;letter-spacing:1px;">NEW CONNECTION REQUEST</p><h1 style="margin:0;font-size:26px;line-height:34px;">Someone wants to connect</h1></td></tr>'
 ||'<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:25px;"><p style="margin:0 0 16px;"><strong>'||reminder_private.email_html_escape(coalesce(nullif(sender,''),'A member'))||'</strong> sent you a connection request on '||safe_brand||'.</p><p style="margin:0 0 24px;color:#525252;">View their profile and decide whether to accept or decline the request.</p>'
 ||'<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#171717" style="border-radius:8px;"><a href="'||link||'" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;">View request &rarr;</a></td></tr></table>'
 ||'<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#737373;">Sign in to your account to respond. Opening this email does not accept the request.</p></td></tr>'
 ||'<tr><td align="center" style="padding:24px 28px;border-top:1px solid #eeeeee;background:#fafafa;">'||logo_html||'<p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#c2410c;">'||safe_brand||'</p><p style="margin:0;font-size:12px;line-height:19px;color:#737373;">The right driver. The right car. A trusted connection.<br>This is an account notification, not a marketing email.</p></td></tr>'
 ||'</table></td></tr></table></body></html>';
END $$;
REVOKE ALL ON FUNCTION reminder_private.email_html_escape(text),reminder_private.connection_email_html(text,text,text) FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE signature regprocedure; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.dispatch_connection_request_email()'::regprocedure,'public.dispatch_connection_request_email(uuid)'::regprocedure] LOOP
  SELECT pg_get_functiondef(signature) INTO definition;
  IF position('reminder_private.connection_email_html' in definition)=0 THEN
   definition:=replace(definition,E' END IF;\n SELECT net.http_post',E'  q.payload:=q.payload || jsonb_build_object(''html'',reminder_private.connection_email_html(sender_name,site_name,site_url));\n END IF;\n SELECT net.http_post');
   IF position('reminder_private.connection_email_html' in definition)=0 THEN RAISE EXCEPTION 'Email worker template insertion failed'; END IF;
   EXECUTE definition;
  END IF;
 END LOOP;
END $migration$;
COMMIT;
