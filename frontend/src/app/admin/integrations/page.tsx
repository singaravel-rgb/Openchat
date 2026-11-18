'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { adminApi } from '@/lib/api';

interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  is_functional: boolean;
  is_enabled: boolean;
  version: string;
  config_summary: Record<string, any>;
  actions_supported: string[];
  notes?: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  // Test modal state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    success: boolean;
    status: string;
    latency_ms: number;
    message: string;
    details?: Record<string, any>;
  } | null>(null);

  // Configure modal state
  const [configuringItem, setConfiguringItem] = useState<IntegrationItem | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await adminApi.listIntegrations();
      setIntegrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTestConnection = async (item: IntegrationItem) => {
    setTestingId(item.id);
    setTestResult(null);
    setMessage(null);
    setError(null);
    try {
      const res = await adminApi.testIntegration(item.id);
      setTestResult({
        id: item.id,
        success: res.success,
        status: res.status,
        latency_ms: res.latency_ms,
        message: res.message,
        details: res.details,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenConfigure = (item: IntegrationItem) => {
    setConfiguringItem(item);
    if (item.id === 'whatsapp') {
      setConfigForm({
        phone_number_id: item.config_summary?.phone_number_id !== 'Not configured' ? item.config_summary?.phone_number_id : '',
        waba_id: item.config_summary?.waba_id !== 'Not configured' ? item.config_summary?.waba_id : '',
        access_token: '',
      });
    } else if (item.id === 'crm_orders') {
      setConfigForm({
        provider: item.config_summary?.provider || 'Salesforce',
        endpoint_url: item.config_summary?.endpoint_url !== 'Not configured' ? item.config_summary?.endpoint_url : '',
        api_key: '',
      });
    } else {
      setConfigForm({});
    }
  };

  const handleSaveConfig = async () => {
    if (!configuringItem) return;
    setSavingConfig(true);
    try {
      await adminApi.configureIntegration(configuringItem.id, {
        is_enabled: true,
        config: configForm,
      });
      setMessage(`Configuration for ${configuringItem.name} saved successfully.`);
      setConfiguringItem(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDisconnect = async (item: IntegrationItem) => {
    if (!confirm(`Are you sure you want to disconnect ${item.name}?`)) return;
    try {
      await adminApi.disconnectIntegration(item.id);
      setMessage(`${item.name} disconnected.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  const filtered = integrations.filter((it) => {
    if (activeCategory === 'all') return true;
    return it.category === activeCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Integrations & Channels</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage customer touchpoints, developer webhooks, email services, and enterprise connectors
        </p>
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

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { key: 'all', label: 'All Integrations' },
          { key: 'channels', label: 'Customer Channels' },
          { key: 'developer', label: 'Developer & APIs' },
          { key: 'crm', label: 'CRM & Orders' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Test Result Banner */}
      {testResult && (
        <div
          className={`p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
            testResult.success
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-900 dark:text-green-300'
              : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">{testResult.success ? '✓' : '⚠️'}</span>
            <div>
              <p className="font-semibold text-sm">
                Connection Test: {testResult.message}
              </p>
              {testResult.details && (
                <pre className="text-xs mt-1 font-mono opacity-90 overflow-x-auto">
                  {JSON.stringify(testResult.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
          <span className="text-xs font-mono bg-white/70 dark:bg-black/30 px-2.5 py-1 rounded self-start sm:self-center">
            {testResult.latency_ms} ms
          </span>
        </div>
      )}

      {/* Integrations Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((item) => {
          const isConnected = item.status === 'connected';
          const isConfigured = item.status === 'configured';
          const isPlanned = item.status === 'planned';

          return (
            <Card
              key={item.id}
              className={`flex flex-col justify-between transition-shadow hover:shadow-md ${
                isPlanned ? 'border-dashed border-slate-300 dark:border-slate-800' : ''
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-lg font-bold text-slate-900 dark:text-white truncate">
                      {item.name}
                    </CardTitle>
                    <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                      {item.category} • {item.version}
                    </span>
                  </div>
                  <div>
                    {isConnected && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Connected
                      </span>
                    )}
                    {isConfigured && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Configured
                      </span>
                    )}
                    {isPlanned && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Planned
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                    {item.description}
                  </p>

                  <div className="bg-slate-50 dark:bg-slate-900/80 p-3 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1 text-xs font-mono">
                    {Object.entries(item.config_summary).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{k}:</span>
                        <span className="truncate max-w-[160px] text-right">{String(v)}</span>
                      </div>
                    ))}
                  </div>

                  {item.notes && (
                    <p className="text-xs text-slate-400 italic">
                      ℹ️ {item.notes}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  {item.id === 'website_chat' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => (window.location.href = '/admin/settings/widget')}
                    >
                      Widget Settings
                    </Button>
                  )}

                  {item.id === 'webhooks' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => (window.location.href = '/admin/webhooks')}
                    >
                      Manage Webhooks
                    </Button>
                  )}

                  {item.actions_supported.includes('configure') && item.id !== 'website_chat' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenConfigure(item)}
                    >
                      Configure
                    </Button>
                  )}

                  {item.actions_supported.includes('test_connection') && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      disabled={testingId === item.id}
                      onClick={() => handleTestConnection(item)}
                    >
                      {testingId === item.id ? 'Testing...' : 'Test Connection'}
                    </Button>
                  )}

                  {isConnected && item.id !== 'website_chat' && item.id !== 'webhooks' && item.id !== 'rest_api' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDisconnect(item)}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configuration Modal */}
      {configuringItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Configure {configuringItem.name}
              </CardTitle>
              <p className="text-xs text-slate-500">
                Credentials are encrypted and safely stored. Never exposed to frontend code or client logs.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {configuringItem.id === 'whatsapp' && (
                <>
                  <Input
                    label="Phone Number ID"
                    value={configForm.phone_number_id || ''}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, phone_number_id: e.target.value })
                    }
                    placeholder="102345678901234"
                  />
                  <Input
                    label="WhatsApp Business Account ID (WABA ID)"
                    value={configForm.waba_id || ''}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, waba_id: e.target.value })
                    }
                    placeholder="203456789012345"
                  />
                  <Input
                    label="System User Access Token (Encrypted)"
                    type="password"
                    value={configForm.access_token || ''}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, access_token: e.target.value })
                    }
                    placeholder="EAA..."
                  />
                </>
              )}

              {configuringItem.id === 'crm_orders' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      CRM / Order Management Provider
                    </label>
                    <select
                      value={configForm.provider || 'Salesforce'}
                      onChange={(e) =>
                        setConfigForm({ ...configForm, provider: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="Salesforce">Salesforce CRM</option>
                      <option value="HubSpot">HubSpot CRM</option>
                      <option value="Shopify">Shopify Orders</option>
                      <option value="Custom REST">Custom REST Endpoint</option>
                    </select>
                  </div>
                  <Input
                    label="Endpoint URL"
                    value={configForm.endpoint_url || ''}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, endpoint_url: e.target.value })
                    }
                    placeholder="https://api.crm.example.com/v1"
                  />
                  <Input
                    label="API Token / Secret Key (Encrypted)"
                    type="password"
                    value={configForm.api_key || ''}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, api_key: e.target.value })
                    }
                    placeholder="••••••••••••"
                  />
                </>
              )}

              {configuringItem.id === 'email_support' && (
                <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <p>
                    Outbound SMTP settings are configured via server environment (<code>.env</code>) to ensure secure key isolation.
                  </p>
                  <p className="font-mono text-xs bg-slate-100 dark:bg-slate-800 p-2 rounded">
                    SMTP Host: {configuringItem.config_summary?.smtp_host}<br />
                    Port: {configuringItem.config_summary?.smtp_port}<br />
                    From: {configuringItem.config_summary?.from_email}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="ghost"
                  onClick={() => setConfiguringItem(null)}
                  disabled={savingConfig}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

