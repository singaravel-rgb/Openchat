'use client';

import { useEffect, useState, ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { adminApi } from '@/lib/api';

interface AIConfig {
  id: number;
  ai_enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  system_instructions: string | null;
  greeting: string | null;
  tone: string;
  supported_languages: string[];
  confidence_threshold: number;
  escalation_rules: Record<string, unknown>;
  max_response_length: number;
  knowledge_sources: Record<string, unknown>;
  has_openai_api_key: boolean;
  has_anthropic_api_key: boolean;
  openai_api_key_masked: string | null;
  anthropic_api_key_masked: string | null;
  provider_available: boolean;
  availability_message: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  last_tested_at: string | null;
  updated_at: string | null;
}

interface FormData {
  ai_enabled: boolean;
  provider: string;
  model: string;
  openai_api_key: string;
  anthropic_api_key: string;
  temperature: string;
  max_tokens: string;
  system_instructions: string;
  greeting: string;
  tone: string;
  supported_languages: string;
  confidence_threshold: string;
  max_response_length: string;
}

const TONES = ['professional', 'friendly', 'casual', 'formal'];
const PROVIDERS = ['demo', 'openai', 'anthropic'];

export default function AIConfigurationPage() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [form, setForm] = useState<FormData>({
    ai_enabled: true,
    provider: 'demo',
    model: 'gpt-4o-mini',
    openai_api_key: '',
    anthropic_api_key: '',
    temperature: '0.3',
    max_tokens: '500',
    system_instructions: '',
    greeting: 'Hi! How can I help you today?',
    tone: 'professional',
    supported_languages: 'en',
    confidence_threshold: '0.55',
    max_response_length: '1200',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency_ms?: number } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await adminApi.getAIConfig();
      setConfig(data);
      setForm({
        ai_enabled: data.ai_enabled,
        provider: data.provider,
        model: data.model,
        openai_api_key: '',
        anthropic_api_key: '',
        temperature: String(data.temperature),
        max_tokens: String(data.max_tokens),
        system_instructions: data.system_instructions || '',
        greeting: data.greeting || 'Hi! How can I help you today?',
        tone: data.tone,
        supported_languages: data.supported_languages.join(', '),
        confidence_threshold: String(data.confidence_threshold),
        max_response_length: String(data.max_response_length),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleInputChange = (field: keyof FormData, e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        ai_enabled: form.ai_enabled,
        provider: form.provider,
        model: form.model,
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens, 10),
        system_instructions: form.system_instructions || undefined,
        greeting: form.greeting || undefined,
        tone: form.tone,
        supported_languages: form.supported_languages.split(',').map(s => s.trim()).filter(Boolean),
        confidence_threshold: parseFloat(form.confidence_threshold),
        max_response_length: parseInt(form.max_response_length, 10),
        openai_api_key: form.openai_api_key || undefined,
        anthropic_api_key: form.anthropic_api_key || undefined,
      };
      await adminApi.updateAIConfig(payload);
      setMessage('AI configuration saved successfully.');
      loadConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const testProvider = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        provider: form.provider,
        model: form.model,
        openai_api_key: form.openai_api_key || undefined,
        anthropic_api_key: form.anthropic_api_key || undefined,
      };
      const result = await adminApi.testAIProvider(payload);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">AI Configuration</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure AI provider and behavior settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Provider</label>
            <select
              value={form.provider}
              onChange={e => handleChange('provider', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={saving || testing}
            >
              <option value="demo">Demo Mode (Built-in)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <p className="text-sm text-slate-500 mt-1">
              Demo mode uses built-in responses. Select OpenAI or Anthropic for production AI.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">OpenAI Configuration</h3>
            <div className="space-y-4">
              <Input
                label="API Key"
                placeholder={config?.has_openai_api_key ? config.openai_api_key_masked || '••••' : 'sk-...'}
                type="password"
                value={form.openai_api_key}
                onChange={e => handleInputChange('openai_api_key', e)}
                disabled={saving || testing}
              />
              <Input
                label="Model"
                value={form.model}
                onChange={e => handleInputChange('model', e)}
                placeholder="gpt-4o-mini"
                disabled={saving || testing}
              />
              <Input
                label="Temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={e => handleInputChange('temperature', e)}
                className="w-32"
                disabled={saving || testing}
              />
              <Input
                label="Max Tokens"
                type="number"
                min="50"
                max="4000"
                value={form.max_tokens}
                onChange={e => handleInputChange('max_tokens', e)}
                className="w-32"
                disabled={saving || testing}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Anthropic Configuration</h3>
            <div className="space-y-4">
              <Input
                label="API Key"
                placeholder={config?.has_anthropic_api_key ? config.anthropic_api_key_masked || '••••' : 'sk-ant-...'}
                type="password"
                value={form.anthropic_api_key}
                onChange={e => handleInputChange('anthropic_api_key', e)}
                disabled={saving || testing}
              />
              <Input
                label="Model"
                value={form.model}
                onChange={e => handleInputChange('model', e)}
                placeholder="claude-3-5-sonnet"
                disabled={saving || testing}
              />
              <Input
                label="Temperature"
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={form.temperature}
                onChange={e => handleInputChange('temperature', e)}
                className="w-32"
                disabled={saving || testing}
              />
              <Input
                label="Max Tokens"
                type="number"
                min="50"
                max="4000"
                value={form.max_tokens}
                onChange={e => handleInputChange('max_tokens', e)}
                className="w-32"
                disabled={saving || testing}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">AI Behavior</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable AI Suggestions</p>
                  <p className="text-sm text-slate-500">Show AI-suggested replies to agents</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.ai_enabled}
                    onChange={e => handleInputChange('ai_enabled', e)}
                    disabled={saving || testing}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600" />
                </label>
              </div>
              <Textarea
                label="System Instructions"
                rows={4}
                value={form.system_instructions}
                onChange={e => handleInputChange('system_instructions', e)}
                placeholder="Custom system instructions for the AI..."
                disabled={saving || testing}
              />
              <Input
                label="Greeting Message"
                value={form.greeting}
                onChange={e => handleInputChange('greeting', e)}
                placeholder="Hi! How can I help you today?"
                disabled={saving || testing}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tone</label>
                <select
                  value={form.tone}
                  onChange={e => handleInputChange('tone', e)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving || testing}
                >
                  {TONES.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Supported Languages (comma-separated)"
                value={form.supported_languages}
                onChange={e => handleInputChange('supported_languages', e)}
                placeholder="en, es, fr"
                disabled={saving || testing}
              />
              <Input
                label="Confidence Threshold"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={form.confidence_threshold}
                onChange={e => handleInputChange('confidence_threshold', e)}
                className="w-32"
                disabled={saving || testing}
              />
              <Input
                label="Max Response Length"
                type="number"
                min="200"
                max="4000"
                value={form.max_response_length}
                onChange={e => handleInputChange('max_response_length', e)}
                className="w-32"
                disabled={saving || testing}
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button variant="secondary" onClick={testProvider} disabled={saving || testing}>
              {testing ? 'Testing...' : 'Test Provider'}
            </Button>
          </div>

          {message && (
            <div className="p-3 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">
              {message}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
              <strong>{testResult.ok ? 'Success' : 'Failed'}:</strong> {testResult.message}
              {testResult.latency_ms && <span className="ml-2 text-sm">({testResult.latency_ms}ms)</span>}
            </div>
          )}

          {config && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Provider Available</p>
                  <p className={config.provider_available ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {config.provider_available ? 'Yes' : 'No'}
                  </p>
                  {config.availability_message && (
                    <p className="text-slate-500 dark:text-slate-400">{config.availability_message}</p>
                  )}
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Last Test</p>
                  <p className={config.last_test_status === 'success' ? 'text-green-600 dark:text-green-400' : config.last_test_status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
                    {config.last_test_status || 'Never tested'}
                  </p>
                  {config.last_test_message && (
                    <p className="text-slate-500 dark:text-slate-400">{config.last_test_message}</p>
                  )}
                  {config.last_tested_at && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tested: {new Date(config.last_tested_at).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}