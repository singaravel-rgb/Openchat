'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { adminApi } from '@/lib/api';

type WidgetConfig = {
  id?: number;
  widget_title: string;
  brand_name: string;
  logo_url: string | null;
  primary_color: string;
  launcher_position: 'bottom-right' | 'bottom-left';
  welcome_message: string;
  greeting_text: string;
  widget_visibility: boolean;
  allowed_domains: string[];
  widget_availability: boolean;
  hide_launcher_on_help_page: boolean;
  show_agent_avatar: boolean;
  require_email: boolean;
  // Host identity verification (authenticated host mode)
  host_identity_jwks_url: string;
  host_identity_issuer: string;
  host_identity_audience: string;
  host_identity_public_key: string;
};

const defaults: WidgetConfig = {
  widget_title: 'OpenChat Support',
  brand_name: 'OpenChat',
  logo_url: '',
  primary_color: '#2563eb',
  launcher_position: 'bottom-right',
  welcome_message: 'Hi! How can we help you today?',
  greeting_text: 'Start a conversation with our team.',
  widget_visibility: true,
  allowed_domains: [],
  widget_availability: true,
  hide_launcher_on_help_page: true,
  show_agent_avatar: true,
  require_email: false,
  host_identity_jwks_url: '',
  host_identity_issuer: '',
  host_identity_audience: 'openchat-widget',
  host_identity_public_key: '',
};

export default function WidgetConfigurationPage() {
  const [config, setConfig] = useState<WidgetConfig>(defaults);
  const [domainsText, setDomainsText] = useState('');
  const [snippet, setSnippet] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, sn] = await Promise.all([adminApi.getWidgetConfig(), adminApi.getWidgetEmbedSnippet()]);
        const c = { ...defaults, ...cfg, logo_url: cfg.logo_url || '', allowed_domains: cfg.allowed_domains || [] } as WidgetConfig;
        setConfig(c);
        setDomainsText((c.allowed_domains || []).join('\n'));
        setSnippet(sn.snippet);
        setScriptUrl(sn.script_url);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load widget configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setMessage(null); setError(null);
    try {
      const allowed_domains = domainsText.split(/\n|,/).map(d => d.trim()).filter(Boolean);
      const payload = { ...config, logo_url: config.logo_url || null, allowed_domains };
      const saved = await adminApi.updateWidgetConfig(payload);
      setConfig({ ...defaults, ...saved, logo_url: (saved as any).logo_url || '', allowed_domains: (saved as any).allowed_domains || [] });
      setDomainsText(((saved as any).allowed_domains || []).join('\n'));
      const sn = await adminApi.getWidgetEmbedSnippet();
      setSnippet(sn.snippet); setScriptUrl(sn.script_url);
      setMessage('Widget configuration saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(snippet); setMessage('Embed snippet copied to clipboard.'); } catch { setError('Could not copy automatically. Please copy the snippet manually.'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Chat Widget Configuration</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure and embed the customer-facing website chat widget</p>
      </div>

      {message && <div className="p-3 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">{message}</div>}
      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <Card>
        <CardHeader><CardTitle>Branding & Appearance</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Widget Title" value={config.widget_title} onChange={e => setConfig({ ...config, widget_title: e.target.value })} />
            <Input label="Brand Name" value={config.brand_name} onChange={e => setConfig({ ...config, brand_name: e.target.value })} />
            <Input label="Logo URL" value={config.logo_url || ''} onChange={e => setConfig({ ...config, logo_url: e.target.value })} placeholder="https://..." />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Primary Color</label>
              <input type="color" value={config.primary_color} onChange={e => setConfig({ ...config, primary_color: e.target.value })} className="w-24 h-10 border border-slate-300 dark:border-slate-700 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Launcher Position</label>
              <select value={config.launcher_position} onChange={e => setConfig({ ...config, launcher_position: e.target.value as any })} className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </div>
          </div>
          <Textarea label="Welcome Message" value={config.welcome_message} onChange={e => setConfig({ ...config, welcome_message: e.target.value })} rows={2} />
          <Textarea label="Greeting Text" value={config.greeting_text} onChange={e => setConfig({ ...config, greeting_text: e.target.value })} rows={2} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Visibility & Behavior</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            ['widget_visibility', 'Widget Visible', 'Show the launcher on configured websites'],
            ['widget_availability', 'Widget Available', 'Allow customers to start and send chats'],
            ['hide_launcher_on_help_page', 'Hide Launcher on Help Page', 'Hide floating launcher on /help to avoid duplicate entry points'],
            ['show_agent_avatar', 'Show Brand/Agent Avatar', 'Display visual identity in widget header'],
            ['require_email', 'Require Email (Guest)', 'Ask for email when creating a guest session (enforced by session API)'],
          ].map(([key, label, desc]) => (
            <label key={key as string} className="flex items-center justify-between gap-4 cursor-pointer">
              <div><p className="font-medium text-slate-900 dark:text-white">{label}</p><p className="text-sm text-slate-500">{desc}</p></div>
              <input type="checkbox" checked={(config as any)[key]} onChange={e => setConfig({ ...config, [key]: e.target.checked } as any)} className="w-5 h-5" />
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Security & Allowed Domains</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">Enter allowed website origins (one per line), e.g. <code>https://example.com</code>. When set, widget API requests are accepted only from these origins. Leave empty for development (no origin allowlist enforced beyond request validation).</p>
          <Textarea label="Allowed Domains / Origins" value={domainsText} onChange={e => setDomainsText(e.target.value)} rows={5} placeholder={'https://example.com\nhttps://www.example.com'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Host Identity Verification (Authenticated Host Mode)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">Enable secure host-signed identity tokens. When configured, the widget accepts a <code>host_identity_token</code> (JWT signed by your backend) containing verified customer identity. This bypasses guest session creation and links to a known customer.</p>
          <div className="space-y-3">
            <Input label="JWKS URL" value={config.host_identity_jwks_url} onChange={e => setConfig({ ...config, host_identity_jwks_url: e.target.value })} placeholder="https://your-app.com/.well-known/jwks.json" />
            <p className="text-xs text-slate-500">URL to fetch public keys for JWT verification (e.g., from your auth provider)</p>
            <Input label="Issuer" value={config.host_identity_issuer} onChange={e => setConfig({ ...config, host_identity_issuer: e.target.value })} placeholder="https://your-app.com" />
            <p className="text-xs text-slate-500">Expected 'iss' claim in the JWT</p>
            <Input label="Audience" value={config.host_identity_audience} onChange={e => setConfig({ ...config, host_identity_audience: e.target.value })} placeholder="openchat-widget" />
            <p className="text-xs text-slate-500">Expected 'aud' claim in the JWT</p>
            <Textarea label="Public Key (PEM)" value={config.host_identity_public_key} onChange={e => setConfig({ ...config, host_identity_public_key: e.target.value })} rows={6} placeholder="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----" />
            <p className="text-xs text-slate-500">Optional: Paste PEM-formatted public key directly (used if JWKS URL not set or as fallback)</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2"><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Configuration'}</Button></div>

      <Card>
        <CardHeader><CardTitle>Embed Snippet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg font-mono text-sm text-slate-700 dark:text-slate-300 overflow-x-auto break-all">{snippet || `<script src="${scriptUrl || '{backend}/api/v1/widget/embed.js'}" async></script>`}</div>
          <p className="text-sm text-slate-500">Paste this before the closing <code>&lt;/body&gt;</code> tag on external websites you allow. The widget loads configuration, creates/restores secure sessions, and connects to the existing conversation engine.</p>
          {scriptUrl && <p className="text-xs text-slate-500">Script URL: {scriptUrl}</p>}
          <Button variant="outline" onClick={copy}>Copy to Clipboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
