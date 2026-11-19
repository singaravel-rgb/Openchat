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

type ConnectionCheck = {
  name: string;
  status: string;
  detail: string;
};

type ConnectionTestResult = {
  status: string;
  latency_ms: number;
  is_enabled: boolean;
  checks: ConnectionCheck[];
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
  const [backendUrl, setBackendUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  });
  const [snippet, setSnippet] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, sn] = await Promise.all([
          adminApi.getWidgetConfig(),
          adminApi.getWidgetEmbedSnippet(backendUrl),
        ]);
        const c = {
          ...defaults,
          ...cfg,
          logo_url: cfg.logo_url || '',
          allowed_domains: cfg.allowed_domains || [],
          host_identity_jwks_url: cfg.host_identity_jwks_url || '',
          host_identity_issuer: cfg.host_identity_issuer || '',
          host_identity_audience: cfg.host_identity_audience || 'openchat-widget',
          host_identity_public_key: cfg.host_identity_public_key || '',
        } as WidgetConfig;
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

  const handleBackendUrlChange = async (url: string) => {
    setBackendUrl(url);
    try {
      const sn = await adminApi.getWidgetEmbedSnippet(url);
      setSnippet(sn.snippet);
      setScriptUrl(sn.script_url);
    } catch {
      // Keep existing snippet if fetch fails
      const clean = url.replace(/\/+$/, '');
      setSnippet(`<script src="${clean}/api/v1/widget/embed.js" async></script>`);
      setScriptUrl(`${clean}/api/v1/widget/embed.js`);
    }
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const allowed_domains = domainsText.split(/\n|,/).map((d) => d.trim()).filter(Boolean);
      const payload = { ...config, logo_url: config.logo_url || null, allowed_domains };
      const saved = await adminApi.updateWidgetConfig(payload);
      setConfig({
        ...defaults,
        ...saved,
        logo_url: (saved as any).logo_url || '',
        allowed_domains: (saved as any).allowed_domains || [],
        host_identity_jwks_url: (saved as any).host_identity_jwks_url || '',
        host_identity_issuer: (saved as any).host_identity_issuer || '',
        host_identity_audience: (saved as any).host_identity_audience || 'openchat-widget',
        host_identity_public_key: (saved as any).host_identity_public_key || '',
      });
      setDomainsText(((saved as any).allowed_domains || []).join('\n'));
      const sn = await adminApi.getWidgetEmbedSnippet(backendUrl);
      setSnippet(sn.snippet);
      setScriptUrl(sn.script_url);
      setMessage('Widget configuration saved successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const toggleMasterStatus = async () => {
    const nextState = !(config.widget_visibility && config.widget_availability);
    const updated = {
      ...config,
      widget_visibility: nextState,
      widget_availability: nextState,
    };
    setConfig(updated);
    setSaving(true);
    try {
      await adminApi.updateWidgetConfig(updated);
      setMessage(`Widget ${nextState ? 'enabled and active' : 'disabled'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update widget status');
    } finally {
      setSaving(false);
    }
  };

  const runConnectionTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testWidgetConnection();
      setTestResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setMessage('Embed snippet copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy automatically. Please copy the snippet manually.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const isWidgetActive = config.widget_visibility && config.widget_availability;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Customer Contact Channel — Website Widget</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Configure, install and verify the embeddable customer live chat widget</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isWidgetActive
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isWidgetActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {isWidgetActive ? 'Widget Active' : 'Widget Disabled'}
          </span>
          <Button
            variant={isWidgetActive ? 'outline' : 'primary'}
            size="sm"
            onClick={toggleMasterStatus}
            disabled={saving}
          >
            {isWidgetActive ? 'Disable Widget' : 'Enable Widget'}
          </Button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 text-sm">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Widget Installation & Embed Instructions */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-300 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Where & How to Install on Your Website
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p>
            The OpenChat website widget is fully self-contained. To make it appear on your website, follow these four simple steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 font-medium">
            <li>
              <span className="font-semibold text-slate-900 dark:text-white">Configure Backend API URL:</span> Enter your public backend domain below (e.g. <code>https://api.yourdomain.com</code> or <code>http://localhost:8000</code>).
            </li>
            <li>
              <span className="font-semibold text-slate-900 dark:text-white">Authorize Your Website Domain:</span> Add your website domain (e.g. <code>https://vananam.com</code>) to the <strong>Allowed Domains</strong> section.
            </li>
            <li>
              <span className="font-semibold text-slate-900 dark:text-white">Paste the Embed Script:</span> Copy the code snippet below and paste it immediately before the closing <code>&lt;/body&gt;</code> tag on your website pages:
              <div className="my-2 p-3 bg-slate-900 text-slate-100 rounded-md font-mono text-xs overflow-x-auto">
                {`<!-- OpenChat Live Chat Widget -->\n` + snippet + `\n</body>`}
              </div>
            </li>
            <li>
              <span className="font-semibold text-slate-900 dark:text-white">Run Connection Test:</span> Click <strong>Run Connection Test</strong> to confirm your backend and AI grounding engines are online and communicating.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Backend URL & Embed Code Snippet */}
      <Card>
        <CardHeader>
          <CardTitle>Embed Snippet & Backend URL Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              label="Backend API Base URL"
              value={backendUrl}
              onChange={(e) => handleBackendUrlChange(e.target.value)}
              placeholder={typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'}
            />
            <p className="text-xs text-slate-500">
              The public URL where your OpenChat FastAPI backend is accessible by customer browsers.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Copyable Embed Script Tag
            </label>
            <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm text-green-400 overflow-x-auto break-all border border-slate-700">
              {snippet || `<script src="${scriptUrl || `${backendUrl}/api/v1/widget/embed.js`}" async></script>`}
            </div>
            {scriptUrl && (
              <p className="text-xs text-slate-500">
                Direct Script Resource: <span className="font-mono text-slate-700 dark:text-slate-300">{scriptUrl}</span>
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="primary" onClick={copy}>
              {copied ? '✓ Copied to Clipboard!' : 'Copy Embed Snippet'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Installation Verification & Connection Test */}
      <Card className="border-slate-300 dark:border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Installation Verification & Connection Test</CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Verify database health, widget script generation, allowed domains, and AI grounding readiness.
            </p>
          </div>
          <Button variant="outline" onClick={runConnectionTest} disabled={testing}>
            {testing ? 'Testing...' : 'Run Connection Test'}
          </Button>
        </CardHeader>
        <CardContent>
          {testResult ? (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg flex items-center justify-between ${
                  testResult.status === 'connected'
                    ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-900'
                    : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{testResult.status === 'connected' ? '✓' : '⚠️'}</span>
                  <span className="font-semibold">
                    {testResult.status === 'connected'
                      ? 'Widget Engine Connected & Operational'
                      : 'Attention Needed: Widget is Disabled'}
                  </span>
                </div>
                <span className="text-xs font-mono bg-white/60 dark:bg-black/30 px-2 py-1 rounded">
                  Latency: {testResult.latency_ms} ms
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {testResult.checks.map((chk, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-3"
                  >
                    <span className={chk.status === 'ok' ? 'text-green-600' : 'text-amber-500'}>
                      {chk.status === 'ok' ? '●' : '○'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{chk.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{chk.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-slate-500">
              Click &quot;Run Connection Test&quot; above to perform live health diagnostics.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Allowed Domains */}
      <Card>
        <CardHeader>
          <CardTitle>Allowed Website Domains & Origins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Enter allowed website origins (one per line), e.g. <code>https://vananam.com</code> or <code>http://localhost:8080</code>.
            When set, widget API requests are accepted only from these origins. Leave empty for development mode.
          </p>
          <Textarea
            label="Allowed Domains / Origins"
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            rows={4}
            placeholder={'https://vananam.com\nhttp://localhost:8080'}
          />
        </CardContent>
      </Card>

      {/* Branding & Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Branding & Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Widget Title"
              value={config.widget_title}
              onChange={(e) => setConfig({ ...config, widget_title: e.target.value })}
            />
            <Input
              label="Brand Name"
              value={config.brand_name}
              onChange={(e) => setConfig({ ...config, brand_name: e.target.value })}
            />
            <Input
              label="Logo URL"
              value={config.logo_url || ''}
              onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
              placeholder="https://..."
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Primary Color
              </label>
              <input
                type="color"
                value={config.primary_color}
                onChange={(e) => setConfig({ ...config, primary_color: e.target.value })}
                className="w-24 h-10 border border-slate-300 dark:border-slate-700 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Launcher Position
              </label>
              <select
                value={config.launcher_position}
                onChange={(e) => setConfig({ ...config, launcher_position: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
              </select>
            </div>
          </div>
          <Textarea
            label="Welcome Message"
            value={config.welcome_message}
            onChange={(e) => setConfig({ ...config, welcome_message: e.target.value })}
            rows={2}
          />
          <Textarea
            label="Greeting Text"
            value={config.greeting_text}
            onChange={(e) => setConfig({ ...config, greeting_text: e.target.value })}
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Visibility & Behavior Checkboxes */}
      <Card>
        <CardHeader>
          <CardTitle>Visibility & Behavior Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            ['widget_visibility', 'Widget Launcher Visible', 'Show the floating launcher on configured websites'],
            ['widget_availability', 'Widget Messaging Available', 'Allow customers to start and send live chats'],
            ['hide_launcher_on_help_page', 'Hide Launcher on Help Page', 'Hide floating launcher on /help to avoid duplicate UI'],
            ['show_agent_avatar', 'Show Brand/Agent Avatar', 'Display visual brand identity in widget header'],
            ['require_email', 'Require Email (Guest)', 'Ask for email before starting guest conversation'],
          ].map(([key, label, desc]) => (
            <label key={key as string} className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{label}</p>
                <p className="text-sm text-slate-500">{desc}</p>
              </div>
              <input
                type="checkbox"
                checked={(config as any)[key]}
                onChange={(e) => setConfig({ ...config, [key]: e.target.checked } as any)}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
