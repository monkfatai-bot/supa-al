-- ═══════════════════════════════════════════════════════════════
-- Phase 10: Integration Registry Seed Data
-- Seeds the integrations table with 30+ production connectors
-- ═══════════════════════════════════════════════════════════════

-- ─── AI Providers ───────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-openai', 'OpenAI', 'openai', 'GPT-4o, GPT-4o-mini, DALL-E 3, Whisper, TTS — OpenAI''s flagship AI models for chat, images, speech, and embeddings.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true,"image":true,"embedding":true,"tts":true}', NOW()),
('int-anthropic', 'Anthropic Claude', 'anthropic', 'Claude 3.5 Sonnet, Claude 3 Opus — Advanced AI assistant focused on safety and helpfulness.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true}', NOW()),
('int-google-gemini', 'Google Gemini', 'google-gemini', 'Gemini 2.0 Flash, Gemini 1.5 Pro — Google''s multimodal AI models.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true,"image":true}', NOW()),
('int-openrouter', 'OpenRouter', 'openrouter', 'Unified API gateway to 200+ AI models including Llama, Mistral, Cohere, and more.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true}', NOW()),
('int-deepseek', 'DeepSeek', 'deepseek', 'DeepSeek V3 and DeepSeek Coder — High-performance open-weight models.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true,"code":true}', NOW()),
('int-qwen', 'Qwen (Alibaba Cloud)', 'qwen', 'Qwen 2.5 and Qwen-Max — Alibaba''s multilingual AI models with strong coding capabilities.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true,"code":true}', NOW()),
('int-grok', 'Grok (xAI)', 'grok', 'Grok-2 and Grok-3 — xAI''s conversational AI with real-time knowledge.', 'ai', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"chat":true,"completion":true}', NOW());

-- ─── Communication ───────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-slack', 'Slack', 'slack', 'Send messages, read channels, manage channels, and set up webhooks in your Slack workspace.', 'communication', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"send_message":true,"read_channel":true,"manage_channels":true,"webhook":true}', NOW()),
('int-discord', 'Discord', 'discord', 'Send messages, manage roles, and interact with Discord servers via bot API.', 'communication', 'oauth', NULL, 'active', '{"botToken":{"type":"string","label":"Bot Token","secret":true}}', '{"send_message":true,"read_channel":true,"manage_roles":true,"webhook":true}', NOW()),
('int-telegram', 'Telegram', 'telegram', 'Send messages, photos, and manage bots via the Telegram Bot API.', 'communication', 'oauth', NULL, 'active', '{"botToken":{"type":"string","label":"Bot Token","secret":true}}', '{"send_message":true,"send_photo":true,"webhook":true,"commands":true}', NOW()),
('int-whatsapp', 'WhatsApp Business', 'whatsapp', 'Send messages and templates via the Meta WhatsApp Cloud API.', 'communication', 'oauth', NULL, 'active', '{"accessToken":{"type":"string","label":"Access Token","secret":true},"phoneId":{"type":"string","label":"Phone Number ID"}}', '{"send_message":true,"send_template":true,"read_messages":true}', NOW()),
('int-teams', 'Microsoft Teams', 'teams', 'Send messages and manage channels in Microsoft Teams via Microsoft Graph API.', 'communication', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"send_message":true,"read_channel":true,"manage_channels":true,"webhook":true}', NOW()),
('int-gmail', 'Gmail', 'gmail', 'Send, read, and search emails. Manage labels and filters in Gmail via Google API.', 'communication', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"send_email":true,"read_email":true,"search_email":true,"manage_labels":true}', NOW()),
('int-outlook', 'Outlook', 'outlook', 'Send, read, and search emails via Microsoft Graph API for Outlook.', 'communication', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"send_email":true,"read_email":true,"search_email":true,"manage_folders":true}', NOW()),
('int-zoom', 'Zoom', 'zoom', 'Create and manage meetings, recordings, and webinars via the Zoom API.', 'communication', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"create_meeting":true,"list_meetings":true,"manage_recordings":true,"webhook":true}', NOW());

-- ─── Storage ─────────────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-google-drive', 'Google Drive', 'google-drive', 'List, upload, download, and manage files and permissions in Google Drive.', 'storage', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"list_files":true,"upload_file":true,"download_file":true,"delete_file":true,"search_files":true,"manage_permissions":true}', NOW()),
('int-dropbox', 'Dropbox', 'dropbox', 'List, upload, download, and search files in Dropbox.', 'storage', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"list_files":true,"upload_file":true,"download_file":true,"delete_file":true,"search_files":true}', NOW()),
('int-onedrive', 'OneDrive', 'onedrive', 'List, upload, download, and share files via Microsoft Graph API.', 'storage', 'oauth', NULL, 'active', '{"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"list_files":true,"upload_file":true,"download_file":true,"delete_file":true,"share_file":true}', NOW());

-- ─── Development ─────────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-github', 'GitHub', 'github', 'List repos, create issues, manage pull requests, and search code on GitHub.', 'development', 'oauth', NULL, 'active', '{"token":{"type":"string","label":"Personal Access Token","secret":true}}', '{"list_repos":true,"create_issue":true,"read_pull_requests":true,"manage_webhooks":true,"search_code":true}', NOW()),
('int-gitlab', 'GitLab', 'gitlab', 'List projects, create issues, and manage merge requests on GitLab.', 'development', 'oauth', NULL, 'active', '{"token":{"type":"string","label":"Personal Access Token","secret":true}}', '{"list_repos":true,"create_issue":true,"read_merge_requests":true,"manage_webhooks":true,"search_code":true}', NOW()),
('int-bitbucket', 'Bitbucket', 'bitbucket', 'List repositories and manage pull requests on Bitbucket.', 'development', 'oauth', NULL, 'active', '{"token":{"type":"string","label":"Personal Access Token","secret":true}}', '{"list_repos":true,"create_issue":true,"read_pull_requests":true,"manage_webhooks":true}', NOW());

-- ─── Payments ────────────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-stripe', 'Stripe', 'stripe', 'Create charges, manage invoices, handle subscriptions, and process refunds via Stripe.', 'payment', 'api_key', NULL, 'active', '{"secretKey":{"type":"string","label":"Secret Key","secret":true},"webhookSecret":{"type":"string","label":"Webhook Secret","secret":true}}', '{"create_charge":true,"create_invoice":true,"manage_subscriptions":true,"webhook":true,"refund":true,"verify_payment":true}', NOW()),
('int-paystack', 'Paystack', 'paystack', 'Initialize and verify payments, charge authorizations, and manage customers via Paystack.', 'payment', 'api_key', NULL, 'active', '{"secretKey":{"type":"string","label":"Secret Key","secret":true},"webhookSecret":{"type":"string","label":"Webhook Secret","secret":true}}', '{"initialize_payment":true,"verify_payment":true,"charge_authorization":true,"create_customer":true,"webhook":true}', NOW()),
('int-flutterwave', 'Flutterwave', 'flutterwave', 'Initialize payments, verify transactions, and manage subscriptions via Flutterwave.', 'payment', 'api_key', NULL, 'active', '{"secretKey":{"type":"string","label":"Secret Key","secret":true},"webhookSecret":{"type":"string","label":"Webhook Secret","secret":true}}', '{"initialize_payment":true,"verify_payment":true,"create_subscription":true,"charge_tokenized_card":true,"webhook":true}', NOW());

-- ─── Commerce ────────────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-shopify', 'Shopify', 'shopify', 'List products, create orders, manage customers, and sync inventory with your Shopify store.', 'commerce', 'oauth', NULL, 'active', '{"storeDomain":{"type":"string","label":"Store Domain"},"clientId":{"type":"string","label":"Client ID"},"clientSecret":{"type":"string","label":"Client Secret","secret":true}}', '{"list_products":true,"create_order":true,"read_customers":true,"manage_inventory":true,"webhook":true}', NOW()),
('int-woocommerce', 'WooCommerce', 'woocommerce', 'List products, create orders, and manage customers on your WooCommerce store.', 'commerce', 'api_key', NULL, 'active', '{"siteUrl":{"type":"string","label":"Site URL"},"consumerKey":{"type":"string","label":"Consumer Key","secret":true},"consumerSecret":{"type":"string","label":"Consumer Secret","secret":true}}', '{"list_products":true,"create_order":true,"read_customers":true,"manage_inventory":true,"webhook":true}', NOW());

-- ─── Automation ──────────────────────────────────────────────
INSERT INTO integrations (id, name, slug, description, category, auth_type, icon_url, status, config_schema, capabilities, created_at) VALUES
('int-zapier', 'Zapier', 'zapier', 'Push events to Zapier hooks, list zaps, and trigger workflows.', 'other', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"push_event":true,"list_zaps":true,"manage_webhooks":true,"trigger_workflow":true}', NOW()),
('int-make', 'Make (Integromat)', 'make', 'List scenarios, trigger executions, and manage webhooks on Make.', 'other', 'api_key', NULL, 'active', '{"apiKey":{"type":"string","label":"API Key","secret":true}}', '{"push_event":true,"list_scenarios":true,"trigger_scenario":true,"manage_webhooks":true}', NOW());

-- ─── RPC: increment_api_key_usage ─────────────────────────────
CREATE OR REPLACE FUNCTION increment_api_key_usage(p_key_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE api_keys SET usage_count = usage_count + 1 WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
