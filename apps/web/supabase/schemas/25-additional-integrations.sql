--
-- Name: folk_tokens; Type: TABLE; Schema: public; Owner: -
CREATE TABLE IF NOT EXISTS public.folk_tokens (
id uuid DEFAULT gen_random_uuid() NOT NULL,
account_id uuid NOT NULL,
user_id uuid NOT NULL,
api_key text NOT NULL,
email_address character varying(255),
api_domain character varying(255) DEFAULT 'https://api.folk.app'::character varying NOT NULL,
user_info jsonb DEFAULT '{}'::jsonb NOT NULL,
scope text DEFAULT 'read_write'::text,
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.folk_tokens IS 'OAuth tokens and configuration for Folk CRM integration';
--
-- Name: slack_tokens; Type: TABLE; Schema: public; Owner: -
CREATE TABLE IF NOT EXISTS public.slack_tokens (
id uuid DEFAULT gen_random_uuid() NOT NULL,
account_id uuid NOT NULL,
user_id uuid NOT NULL,
access_token text NOT NULL,
team_id character varying NOT NULL,
team_name character varying NOT NULL,
authed_user_id character varying NOT NULL,
authed_user_token text,
scope text DEFAULT 'chat:write,users:read'::text,
bot_user_id character varying,
app_id character varying,
enterprise_id character varying,
enterprise_name character varying,
webhook_url text,
incoming_webhook_channel character varying,
incoming_webhook_channel_id character varying,
incoming_webhook_configuration_url text,
created_at timestamp with time zone DEFAULT now() NOT NULL,
updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.slack_tokens IS 'OAuth tokens and configuration for Slack workspace integration';
--
-- Name: folk_tokens folk_tokens_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.folk_tokens
ADD CONSTRAINT folk_tokens_account_id_key UNIQUE (account_id);
--
-- Name: folk_tokens folk_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.folk_tokens
ADD CONSTRAINT folk_tokens_pkey PRIMARY KEY (id);
--
-- Name: slack_tokens slack_tokens_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.slack_tokens
ADD CONSTRAINT slack_tokens_account_id_key UNIQUE (account_id);
--
-- Name: slack_tokens slack_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.slack_tokens
ADD CONSTRAINT slack_tokens_pkey PRIMARY KEY (id);
--
-- Name: idx_folk_tokens_account_id; Type: INDEX; Schema: public; Owner: -
CREATE INDEX IF NOT EXISTS idx_folk_tokens_account_id ON public.folk_tokens USING btree (account_id);
--
-- Name: idx_folk_tokens_user_id; Type: INDEX; Schema: public; Owner: -
CREATE INDEX IF NOT EXISTS idx_folk_tokens_user_id ON public.folk_tokens USING btree (user_id);
--
-- Name: idx_slack_tokens_account_id; Type: INDEX; Schema: public; Owner: -
CREATE INDEX IF NOT EXISTS idx_slack_tokens_account_id ON public.slack_tokens USING btree (account_id);
--
-- Name: idx_slack_tokens_team_id; Type: INDEX; Schema: public; Owner: -
CREATE INDEX IF NOT EXISTS idx_slack_tokens_team_id ON public.slack_tokens USING btree (team_id);
--
-- Name: idx_slack_tokens_user_id; Type: INDEX; Schema: public; Owner: -
CREATE INDEX IF NOT EXISTS idx_slack_tokens_user_id ON public.slack_tokens USING btree (user_id);
--
-- Name: folk_tokens set_folk_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
CREATE TRIGGER set_folk_tokens_updated_at
BEFORE UPDATE ON public.folk_tokens
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
--
-- Name: slack_tokens set_slack_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
CREATE TRIGGER set_slack_tokens_updated_at
BEFORE UPDATE ON public.slack_tokens
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
--
-- Name: folk_tokens folk_tokens_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.folk_tokens
ADD CONSTRAINT folk_tokens_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
--
-- Name: folk_tokens folk_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.folk_tokens
ADD CONSTRAINT folk_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- Name: slack_tokens slack_tokens_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.slack_tokens
ADD CONSTRAINT slack_tokens_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
--
-- Name: slack_tokens slack_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
ALTER TABLE ONLY public.slack_tokens
ADD CONSTRAINT slack_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- Name: folk_tokens; Type: ROW SECURITY; Schema: public; Owner: -
ALTER TABLE public.folk_tokens ENABLE ROW LEVEL SECURITY;
--
-- Name: slack_tokens; Type: ROW SECURITY; Schema: public; Owner: -
ALTER TABLE public.slack_tokens ENABLE ROW LEVEL SECURITY;
--
-- Name: folk_tokens folk_tokens_team_members; Type: POLICY; Schema: public; Owner: -
CREATE POLICY folk_tokens_team_members ON public.folk_tokens
FOR ALL TO authenticated
USING (public.has_role_on_account(account_id));
--
-- Name: slack_tokens slack_tokens_team_members; Type: POLICY; Schema: public; Owner: -
CREATE POLICY slack_tokens_team_members ON public.slack_tokens
FOR ALL TO authenticated
USING (public.has_role_on_account(account_id));