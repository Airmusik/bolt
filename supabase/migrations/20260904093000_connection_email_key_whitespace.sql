BEGIN;
-- Reject accidental surrounding whitespace before building HTTP headers.
DO $migration$
DECLARE signature regprocedure; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.dispatch_connection_request_email()'::regprocedure,'public.dispatch_connection_request_email(uuid)'::regprocedure] LOOP
  SELECT pg_get_functiondef(signature) INTO definition;
  definition:=replace(definition,'SELECT decrypted_secret INTO api_key', $replacement$SELECT btrim(decrypted_secret, E' \r\n\t') INTO api_key$replacement$);
  EXECUTE definition;
 END LOOP;
END $migration$;
COMMIT;
