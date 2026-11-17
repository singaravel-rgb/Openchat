'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import type { AIFlowConfig, AIFlowStage, AIFlowResponse } from '@/lib/types';

export default function AIFlowPage() {
  const [stages, setStages] = useState<AIFlowStage[]>([]);
  const [flowEnabled, setFlowEnabled] = useState(true);
  const [config, setConfig] = useState<AIFlowConfig>({
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    confidence_threshold: 0.75,
    temperature: 0.2,
    max_tokens: 1024,
    max_ai_turns: 5,
    escalate_on_human_request: true,
    escalate_on_sensitive: true,
    escalate_on_uncertain: true,
    auto_resolve_enabled: true,
    suggest_replies_to_agents: true,
    sensitive_topics: ['billing', 'refund', 'cancel subscription', 'legal', 'security vulnerability', 'credit card'],
    restricted_categories: ['Internal Policies', 'Restricted'],
    fallback_response: "I'm connecting you with a support specialist who can assist you further with this request.",
    knowledge_sources: {
      faqs: true,
      articles: true,
    },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>('stage-1');
  const [activeTab, setActiveTab] = useState<'flow' | 'rules' | 'safety' | 'knowledge'>('flow');
  const [newTopic, setNewTopic] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchFlowData = async () => {
    try {
      setIsLoading(true);
      const res: AIFlowResponse = await adminApi.getAIFlow();
      setFlowEnabled(res.flow_enabled);
      setStages(res.stages || []);
      if (res.config) {
        setConfig(res.config);
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load AI flow configuration',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlowData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await adminApi.updateAIFlow(config);
      setFlowEnabled(res.flow_enabled);
      setStages(res.stages || []);
      if (res.config) {
        setConfig(res.config);
      }
      setStatusMessage({ type: 'success', text: 'AI Flow & Rules saved and applied successfully.' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save AI flow configuration',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTopic = () => {
    const trimmed = newTopic.trim().toLowerCase();
    if (!trimmed) return;
    if (!config.sensitive_topics.includes(trimmed)) {
      setConfig((prev) => ({
        ...prev,
        sensitive_topics: [...prev.sensitive_topics, trimmed],
      }));
    }
    setNewTopic('');
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setConfig((prev) => ({
      ...prev,
      sensitive_topics: prev.sensitive_topics.filter((t) => t !== topicToRemove),
    }));
  };

  const selectedStage = stages.find((s) => s.id === selectedStageId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI Agent Flow & Rules</h1>
            <Badge variant={flowEnabled ? 'success' : 'default'}>
              {flowEnabled ? 'Flow Active' : 'AI Disabled'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure the 9-stage intelligent support pipeline, autonomous decision thresholds, and escalation rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFlowData}
            disabled={isSaving}
          >
            Reload
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="min-w-[100px]"
          >
            {isSaving ? 'Saving...' : 'Save Rules'}
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg p-4 text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('flow')}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'flow'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Visual Flow Architecture (9 Stages)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'rules'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Model & Autonomous Rules
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('safety')}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'safety'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Safety & Escalation Controls
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('knowledge')}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'knowledge'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Knowledge Sources & Features
        </button>
      </div>

      {/* Tab 1: Visual Flow */}
      {activeTab === 'flow' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 9 Stages Interactive Column */}
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                End-to-End Pipeline Stages
              </h2>
              <span className="text-xs text-slate-400">Click a stage to inspect details</span>
            </div>

            <div className="space-y-2">
              {stages.map((stage, idx) => {
                const isSelected = stage.id === selectedStageId;
                const isEscalationBranch = stage.id === 'stage-7' || stage.id === 'stage-8';
                return (
                  <div key={stage.id} className="relative">
                    {idx > 0 && (
                      <div className="flex justify-center py-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                          <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          <span>{stage.trigger || 'Next stage'}</span>
                        </div>
                      </div>
                    )}
                    <div
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30'
                          : isEscalationBranch
                          ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300 dark:border-amber-900/50 dark:bg-amber-950/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : isEscalationBranch
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {stage.name}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{stage.detail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              stage.status === 'active'
                                ? 'success'
                                : stage.status === 'conditional'
                                ? 'warning'
                                : 'primary'
                            }
                            className="capitalize text-[11px]"
                          >
                            {stage.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage Detail Inspector */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Stage Configuration Inspector
            </h2>
            {selectedStage ? (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {selectedStage.id.toUpperCase()}
                      </span>
                      <Badge variant="primary" className="text-xs capitalize">{selectedStage.type}</Badge>
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      {selectedStage.name}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {selectedStage.detail}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Trigger Condition</p>
                    <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {selectedStage.trigger || 'Standard Pipeline Sequence'}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Active Rule Modifiers</p>
                    {selectedStage.id === 'stage-2' && (
                      <p className="text-xs text-slate-500">
                        Evaluates customer inquiry against {config.sensitive_topics.length} configured sensitive topics. Immediate escalation triggered if detected.
                      </p>
                    )}
                    {selectedStage.id === 'stage-4' && (
                      <p className="text-xs text-slate-500">
                        Autonomous threshold set to <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.round(config.confidence_threshold * 100)}%</span>. Anything below triggers human escalation.
                      </p>
                    )}
                    {selectedStage.id === 'stage-6' && (
                      <p className="text-xs text-slate-500">
                        Max autonomous turns allowed: <span className="font-semibold text-slate-800 dark:text-slate-200">{config.max_ai_turns}</span>. Auto-resolve is <span className="font-semibold">{config.auto_resolve_enabled ? 'Enabled' : 'Disabled'}</span>.
                      </p>
                    )}
                    {selectedStage.id === 'stage-7' && (
                      <p className="text-xs text-slate-500">
                        Custom fallback message: &ldquo;{config.fallback_response}&rdquo;
                      </p>
                    )}
                    {selectedStage.id !== 'stage-2' && selectedStage.id !== 'stage-4' && selectedStage.id !== 'stage-6' && selectedStage.id !== 'stage-7' && (
                      <p className="text-xs text-slate-500">
                        Operates under provider <span className="font-semibold text-slate-800 dark:text-slate-200">{config.provider}</span> ({config.model}).
                      </p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setActiveTab('rules')}
                  >
                    Adjust Flow Rules
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                Select a stage from the flow on the left.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Model & Autonomous Rules */}
      {activeTab === 'rules' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI Provider & Core Model</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select backend LLM service used for intent classification, FAQ vector matching, and answer synthesis.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  AI Assistant Status
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="flowEnabledToggle"
                    checked={flowEnabled}
                    onChange={(e) => setFlowEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="flowEnabledToggle" className="text-sm font-medium text-slate-900 dark:text-white">
                    Enable Autonomous AI Assistant
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig((prev) => ({ ...prev, provider: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="gemini">Google Gemini (Recommended)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="mock">Demo / Mock Provider</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Model Name</label>
                <Input
                  value={config.model}
                  onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="e.g. gemini-1.5-flash"
                  className="mt-1.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Temperature ({config.temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.temperature}
                    onChange={(e) => setConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="mt-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Max Output Tokens
                  </label>
                  <Input
                    type="number"
                    value={config.max_tokens}
                    onChange={(e) => setConfig((prev) => ({ ...prev, max_tokens: parseInt(e.target.value, 10) || 512 }))}
                    className="mt-1.5 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Autonomous Decision Boundaries</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Determine when the AI acts independently versus handing over control to human agents.
              </p>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Confidence Threshold ({Math.round(config.confidence_threshold * 100)}%)
                  </label>
                  <span className="text-xs text-slate-400">Stage 4: Confidence Eval</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="0.95"
                  step="0.05"
                  value={config.confidence_threshold}
                  onChange={(e) => setConfig((prev) => ({ ...prev, confidence_threshold: parseFloat(e.target.value) }))}
                  className="mt-2 w-full"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Responses with vector & knowledge match score below this threshold are redirected to human agents.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Max AI Turns ({config.max_ai_turns})
                  </label>
                  <span className="text-xs text-slate-400">Stage 6: Resolution Decision</span>
                </div>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={config.max_ai_turns}
                  onChange={(e) => setConfig((prev) => ({ ...prev, max_ai_turns: parseInt(e.target.value, 10) || 5 }))}
                  className="mt-1.5 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Maximum number of consecutive AI replies before automatic escalation to human agent queue.
                </p>
              </div>

              <div className="pt-2">
                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  {isSaving ? 'Saving Changes...' : 'Save Autonomous Rules'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 3: Safety & Escalation Controls */}
      {activeTab === 'safety' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Escalation Triggers</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure deterministic triggers that automatically escalate conversations to human agents.
              </p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.escalate_on_human_request}
                    onChange={(e) => setConfig((prev) => ({ ...prev, escalate_on_human_request: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Customer Requests Human</span>
                    <p className="text-xs text-slate-500">
                      Escalate immediately when customer says &ldquo;agent&rdquo;, &ldquo;human&rdquo;, &ldquo;support representative&rdquo;, etc.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.escalate_on_sensitive}
                    onChange={(e) => setConfig((prev) => ({ ...prev, escalate_on_sensitive: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Sensitive Topics Detection</span>
                    <p className="text-xs text-slate-500">
                      Escalate when the conversation matches high-risk topics like billing disputes, refunds, or security issues.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.escalate_on_uncertain}
                    onChange={(e) => setConfig((prev) => ({ ...prev, escalate_on_uncertain: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Low Confidence / Missing Knowledge</span>
                    <p className="text-xs text-slate-500">
                      Escalate instead of hallucinating when no relevant articles or FAQs are found in the knowledge base.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Fallback Response Message
                </label>
                <textarea
                  value={config.fallback_response}
                  onChange={(e) => setConfig((prev) => ({ ...prev, fallback_response: e.target.value }))}
                  rows={3}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Response sent to customer when escalating to an agent..."
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  This friendly message is sent to the customer before placing the conversation in the human queue.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Sensitive Topics List</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keywords and topics that bypass autonomous AI and trigger immediate agent handover.
              </p>

              <div className="flex gap-2">
                <Input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTopic();
                    }
                  }}
                  placeholder="e.g. chargeback, cancel account..."
                  className="text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleAddTopic} disabled={!newTopic.trim()}>
                  Add Topic
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {config.sensitive_topics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(topic)}
                      className="text-red-500 hover:text-red-800 dark:hover:text-red-200"
                      aria-label={`Remove ${topic}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>

              <div className="pt-4">
                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  {isSaving ? 'Saving Changes...' : 'Save Safety Rules'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Knowledge Sources & Features */}
      {activeTab === 'knowledge' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Knowledge Base Grounding</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Determine which repositories the AI retrieves information from to formulate answers.
              </p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.knowledge_sources.faqs}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        knowledge_sources: { ...prev.knowledge_sources, faqs: e.target.checked },
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Frequently Asked Questions (FAQs)</span>
                    <p className="text-xs text-slate-500">
                      Query published question-and-answer pairs for quick, high-confidence matches.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.knowledge_sources.articles}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        knowledge_sources: { ...prev.knowledge_sources, articles: e.target.checked },
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Published Help Articles</span>
                    <p className="text-xs text-slate-500">
                      Search comprehensive documentation and help guides for in-depth troubleshooting context.
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">AI Automation Features</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enhance agent productivity and end-to-end resolution efficiency.
              </p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.auto_resolve_enabled}
                    onChange={(e) => setConfig((prev) => ({ ...prev, auto_resolve_enabled: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">Auto-Resolve on Satisfaction</span>
                    <p className="text-xs text-slate-500">
                      Automatically mark conversations as resolved when the customer expresses clear satisfaction (e.g. &ldquo;thank you, that helped!&rdquo;).
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={config.suggest_replies_to_agents}
                    onChange={(e) => setConfig((prev) => ({ ...prev, suggest_replies_to_agents: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">AI Suggest Replies for Agents</span>
                    <p className="text-xs text-slate-500">
                      Enable the &ldquo;AI&rdquo; suggest button in agent workspace composer to draft grounded replies for human agents.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-4">
                <Button onClick={handleSave} disabled={isSaving} className="w-full">
                  {isSaving ? 'Saving Changes...' : 'Save Knowledge & Features'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

