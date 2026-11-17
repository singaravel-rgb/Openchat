export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'customer' | 'agent' | 'admin';
  is_active: boolean;
  agent_profile?: {
    is_available: boolean;
    is_approved: boolean;
    max_conversations: number;
    active_conversations: number;
  };
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface Conversation {
  id: number;
  customer_id: number;
  assigned_agent_id: number | null;
  subject: string | null;
  status: ConversationStatus;
  channel: string;
  priority?: string;
  tags?: string[];
  resolution_details?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  customer_last_read_at?: string | null;
  agent_last_read_at?: string | null;
}

export type ConversationStatus =
  | 'open'
  | 'pending'
  | 'resolved'
  | 'waiting_on_customer'
  | 'on_hold'
  | 'ai_handling'
  | 'assigned'
  | 'closed';

export interface ConversationListItem extends Conversation {
  customer_name: string;
  customer_email: string;
  assigned_agent_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_type: MessageSenderType;
  message_type: MessageType;
  content: string;
  is_internal: boolean;
  delivery_status?: string;
  processed_at?: string | null;
  client_message_id?: string | null;
  created_at: string;
  edited_at?: string | null;
  edited_by_id?: number | null;
  is_retracted?: boolean;
  retracted_at?: string | null;
}

export type MessageSenderType = 'customer' | 'agent' | 'ai' | 'system';
export type MessageType = 'text' | 'internal_note' | 'system_event';

export interface ConversationDetail extends Conversation {
  messages: Message[];
  assignment_history?: Array<Record<string, unknown>>;
  attachments?: Attachment[];
  custom_fields?: ConversationCustomFieldValue[];
  global_note?: string | null;
  global_note_updated_at?: string | null;
  global_note_updated_by_id?: number | null;
  global_note_updated_by_name?: string | null;
  // Mirrors of the inbox card fields, returned by the detail endpoint so a
  // conversation can be reselected after refresh or from a notification link.
  customer_name?: string | null;
  customer_email?: string | null;
  assigned_agent_name?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
}

export interface MessageCreate {
  content: string;
  is_internal?: boolean;
  client_message_id?: string;
}

export interface ConversationCreate {
  subject?: string;
  priority?: string;
  tags?: string[];
  channel?: string;
}

export interface ConversationUpdate {
  subject?: string;
  priority?: string;
  tags?: string[];
}

export interface AssignRequest {
  agent_id?: number | null;
  note?: string;
}

export interface StatusUpdateRequest {
  status?: string;
  resolution_details?: string;
}

export interface ConversationTask {
  id: number;
  conversation_id: number;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  created_by_id: number | null;
  completed_by_id: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentWorkload {
  active: number;
  max: number;
  available: boolean;
  capacity_remaining: number;
}

export interface AdminStats {
  conversations: {
    total: number;
    ai_handling: number;
    pending: number;
    assigned: number;
    open?: number;
    on_hold?: number;
    waiting_on_customer?: number;
    resolved: number;
    closed: number;
    today: number;
  };
  agents: {
    total: number;
    available: number;
    busy: number;
  };
  customers: {
    total: number;
  };
  avg_resolution_hours: number | null;
}

export interface AdminAgent {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_available: boolean;
  max_conversations: number;
  active_conversations: number;
  capacity_remaining: number;
}

export type QueueType = 'inbox' | 'pending' | 'assigned' | 'resolved';

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parent_id: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  children?: Category[];
}

export interface Article {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category_id: number | null;
  author_id: number;
  status: 'draft' | 'published' | 'archived';
  visibility: 'public' | 'agents_only' | 'internal';
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface FAQ {
  id: number;
  question: string;
  answer: string;
  category_id: number | null;
  is_published: boolean;
  show_chat_action: boolean;
  chat_action_text: string | null;
  display_order: number;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export type NotificationType =
  | 'new_message'
  | 'conversation_assigned'
  | 'conversation_reopened'
  | 'mention'
  | 'sla_warning'
  | 'sla_breach'
  | 'agent_invited'
  | 'article_published'
  | 'faq_published'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string | null;
  reference_type: string | null;
  reference_id: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationList {
  notifications: Notification[];
  unread_count: number;
}

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: number | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ConversationMetrics {
  total?: number;
  total_conversations?: number;
  by_status?: Record<string, number>;
  by_channel?: Record<string, number>;
  avg_first_response_minutes?: number | null;
  avg_response_time_minutes?: number | null;
  avg_resolution_hours?: number | null;
  avg_resolution_time_minutes?: number | null;
  csat_score?: number | null;
  sla_response_met_pct?: number | null;
  sla_resolution_met_pct?: number | null;
  ai_handling?: number;
  pending?: number;
  assigned?: number;
  resolved?: number;
  closed?: number;
  today?: {
    created: number;
    resolved: number;
  };
}

export interface AgentPerformance {
  agent_id: number;
  agent_name: string;
  agent_email: string;
  assigned_count: number;
  resolved_count: number;
  avg_resolution_hours: number | null;
  first_response_avg_minutes: number | null;
  csat_avg: number | null;
}

export interface TimeSeriesPoint {
  date: string;
  created: number;
  resolved: number;
  avg_resolution_hours: number | null;
}

export interface KnowledgeBaseMetrics {
  articles: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    total_views: number;
  };
  faqs: {
    total: number;
    published: number;
    total_views: number;
  };
  top_articles: Array<{
    id: number;
    title: string;
    views: number;
  }>;
  top_faqs: Array<{
    id: number;
    question: string;
    views: number;
  }>;
}

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  agent_id?: number;
  channel?: string;
}

export interface ExportRequest {
  report_type: 'conversations' | 'agents' | 'timeseries' | 'knowledge';
  format: 'csv' | 'json';
  filters?: ReportFilters;
}

export interface SLAConfig {
  id: number;
  name: string;
  description: string | null;
  response_time_minutes: number;
  resolution_time_minutes: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SLAConfigCreate {
  name: string;
  description?: string;
  response_time_minutes: number;
  resolution_time_minutes: number;
  is_default?: boolean;
  is_active?: boolean;
}

export interface SLAConfigUpdate {
  name?: string;
  description?: string;
  response_time_minutes?: number;
  resolution_time_minutes?: number;
  is_default?: boolean;
  is_active?: boolean;
}

export interface SLAStatus {
  conversation_id: number;
  sla_config_name: string | null;
  response_due_at: string | null;
  resolution_due_at: string | null;
  response_breached: boolean;
  resolution_breached: boolean;
  first_response_at: string | null;
  resolved_at: string | null;
  response_remaining_minutes: number | null;
  resolution_remaining_minutes: number | null;
  response_status: 'ok' | 'warning' | 'breached' | 'met' | 'not_applicable';
  resolution_status: 'ok' | 'warning' | 'breached' | 'met' | 'not_applicable';
}

export interface AIConfig {
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

export interface AIConfigUpdate {
  ai_enabled?: boolean;
  provider?: string;
  model?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  temperature?: number;
  max_tokens?: number;
  system_instructions?: string;
  greeting?: string;
  tone?: string;
  supported_languages?: string[];
  confidence_threshold?: number;
  escalation_rules?: Record<string, unknown>;
  max_response_length?: number;
  knowledge_sources?: Record<string, unknown>;
}

export interface AITestRequest {
  provider?: string;
  model?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
}

export interface AITestResponse {
  ok: boolean;
  provider: string;
  model?: string;
  message: string;
  latency_ms?: number;
}

export interface AIUsageSummary {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  by_provider: Record<string, {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
    models: Record<string, { requests: number; tokens: number; cost_usd: number }>;
  }>;
}

export interface SettingResponse {
  key: string;
  value: any;
  category: string;
  description?: string;
}

export interface CannedResponse {
  id: number;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
  is_active: boolean;
  created_by_id: number | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface CannedResponseCreate {
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
  is_active: boolean;
}

export interface CannedResponseUpdate {
  title?: string;
  content?: string;
  category?: string;
  shortcut?: string | null;
  is_active?: boolean;
}

export interface CannedResponseUseResponse {
  content: string;
  title: string;
}

export interface CustomField {
  id: number;
  name: string;
  field_key: string;
  field_type: string;
  options: string | null;
  is_required: boolean;
  is_active: boolean;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldCreate {
  name: string;
  field_key: string;
  field_type: string;
  options: string | null;
  is_required: boolean;
  is_active: boolean;
}

export interface CustomFieldUpdate {
  name?: string;
  field_type?: string;
  options?: string | null;
  is_required?: boolean;
  is_active?: boolean;
}

export interface ConversationCustomFieldValue {
  custom_field_id: number;
  field_key: string;
  field_name: string;
  field_type: string;
  value: string;
}

export interface ConversationCustomFieldSet {
  field_values: Record<string, string>;
}

export interface Team {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface TeamCreate {
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
}

export interface TeamUpdate {
  name?: string;
  slug?: string;
  description?: string;
  is_active?: boolean;
}

export interface TeamMemberAdd {
  user_id: number;
}

export interface Department {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  team_id: number | null;
  team_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreate {
  name: string;
  slug: string;
  description?: string;
  team_id?: number;
  is_active: boolean;
}

export interface DepartmentUpdate {
  name?: string;
  slug?: string;
  description?: string;
  team_id?: number;
  is_active?: boolean;
}

export interface BusinessHours {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessHoursCreate {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_closed: boolean;
  is_active: boolean;
}

export interface BusinessHoursUpdate {
  start_time?: string;
  end_time?: string;
  is_closed?: boolean;
  is_active?: boolean;
}

export interface Holiday {
  id: number;
  name: string;
  holiday_date: string;
  is_recurring: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HolidayCreate {
  name: string;
  holiday_date: string;
  is_recurring: boolean;
  is_active: boolean;
}

export interface HolidayUpdate {
  name?: string;
  holiday_date?: string;
  is_recurring?: boolean;
  is_active?: boolean;
}

export interface BusinessOpenStatus {
  is_open: boolean;
  reason: string;
}

export interface BotFlow {
  id: number;
  name: string;
  description: string | null;
  initial_greeting: string | null;
  status: string;
  version: number;
  is_default: boolean;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface BotFlowCreate {
  name: string;
  description?: string;
  initial_greeting?: string;
  status: string;
  is_default: boolean;
}

export interface BotFlowUpdate {
  name?: string;
  description?: string;
  initial_greeting?: string;
  status?: string;
  is_default?: boolean;
}

export interface BotFlowStep {
  id: number;
  flow_id: number;
  step_key: string;
  step_type: string;
  message_text: string | null;
  options: string | null;
  next_step_key: string | null;
  is_terminal: boolean;
  sort_order: number;
  created_at: string;
}

export interface BotFlowStepCreate {
  step_key: string;
  step_type: string;
  message_text?: string;
  options?: string | null;
  next_step_key?: string | null;
  is_terminal: boolean;
  sort_order: number;
}

export interface BotFlowStepUpdate {
  step_type?: string;
  message_text?: string;
  options?: string | null;
  next_step_key?: string | null;
  is_terminal?: boolean;
  sort_order?: number;
}

export interface BotFlowIssue {
  id: number;
  flow_id: number;
  title: string;
  description: string | null;
  start_step_key: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface BotFlowIssueCreate {
  title: string;
  description?: string;
  start_step_key?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface BotFlowIssueUpdate {
  title?: string;
  description?: string;
  start_step_key?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface BotFlowPublish {
  version_comment?: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookCreate {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  is_active: boolean;
}

export interface WebhookUpdate {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  is_active?: boolean;
}

export interface WebhookDeliveryResponse {
  id: number;
  webhook_id: number;
  event: string;
  response_status: number | null;
  response_body: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface WebhookTest {
  event: string;
  payload: Record<string, any>;
}

export interface AutomationRule {
  id: number;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: any[];
  actions: any[];
  is_active: boolean;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRuleCreate {
  name: string;
  description?: string;
  trigger_event: string;
  conditions: any[];
  actions: any[];
  is_active: boolean;
}

export interface AutomationRuleUpdate {
  name?: string;
  description?: string;
  trigger_event?: string;
  conditions?: any[];
  actions?: any[];
  is_active?: boolean;
}

export interface AutomationRuleExecution {
  id: number;
  rule_id: number;
  trigger_event: string;
  trigger_payload: any;
  actions_taken: any[];
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface Campaign {
  id: number;
  name: string;
  description: string | null;
  message_template: string;
  status: string;
  target_criteria: string | null;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  created_by_id: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface CampaignCreate {
  name: string;
  description?: string;
  message_template: string;
  target_criteria?: string;
}

export interface CampaignUpdate {
  name?: string;
  description?: string;
  message_template?: string;
  target_criteria?: string;
  status?: string;
}

export interface CampaignMessageResponse {
  id: number;
  campaign_id: number;
  customer_id: number;
  conversation_id: number | null;
  status: string;
  message_content: string;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface CampaignLaunch {
  customer_ids?: number[];
  dry_run: boolean;
}

export interface Attachment {
  id: number;
  conversation_id: number;
  message_id: number | null;
  uploaded_by_id: number | null;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  is_image: boolean;
  file_path: string;
  created_at: string;
}

export interface AttachmentUploadResponse {
  attachment: Attachment;
  message: string;
}


export interface GlobalNoteResponse {
  global_note: string;
  global_note_updated_at: string;
  global_note_updated_by_id: number;
  global_note_updated_by_name: string;
  mentioned_agents: string[];
}

export interface AIFlowStage {
  id: string;
  name: string;
  type: string;
  status: string;
  detail: string;
  trigger?: string;
}

export interface AIFlowConfig {
  provider: string;
  model: string;
  confidence_threshold: number;
  temperature: number;
  max_tokens: number;
  max_ai_turns: number;
  escalate_on_human_request: boolean;
  escalate_on_sensitive: boolean;
  escalate_on_uncertain: boolean;
  auto_resolve_enabled: boolean;
  suggest_replies_to_agents: boolean;
  sensitive_topics: string[];
  restricted_categories: string[];
  fallback_response: string;
  knowledge_sources: {
    faqs: boolean;
    articles: boolean;
  };
}

export interface AIFlowResponse {
  flow_enabled: boolean;
  stages: AIFlowStage[];
  config: AIFlowConfig;
}
