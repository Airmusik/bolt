CREATE TABLE IF NOT EXISTS public.privacy_policy_documents (
  version text PRIMARY KEY,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.privacy_policy_current (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  version text NOT NULL REFERENCES public.privacy_policy_documents(version)
);
ALTER TABLE public.privacy_policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_policy_current ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_documents_public_read ON public.privacy_policy_documents;
CREATE POLICY privacy_documents_public_read ON public.privacy_policy_documents FOR SELECT TO anon, authenticated USING(true);
GRANT SELECT ON public.privacy_policy_documents TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.privacy_policy_documents, public.privacy_policy_current FROM anon, authenticated;

INSERT INTO public.privacy_policy_documents(version, document) VALUES ('2026-09-08.1', jsonb_build_object(
  'version','2026-09-08.1','effectiveDate','8 September 2026','title','Privacy Policy',
  'summary','{{site_name}} respects your privacy. This policy explains what we collect and how we use it.',
  'sections',jsonb_build_array(
    jsonb_build_object('title','Information we collect','paragraphs',jsonb_build_array('Your name, registered email, phone number, town or neighbourhood, profile details, platform-history submissions, messages and attachments. We also record the terms version and server time of acceptance at registration. We do not request identity cards, driving licences or logbooks for KYC. Profile photos appear immediately; listing and platform-history approval are separate moderation steps, not guarantees of authenticity.')),
    jsonb_build_object('title','How we use it','paragraphs',jsonb_build_array('To operate driver trust profiles, show listings, enable chat, moderate platform-history uploads and improve the platform. We do not sell your data.')),
    jsonb_build_object('title','Evidence visibility','paragraphs',jsonb_build_array('Evidence files are private to you and our admin team. Public profiles show only approved counts and safe trust signals.')),
    jsonb_build_object('title','Chat history and support access','paragraphs',jsonb_build_array('Conversation history, including privately shared chat images, remains stored after a connection ends to support safety reviews and dispute resolution. Ended chats become read-only for the two members. Chat images are available only to conversation participants and authorised administrators who join for support or moderation.')),
    jsonb_build_object('title','Your rights','paragraphs',jsonb_build_array('Site analytics automatically measure page categories, browser-tab sessions, approximate country and recent signed-in activity. Country is inferred by our hosting provider from the network connection; it is not nationality or precise location. Signed-in measurements reference your account; guest sessions use a random identifier. Our analytics database does not store raw IP addresses, search terms, or message contents. Reports cover up to 90 days; older visit records are removed as new activity arrives. Admin visits are excluded. You can turn off these measurements below. Existing opt-outs and Do Not Track are respected; no location permission popup or GPS access is used. Operational account and listing totals are reported separately.','You can request deletion from Settings, and contact us to request access, correction, or exercise other applicable data-protection rights. Records should be kept only as long as needed for their stated purposes or lawful obligations, including a relevant dispute. Ending a connection does not itself delete its messages. Accepting the terms is not blanket consent to marketing or a waiver of privacy rights.'))
  )
)) ON CONFLICT(version) DO NOTHING;
INSERT INTO public.privacy_policy_current(singleton,version) VALUES(true,'2026-09-08.1') ON CONFLICT(singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_current_legal_document(p_slug text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF p_slug='terms' THEN SELECT d.document INTO result FROM registration_terms_policy p JOIN registration_terms_documents d ON d.version=p.version WHERE p.singleton;
  ELSIF p_slug='privacy' THEN SELECT d.document INTO result FROM privacy_policy_current p JOIN privacy_policy_documents d ON d.version=p.version WHERE p.singleton;
  ELSE RAISE EXCEPTION 'Unknown legal page'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_current_legal_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_legal_document(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_publish_legal_document(p_slug text,p_title text,p_summary text,p_sections jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE version_value text := to_char(clock_timestamp(),'YYYY-MM-DD.HH24MISSMS'); document_value jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  p_title:=trim(coalesce(p_title,'')); p_summary:=trim(coalesce(p_summary,''));
  IF p_slug NOT IN ('terms','privacy') THEN RAISE EXCEPTION 'Unknown legal page'; END IF;
  IF length(p_title)<3 OR length(p_title)>80 OR length(p_summary)<10 OR length(p_summary)>1000 THEN RAISE EXCEPTION 'Complete the title and introduction'; END IF;
  IF jsonb_typeof(p_sections)<>'array' OR jsonb_array_length(p_sections)<1 OR jsonb_array_length(p_sections)>20 THEN RAISE EXCEPTION 'Add between 1 and 20 sections'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_sections) s WHERE length(trim(coalesce(s->>'title','')))<2 OR length(trim(coalesce(s->>'body','')))<5 OR length(s->>'body')>8000) THEN RAISE EXCEPTION 'Every section needs a title and valid content'; END IF;
  document_value:=jsonb_build_object('version',version_value,'effectiveDate',to_char(current_date,'FMDD FMMonth YYYY'),'title',p_title,'summary',p_summary,'sections',(SELECT jsonb_agg(jsonb_build_object('title',trim(s->>'title'),'paragraphs',to_jsonb(regexp_split_to_array(trim(s->>'body'),E'\\n\\s*\\n')))) FROM jsonb_array_elements(p_sections) s));
  IF p_slug='terms' THEN
    INSERT INTO registration_terms_documents(version,document) VALUES(version_value,document_value);
    UPDATE registration_terms_policy SET version=version_value WHERE singleton;
  ELSE
    INSERT INTO privacy_policy_documents(version,document,created_by) VALUES(version_value,document_value,auth.uid());
    INSERT INTO privacy_policy_current(singleton,version) VALUES(true,version_value) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version;
  END IF;
  RETURN version_value;
END $$;
REVOKE ALL ON FUNCTION public.admin_publish_legal_document(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_legal_document(text,text,text,jsonb) TO authenticated;
