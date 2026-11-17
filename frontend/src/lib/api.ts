import type { Token, User, ConversationListItem, ConversationDetail, MessageCreate, ConversationCreate, AgentWorkload, ConversationTask, AdminStats, AdminAgent, AuditLogItem, Category, Article, FAQ, Notification, NotificationList, ConversationMetrics, AgentPerformance, TimeSeriesPoint, KnowledgeBaseMetrics, ReportFilters, ExportRequest, SLAConfig, SLAConfigCreate, SLAConfigUpdate, SLAStatus, AIConfig, AIConfigUpdate, AITestRequest, AITestResponse, AIUsageSummary, SettingResponse, Attachment, AttachmentUploadResponse, CannedResponse, CannedResponseCreate, CannedResponseUpdate, CannedResponseUseResponse, CustomField, CustomFieldCreate, CustomFieldUpdate, ConversationCustomFieldValue, ConversationCustomFieldSet, Team, TeamCreate, TeamUpdate, TeamMemberAdd, Department, DepartmentCreate, DepartmentUpdate, BusinessHours, BusinessHoursCreate, BusinessHoursUpdate, Holiday, HolidayCreate, HolidayUpdate, BusinessOpenStatus, BotFlow, BotFlowCreate, BotFlowUpdate, BotFlowStep, BotFlowStepCreate, BotFlowStepUpdate, BotFlowIssue, BotFlowIssueCreate, BotFlowIssueUpdate, BotFlowPublish, Webhook, WebhookCreate, WebhookUpdate, WebhookDeliveryResponse, WebhookTest, AutomationRule, AutomationRuleCreate, AutomationRuleUpdate, AutomationRuleExecution, Campaign, CampaignCreate, CampaignUpdate, CampaignMessageResponse, CampaignLaunch } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getAuthHeader(): { Authorization?: string } {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers as HeadersInit);
  const authHeader = getAuthHeader();
  if (authHeader.Authorization) {
    headers.set('Authorization', authHeader.Authorization);
  }
  if (!(options.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/v1${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err) {
    // Browsers report network/CORS/preflight failures as a bare TypeError.
    throw new Error(
      `Cannot reach the OpenChat API at ${API_BASE}. Check that the backend is running and that this origin is allowed in CORS settings.`,
    );
  }

  if (response.status === 429) {
    throw new Error('Too many requests. Please wait a minute and try again.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }
    let errorDetail: string | unknown;
    try {
      const error = await response.json();
      errorDetail = error.detail;
      if (Array.isArray(errorDetail)) {
        errorDetail = errorDetail
          .map((e: any) => e.msg || e.message || String(e))
          .join(', ');
      }
    } catch {
      errorDetail = 'Request failed';
    }
    throw new Error(String(errorDetail) || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const authApi = {
  login: (email: string, password: string) =>
    fetchApi<Token>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: email, password }),
    }),

  me: () => fetchApi<User>('/auth/me'),
};

export const conversationApi = {
  create: (data: ConversationCreate) =>
    fetchApi<ConversationListItem>('/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: (status?: string, q?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (q) params.append('q', q);
    return fetchApi<ConversationListItem[]>(`/conversations${params.toString() ? `?${params}` : ''}`);
  },

  get: (id: number) => fetchApi<ConversationDetail>(`/conversations/${id}`),

  sendMessage: (id: number, data: MessageCreate) =>
    fetchApi<ConversationDetail['messages'][0]>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { subject?: string }) =>
    fetchApi<ConversationDetail>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  reopen: (id: number) =>
    fetchApi<ConversationDetail>(`/conversations/${id}/reopen`, { method: 'POST' }),
};

export const agentApi = {
  listConversations: (queue?: string, status?: string, q?: string) => {
    const params = new URLSearchParams();
    if (queue) params.append('queue', queue);
    if (status) params.append('status', status);
    if (q) params.append('q', q);
    return fetchApi<ConversationListItem[]>(`/agent/conversations?${params}`);
  },

  getConversation: (id: number) => fetchApi<ConversationDetail>(`/agent/conversations/${id}`),

  getConversationSLAStatus: (conversationId: number) =>
    fetchApi<SLAStatus>(`/admin/sla/conversations/${conversationId}/status`),

  sendMessage: (id: number, data: MessageCreate) =>
    fetchApi<ConversationDetail['messages'][0]>(`/agent/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  takeConversation: (id: number) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}/take`, { method: 'POST' }),

  resolveConversation: (id: number, resolution_details?: string) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}/resolve`, { method: 'POST', body: JSON.stringify(resolution_details ? { resolution_details } : {}) }),

  closeConversation: (id: number, resolution_details?: string) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}/close`, { method: 'POST', body: JSON.stringify(resolution_details ? { resolution_details } : {}) }),

  updateConversation: (id: number, data: { subject?: string; priority?: string; tags?: string[] }) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  assignConversation: (id: number, agent_id: number | null, note?: string) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify({ agent_id, note }) }),

  reopenConversation: (id: number) =>
    fetchApi<{ message: string }>(`/agent/conversations/${id}/reopen`, { method: 'POST' }),

  suggestAgentReply: (id: number) =>
    fetchApi<{ draft: string; provider: string; usage: Record<string, unknown>; sources: Array<{ type: string; id: number; title: string; excerpt: string | null; score: number }> }>(`/agent/conversations/${id}/ai-suggest`, { method: 'POST' }),

  getWorkload: () => fetchApi<AgentWorkload>('/agent/workload'),

  updateCustomer: (conversationId: number, data: { full_name?: string; email?: string }) =>
    fetchApi<ConversationDetail>(`/agent/conversations/${conversationId}/customer`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  setAvailability: (isAvailable: boolean) =>
    fetchApi<{ message: string }>(`/agent/availability?is_available=${isAvailable}`, {
      method: 'PATCH',
    }),

  listAgents: () => fetchApi<Array<{ id: number; full_name: string; email: string }>>('/agent/agents'),

  listTasks: (conversationId: number) =>
    fetchApi<ConversationTask[]>(`/agent/conversations/${conversationId}/tasks`),

  createTask: (conversationId: number, data: { title: string; description?: string; due_at?: string | null }) =>
    fetchApi<ConversationTask>(`/agent/conversations/${conversationId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (
    conversationId: number,
    taskId: number,
    data: { title?: string; description?: string | null; status?: 'open' | 'done'; due_at?: string | null },
  ) =>
    fetchApi<ConversationTask>(`/agent/conversations/${conversationId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTask: (conversationId: number, taskId: number) =>
    fetchApi<void>(`/agent/conversations/${conversationId}/tasks/${taskId}`, { method: 'DELETE' }),
};

export const customerApi = {
  listCategories: () =>
    fetchApi<Category[]>('/customer/categories'),

  listFAQs: (params?: { category_id?: number; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category_id) searchParams.append('category_id', params.category_id.toString());
    if (params?.q) searchParams.append('q', params.q);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<FAQ[]>(`/customer/faqs?${searchParams}`);
  },

  getFAQ: (id: number) => fetchApi<FAQ>(`/customer/faqs/${id}`),

  faqFeedback: (id: number, isHelpful: boolean) =>
    fetchApi<{ message: string }>(`/customer/faqs/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ is_helpful: isHelpful }),
    }),

  listArticles: (params?: { category_id?: number; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category_id) searchParams.append('category_id', params.category_id.toString());
    if (params?.q) searchParams.append('q', params.q);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<Article[]>(`/customer/articles?${searchParams}`);
  },

  getArticle: (id: number) => fetchApi<Article>(`/customer/articles/${id}`),

  articleFeedback: (id: number, isHelpful: boolean) =>
    fetchApi<{ message: string }>(`/customer/articles/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ is_helpful: isHelpful }),
    }),

  searchKnowledge: (q: string, limit = 20) =>
    fetchApi<{ type: string; id: number; title: string; content: string; excerpt: string | null; category: string | null }[]>(`/customer/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  getHelpPage: () => fetchApi<{
    active_conversations: ConversationListItem[];
    faqs: FAQ[];
  }>('/customer/help-page'),
};

export const adminApi = {
  getStats: () => fetchApi<AdminStats>('/admin/stats'),
  getAuditLogs: (params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<AuditLogItem[]>(`/admin/audit-logs?${searchParams}`);
  },

  listAgents: () => fetchApi<AdminAgent[]>('/admin/agents'),

  createAgent: (data: {
    email: string;
    full_name: string;
    password: string;
    max_conversations?: number;
    is_available?: boolean;
  }) =>
    fetchApi<AdminAgent>('/admin/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setAgentAvailability: (agentId: number, isAvailable: boolean) =>
    fetchApi<{ message: string }>(`/admin/agents/${agentId}/availability?is_available=${isAvailable}`, {
      method: 'PATCH',
    }),

  setAgentMaxConversations: (agentId: number, maxConversations: number) =>
    fetchApi<{ message: string }>(`/admin/agents/${agentId}/max-conversations?max_conversations=${maxConversations}`, {
      method: 'PATCH',
    }),

  listConversations: (params?: { status?: string; agent_id?: number; customer_id?: number; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.agent_id) searchParams.append('agent_id', params.agent_id.toString());
    if (params?.customer_id) searchParams.append('customer_id', params.customer_id.toString());
    if (params?.q) searchParams.append('q', params.q);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<ConversationListItem[]>(`/admin/conversations?${searchParams}`);
  },

  getConversation: (id: number) => fetchApi<ConversationDetail>(`/admin/conversations/${id}`),

  updateConversation: (id: number, data: { subject?: string; priority?: string; tags?: string[] }) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  assignConversation: (id: number, agent_id: number | null, note?: string) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify({ agent_id, note }) }),

  resolveConversation: (id: number, resolution_details?: string) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}/resolve`, { method: 'POST', body: JSON.stringify(resolution_details ? { resolution_details } : {}) }),

  closeConversation: (id: number, resolution_details?: string) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}/close`, { method: 'POST', body: JSON.stringify(resolution_details ? { resolution_details } : {}) }),

  updateConversationStatus: (id: number, status: string, resolution_details?: string) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}/status`, { method: 'POST', body: JSON.stringify({ status, resolution_details }) }),

  sendMessage: (id: number, data: MessageCreate) =>
    fetchApi<ConversationDetail['messages'][0]>(`/admin/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(data) }),

  reopenConversation: (id: number) =>
    fetchApi<{ message: string }>(`/admin/conversations/${id}/reopen`, { method: 'POST' }),

  suggestAgentReply: (id: number) =>
    fetchApi<{ draft: string; provider: string; usage: Record<string, unknown>; sources: Array<{ type: string; id: number; title: string; excerpt: string | null; score: number }> }>(`/agent/conversations/${id}/ai-suggest`, { method: 'POST' }),

  // Categories
  listCategories: (includeInactive = false) =>
    fetchApi<Category[]>(`/admin/knowledge/categories?include_inactive=${includeInactive}`),

  getCategory: (id: number) => fetchApi<Category>(`/admin/knowledge/categories/${id}`),

  createCategory: (data: { name: string; slug: string; description?: string; parent_id?: number; display_order?: number; is_active?: boolean }) =>
    fetchApi<Category>('/admin/knowledge/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCategory: (id: number, data: { name?: string; slug?: string; description?: string; parent_id?: number; display_order?: number; is_active?: boolean }) =>
    fetchApi<Category>(`/admin/knowledge/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCategory: (id: number) =>
    fetchApi<{ message: string }>(`/admin/knowledge/categories/${id}`, { method: 'DELETE' }),

  // Articles
  listArticles: (params?: { status?: string; category_id?: number; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.category_id) searchParams.append('category_id', params.category_id.toString());
    if (params?.q) searchParams.append('q', params.q);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<Article[]>(`/admin/knowledge/articles?${searchParams}`);
  },

  getArticle: (id: number) => fetchApi<Article>(`/admin/knowledge/articles/${id}`),

  createArticle: (data: { title: string; slug: string; content: string; excerpt?: string; category_id?: number; status?: string; visibility?: string }) =>
    fetchApi<Article>('/admin/knowledge/articles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateArticle: (id: number, data: { title?: string; slug?: string; content?: string; excerpt?: string; category_id?: number; status?: string; visibility?: string }) =>
    fetchApi<Article>(`/admin/knowledge/articles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteArticle: (id: number) =>
    fetchApi<{ message: string }>(`/admin/knowledge/articles/${id}`, { method: 'DELETE' }),

  // FAQs
  listFAQs: (params?: { category_id?: number; published_only?: boolean; q?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.category_id) searchParams.append('category_id', params.category_id.toString());
    if (params?.published_only) searchParams.append('published_only', 'true');
    if (params?.q) searchParams.append('q', params.q);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<FAQ[]>(`/admin/knowledge/faqs?${searchParams}`);
  },

  getFAQ: (id: number) => fetchApi<FAQ>(`/admin/knowledge/faqs/${id}`),

  createFAQ: (data: { question: string; answer: string; category_id?: number; is_published?: boolean; show_chat_action?: boolean; chat_action_text?: string; display_order?: number }) =>
    fetchApi<FAQ>('/admin/knowledge/faqs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateFAQ: (id: number, data: { question?: string; answer?: string; category_id?: number; is_published?: boolean; show_chat_action?: boolean; chat_action_text?: string; display_order?: number }) =>
    fetchApi<FAQ>(`/admin/knowledge/faqs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteFAQ: (id: number) =>
    fetchApi<{ message: string }>(`/admin/knowledge/faqs/${id}`, { method: 'DELETE' }),

  reorderFAQs: (faqIds: number[]) =>
    fetchApi<{ message: string }>('/admin/knowledge/faqs/reorder', {
      method: 'POST',
      body: JSON.stringify(faqIds),
    }),

  reorderCategories: (categoryIds: number[]) =>
    fetchApi<{ message: string }>('/admin/knowledge/categories/reorder', {
      method: 'POST',
      body: JSON.stringify(categoryIds),
    }),

  reorderArticles: (articleIds: number[]) =>
    fetchApi<{ message: string }>('/admin/knowledge/articles/reorder', {
      method: 'POST',
      body: JSON.stringify(articleIds),
    }),

  // Widget
  getWidgetConfig: () => fetchApi<any>('/admin/widget/config'),
  updateWidgetConfig: (data: any) => fetchApi<any>('/admin/widget/config', { method: 'PUT', body: JSON.stringify(data) }),
  getWidgetEmbedSnippet: () => fetchApi<{ snippet: string; script_url: string }>('/admin/widget/embed-snippet'),

  // Reports
  getConversationMetrics: (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('start_date', filters.date_from);
    if (filters?.date_to) params.append('end_date', filters.date_to);
    if (filters?.agent_id) params.append('agent_id', filters.agent_id.toString());
    return fetchApi<ConversationMetrics>(`/admin/reports/overview?${params}`);
  },

  getAgentPerformance: (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('start_date', filters.date_from);
    if (filters?.date_to) params.append('end_date', filters.date_to);
    return fetchApi<AgentPerformance[]>(`/admin/reports/agents?${params}`);
  },

  getTimeSeries: (filters?: { metric?: string; date_from?: string; date_to?: string; channel?: string; interval?: string }) => {
    const params = new URLSearchParams();
    if (filters?.metric) params.append('metric', filters.metric);
    if (filters?.date_from) params.append('start_date', filters.date_from);
    if (filters?.date_to) params.append('end_date', filters.date_to);
    if (filters?.interval) params.append('interval', filters.interval);
    return fetchApi<TimeSeriesPoint[]>(`/admin/reports/time-series?${params}`);
  },

  getKnowledgeMetrics: (filters?: ReportFilters) => {
    return fetchApi<KnowledgeBaseMetrics>(`/admin/reports/knowledge`);
  },

  exportReport: (data: ExportRequest) =>
    fetchApi<Blob>('/admin/reports/export', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // SLA
  listSLAConfigs: () => fetchApi<SLAConfig[]>('/admin/sla/configs'),

  getSLAConfig: (id: number) => fetchApi<SLAConfig>(`/admin/sla/configs/${id}`),

  createSLAConfig: (data: SLAConfigCreate) =>
    fetchApi<SLAConfig>('/admin/sla/configs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSLAConfig: (id: number, data: SLAConfigUpdate) =>
    fetchApi<SLAConfig>(`/admin/sla/configs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSLAConfig: (id: number) =>
    fetchApi<{ message: string }>(`/admin/sla/configs/${id}`, { method: 'DELETE' }),

  getConversationSLAStatus: (conversationId: number) =>
    fetchApi<SLAStatus>(`/admin/sla/conversations/${conversationId}/status`),

  checkAllSLA: () =>
    fetchApi<{ message: string }>('/admin/sla/check-all', { method: 'POST' }),

  // AI Configuration
  getAIConfig: () => fetchApi<AIConfig>('/admin/ai/config'),
  updateAIConfig: (data: AIConfigUpdate) => fetchApi<AIConfig>('/admin/ai/config', { method: 'PUT', body: JSON.stringify(data) }),
  testAIProvider: (data: AITestRequest) => fetchApi<AITestResponse>('/admin/ai/test', { method: 'POST', body: JSON.stringify(data) }),
  getAIUsage: (conversationId?: number) => fetchApi<AIUsageSummary>(`/admin/ai/usage${conversationId ? `?conversation_id=${conversationId}` : ''}`),

  // Settings
  getSettings: (category: string) => fetchApi<SettingResponse[]>(`/admin/settings/${category}`),
  updateSetting: (category: string, key: string, value: any) => fetchApi<SettingResponse>(`/admin/settings/${category}/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  bulkUpdateSettings: (category: string, settings: Record<string, any>) => fetchApi<SettingResponse[]>(`/admin/settings/${category}`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
};

export const notificationApi = {
  list: (params?: { is_read?: boolean; type?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_read !== undefined) searchParams.append('is_read', params.is_read.toString());
    if (params?.type) searchParams.append('type', params.type);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    return fetchApi<NotificationList>(`/notifications?${searchParams}`);
  },

  getUnreadCount: () => fetchApi<{ unread_count: number }>('/notifications/unread-count'),

  create: (data: { user_id: number; type: string; priority?: string; title: string; message?: string; reference_type?: string; reference_id?: number }) =>
    fetchApi<Notification>('/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  markAsRead: (id: number) =>
    fetchApi<Notification>(`/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: true }),
    }),

  markAllAsRead: () =>
    fetchApi<{ message: string }>('/notifications/mark-all-read', {
      method: 'POST',
    }),
};

export const attachmentApi = {
  upload: (conversationId: number, file: File, messageId?: number) => {
    const formData = new FormData();
    formData.append('conversation_id', conversationId.toString());
    if (messageId) formData.append('message_id', messageId.toString());
    formData.append('file', file);
    return fetchApi<AttachmentUploadResponse>('/attachments/upload', {
      method: 'POST',
      body: formData,
      headers: {
        ...getAuthHeader(),
        // Don't set Content-Type for FormData; browser sets boundary
      },
    });
  },

  list: (conversationId: number) =>
    fetchApi<Attachment[]>(`/attachments/conversation/${conversationId}`),

  download: (attachmentId: number) =>
    fetch(`${API_BASE}/api/v1/attachments/${attachmentId}/download`, {
      headers: getAuthHeader(),
    }),

  delete: (attachmentId: number) =>
    fetchApi<void>(`/attachments/${attachmentId}`, { method: 'DELETE' }),
};

export const cannedResponseApi = {
  list: (params?: { category?: string; is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.append('category', params.category);
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<CannedResponse[]>(`/canned-responses?${searchParams}`);
  },

  create: (data: CannedResponseCreate) =>
    fetchApi<CannedResponse>('/canned-responses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<CannedResponse>(`/canned-responses/${id}`),

  update: (id: number, data: CannedResponseUpdate) =>
    fetchApi<CannedResponse>(`/canned-responses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/canned-responses/${id}`, { method: 'DELETE' }),

  use: (id: number) => fetchApi<CannedResponseUseResponse>(`/canned-responses/${id}/use`, { method: 'POST' }),
};

export const customFieldApi = {
  list: (params?: { is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<CustomField[]>(`/custom-fields?${searchParams}`);
  },

  create: (data: CustomFieldCreate) =>
    fetchApi<CustomField>('/custom-fields', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<CustomField>(`/custom-fields/${id}`),

  update: (id: number, data: CustomFieldUpdate) =>
    fetchApi<CustomField>(`/custom-fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/custom-fields/${id}`, { method: 'DELETE' }),

  listForConversation: (conversationId: number) =>
    fetchApi<ConversationCustomFieldValue[]>(`/custom-fields/conversation/${conversationId}`),

  setForConversation: (conversationId: number, fieldValues: Record<string, string>) =>
    fetchApi<ConversationCustomFieldValue[]>(`/custom-fields/conversation/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ field_values: fieldValues }),
    }),
};

export const teamApi = {
  list: (params?: { is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<Team[]>(`/teams?${searchParams}`);
  },

  create: (data: TeamCreate) =>
    fetchApi<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<Team>(`/teams/${id}`),

  update: (id: number, data: TeamUpdate) =>
    fetchApi<Team>(`/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/teams/${id}`, { method: 'DELETE' }),

  addMember: (teamId: number, userId: number) =>
    fetchApi<void>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  removeMember: (teamId: number, userId: number) =>
    fetchApi<void>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),

  // Departments
  listDepartments: (params?: { is_active?: boolean; team_id?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    if (params?.team_id) searchParams.append('team_id', params.team_id.toString());
    return fetchApi<Department[]>(`/teams/departments?${searchParams}`);
  },

  createDepartment: (data: DepartmentCreate) =>
    fetchApi<Department>('/teams/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDepartment: (id: number) => fetchApi<Department>(`/teams/departments/${id}`),

  updateDepartment: (id: number, data: DepartmentUpdate) =>
    fetchApi<Department>(`/teams/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteDepartment: (id: number) =>
    fetchApi<void>(`/teams/departments/${id}`, { method: 'DELETE' }),
};

export const businessHoursApi = {
  list: (params?: { is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<BusinessHours[]>(`/business-hours?${searchParams}`);
  },

  create: (data: BusinessHoursCreate) =>
    fetchApi<BusinessHours>('/business-hours', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<BusinessHours>(`/business-hours/${id}`),

  update: (id: number, data: BusinessHoursUpdate) =>
    fetchApi<BusinessHours>(`/business-hours/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/business-hours/${id}`, { method: 'DELETE' }),

  // Holidays
  listHolidays: (params?: { is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<Holiday[]>(`/business-hours/holidays?${searchParams}`);
  },

  createHoliday: (data: HolidayCreate) =>
    fetchApi<Holiday>('/business-hours/holidays', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHoliday: (id: number) => fetchApi<Holiday>(`/business-hours/holidays/${id}`),

  updateHoliday: (id: number, data: HolidayUpdate) =>
    fetchApi<Holiday>(`/business-hours/holidays/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteHoliday: (id: number) =>
    fetchApi<void>(`/business-hours/holidays/${id}`, { method: 'DELETE' }),

  checkOpen: () => fetchApi<BusinessOpenStatus>('/business-hours/is-open'),
};

export const botFlowApi = {
  list: (params?: { status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    return fetchApi<BotFlow[]>(`/bot-flows?${searchParams}`);
  },

  create: (data: BotFlowCreate) =>
    fetchApi<BotFlow>('/bot-flows', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<BotFlow>(`/bot-flows/${id}`),

  update: (id: number, data: BotFlowUpdate) =>
    fetchApi<BotFlow>(`/bot-flows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/bot-flows/${id}`, { method: 'DELETE' }),

  publish: (id: number, data?: BotFlowPublish) =>
    fetchApi<BotFlow>(`/bot-flows/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  archive: (id: number) =>
    fetchApi<BotFlow>(`/bot-flows/${id}/archive`, { method: 'POST' }),

  // Steps
  listSteps: (flowId: number) => fetchApi<BotFlowStep[]>(`/bot-flows/${flowId}/steps`),

  createStep: (flowId: number, data: BotFlowStepCreate) =>
    fetchApi<BotFlowStep>(`/bot-flows/${flowId}/steps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStep: (stepId: number, data: BotFlowStepUpdate) =>
    fetchApi<BotFlowStep>(`/bot-flows/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteStep: (stepId: number) =>
    fetchApi<void>(`/bot-flows/steps/${stepId}`, { method: 'DELETE' }),

  // Issues
  listIssues: (flowId: number) => fetchApi<BotFlowIssue[]>(`/bot-flows/${flowId}/issues`),

  createIssue: (flowId: number, data: BotFlowIssueCreate) =>
    fetchApi<BotFlowIssue>(`/bot-flows/${flowId}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateIssue: (issueId: number, data: BotFlowIssueUpdate) =>
    fetchApi<BotFlowIssue>(`/bot-flows/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteIssue: (issueId: number) =>
    fetchApi<void>(`/bot-flows/issues/${issueId}`, { method: 'DELETE' }),
};

export const webhookApi = {
  list: (params?: { is_active?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    return fetchApi<Webhook[]>(`/webhooks?${searchParams}`);
  },

  create: (data: WebhookCreate) =>
    fetchApi<Webhook>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<Webhook>(`/webhooks/${id}`),

  update: (id: number, data: WebhookUpdate) =>
    fetchApi<Webhook>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/webhooks/${id}`, { method: 'DELETE' }),

  listDeliveries: (webhookId: number) =>
    fetchApi<WebhookDeliveryResponse[]>(`/webhooks/${webhookId}/deliveries`),

  test: (webhookId: number, data: WebhookTest) =>
    fetchApi<WebhookDeliveryResponse>(`/webhooks/${webhookId}/test`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  retryDelivery: (webhookId: number, deliveryId: number) =>
    fetchApi<WebhookDeliveryResponse>(
      `/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
      { method: 'POST' }
    ),
};

export const automationRuleApi = {
  list: (params?: { is_active?: boolean; trigger_event?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.append('is_active', params.is_active.toString());
    if (params?.trigger_event) searchParams.append('trigger_event', params.trigger_event);
    return fetchApi<AutomationRule[]>(`/automation-rules?${searchParams}`);
  },

  create: (data: AutomationRuleCreate) =>
    fetchApi<AutomationRule>('/automation-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<AutomationRule>(`/automation-rules/${id}`),

  update: (id: number, data: AutomationRuleUpdate) =>
    fetchApi<AutomationRule>(`/automation-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/automation-rules/${id}`, { method: 'DELETE' }),

  listExecutions: (ruleId: number) =>
    fetchApi<AutomationRuleExecution[]>(`/automation-rules/${ruleId}/executions`),
};

export const campaignApi = {
  list: (params?: { status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    return fetchApi<Campaign[]>(`/campaigns?${searchParams}`);
  },

  create: (data: CampaignCreate) =>
    fetchApi<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => fetchApi<Campaign>(`/campaigns/${id}`),

  update: (id: number, data: CampaignUpdate) =>
    fetchApi<Campaign>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/campaigns/${id}`, { method: 'DELETE' }),

  launch: (id: number, data?: CampaignLaunch) =>
    fetchApi<{ campaign_id: number; sent: number; failed: number; total: number }>(`/campaigns/${id}/launch`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  listMessages: (campaignId: number) =>
    fetchApi<CampaignMessageResponse[]>(`/campaigns/${campaignId}/messages`),
};